import { requireOptionalNativeModule } from 'expo';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';

import { normalizeDeg, shortestDelta } from './sweep';

const UPDATE_MS = 33;
/** Low-pass factor per update; lower is smoother but lags more when turning. */
const SMOOTHING = 0.3;
const GRAVITY = 9.80665;
/** Fractions of g on the screen axis: flat above ENTER, tilted below EXIT, so the hint doesn't flicker. */
const FLAT_ENTER = 0.72;
const FLAT_EXIT = 0.62;

type Sensors = typeof import('expo-sensors');

function loadSensors(): Sensors | null {
  // Importing expo-sensors throws when the binary predates it, so check for the native module first.
  if (!requireOptionalNativeModule('ExponentDeviceMotion')) return null;
  return require('expo-sensors') as Sensors;
}

export type Compass = {
  /** null until the sensor check finishes. */
  available: boolean | null;
  /** Smoothed heading in degrees clockwise, unwrapped so animations never spin the long way round. */
  heading: SharedValue<number>;
  /** Latest heading in 0..360, for sampling from JS. */
  headingRef: RefObject<number>;
  /** Whether the phone is roughly flat, which the sweep needs for a stable heading. */
  flat: boolean;
};

/**
 * Heading from the fused motion sensors (magnetic-north referenced on both platforms). No permission
 * prompt, unlike location-based heading on iOS. Only the relative heading matters to the sweep.
 */
export function useCompass(): Compass {
  const heading = useSharedValue(0);
  const headingRef = useRef(0);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [flat, setFlat] = useState(true);

  useEffect(() => {
    const sensors = loadSensors();
    if (!sensors) {
      setAvailable(false);
      return;
    }
    const { DeviceMotion } = sensors;
    let cancelled = false;
    let subscription: { remove(): void } | null = null;
    let continuous: number | null = null;
    let isFlat = true;

    DeviceMotion.isAvailableAsync().then(
      (ok) => {
        if (cancelled) return;
        setAvailable(ok);
        if (!ok) return;
        DeviceMotion.setUpdateInterval(UPDATE_MS);
        subscription = DeviceMotion.addListener((m) => {
          if (!m.rotation) return;
          // alpha is radians counter-clockwise about the vertical axis on both platforms.
          const raw = normalizeDeg((-m.rotation.alpha * 180) / Math.PI);
          continuous =
            continuous === null ? raw : continuous + shortestDelta(continuous, raw) * SMOOTHING;
          heading.set(continuous);
          headingRef.current = normalizeDeg(continuous);

          const z = Math.abs(m.accelerationIncludingGravity?.z ?? GRAVITY) / GRAVITY;
          const nextFlat = isFlat ? z >= FLAT_EXIT : z >= FLAT_ENTER;
          if (nextFlat !== isFlat) {
            isFlat = nextFlat;
            setFlat(nextFlat);
          }
        });
      },
      () => {
        if (!cancelled) setAvailable(false);
      },
    );

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [heading]);

  return { available, heading, headingRef, flat };
}
