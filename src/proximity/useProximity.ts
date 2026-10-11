import { useEffect, useRef } from 'react';

import {
  ALERT_COOLDOWN_MS,
  HYSTERESIS_DB,
  SMOOTHING_WINDOW,
  STALE_MS,
  TICK_MS,
} from '@/ble/constants';
import { startPresence, stopPresence } from '@/ble/peripheral';
import { ensureBluetoothReady, onAdapterPoweredChange } from '@/ble/permissions';
import { startScanning, stopScanning } from '@/ble/scanner';
import { getMatches, getUserById } from '@/data/users';
import { vibrateProximityAlert } from '@/haptics/alert';
import { useRadar } from '@/store/radar';
import { useSession } from '@/store/session';
import type { DeviceSighting, NearbyDevice, ProximityConfig, Sighting } from '@/types';

import { pruneDevices, recordDevice } from './devices';
import { initialEngineState, reduce, type EngineEvent } from './engine';

/** Minimum interval between peer writes to `useRadar`; sightings can arrive many times per second. */
export const PEER_FLUSH_MS = 250;

/**
 * Mount once (in the tabs layout). While `useSession().scanning` is true and a user is selected,
 * runs BLE presence + scanning, feeds the engine, writes results to `useRadar`, and vibrates on alerts.
 */
export function useProximity(): void {
  const currentUserId = useSession((s) => s.currentUserId);
  const scanning = useSession((s) => s.scanning);
  const threshold = useSession((s) => s.threshold);
  const scanAllDevices = useSession((s) => s.scanAllDevices);

  const activeUserId = scanning && getUserById(currentUserId) ? currentUserId : null;

  const engineRef = useRef(initialEngineState());
  const thresholdRef = useRef(threshold);

  useEffect(() => {
    thresholdRef.current = threshold;
  }, [threshold]);

  useEffect(() => {
    const user = getUserById(activeUserId);
    if (!user) return;

    const radar = useRadar.getState();
    const matchTokens: ReadonlySet<string> = new Set(getMatches(user).map((m) => m.token));
    const buildConfig = (): ProximityConfig => ({
      threshold: thresholdRef.current,
      hysteresis: HYSTERESIS_DB,
      windowSize: SMOOTHING_WINDOW,
      cooldownMs: ALERT_COOLDOWN_MS,
      staleMs: STALE_MS,
      matchTokens,
    });

    let cancelled = false;
    let denied = false;
    let bleRunning = false;
    let unsubscribeAdapter: (() => void) | null = null;
    let tickTimer: ReturnType<typeof setInterval> | null = null;
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    let lastFlushAt = 0;

    engineRef.current = initialEngineState();
    let flushedPeers = engineRef.current.peers;
    // Mutated in place per advertisement; only copied into the store on flush.
    const devices = new Map<string, NearbyDevice>();
    let devicesDirty = false;

    const flushPeers = () => {
      if (flushTimer !== null) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      lastFlushAt = Date.now();
      const { peers } = engineRef.current;
      if (peers !== flushedPeers) {
        flushedPeers = peers;
        radar.setPeers(peers);
      }
      if (devicesDirty) {
        devicesDirty = false;
        radar.setDevices(Object.fromEntries(devices));
      }
    };

    const scheduleFlush = () => {
      if (flushTimer !== null) return;
      const wait = PEER_FLUSH_MS - (Date.now() - lastFlushAt);
      if (wait <= 0) {
        flushPeers();
      } else {
        flushTimer = setTimeout(flushPeers, wait);
      }
    };

    const dispatch = (event: EngineEvent) => {
      const { state, alerts } = reduce(engineRef.current, event, Date.now(), buildConfig());
      engineRef.current = state;
      if (alerts.length > 0) {
        radar.pushAlerts(alerts);
        vibrateProximityAlert().catch(() => {});
      }
      return alerts.length > 0;
    };

    const onSighting = (sighting: Sighting) => {
      if (cancelled) return;
      if (dispatch({ type: 'sighting', sighting })) {
        flushPeers();
      } else {
        scheduleFlush();
      }
    };

    const onDevice = (sighting: DeviceSighting) => {
      if (cancelled) return;
      if (recordDevice(devices, sighting, SMOOTHING_WINDOW)) {
        devicesDirty = true;
        scheduleFlush();
      }
    };

    const onError = (message: string) => {
      if (cancelled) return;
      radar.setStatus('error', message);
    };

    const stopBle = () => {
      bleRunning = false;
      try {
        stopScanning();
      } catch {}
      try {
        stopPresence();
      } catch {}
    };

    const startBle = () => {
      if (cancelled || bleRunning) return;
      radar.setStatus('starting');
      bleRunning = true;
      try {
        startPresence(user.token);
        startScanning(onSighting, onError, {
          allDevices: scanAllDevices,
          onDevice: scanAllDevices ? onDevice : undefined,
        });
      } catch (e) {
        stopBle();
        radar.setStatus('error', errorMessage(e));
        return;
      }
      // startScanning may have reported an error synchronously; don't overwrite it.
      if (useRadar.getState().status === 'starting') {
        radar.setStatus('running');
      }
    };

    const onPoweredChange = (poweredOn: boolean) => {
      if (cancelled) return;
      if (poweredOn) {
        startBle();
      } else {
        if (bleRunning) stopBle();
        radar.setStatus('poweredOff');
      }
    };

    radar.setStatus('starting');
    ensureBluetoothReady().then(
      (readiness) => {
        if (cancelled) return;
        if (readiness === 'denied') {
          denied = true;
          radar.setStatus('denied');
          useSession.getState().setScanning(false);
          return;
        }
        tickTimer = setInterval(() => {
          if (cancelled) return;
          dispatch({ type: 'tick' });
          if (pruneDevices(devices, Date.now(), STALE_MS)) devicesDirty = true;
          flushPeers();
        }, TICK_MS);
        if (readiness === 'granted') {
          startBle();
        } else {
          radar.setStatus('poweredOff');
        }
        unsubscribeAdapter = onAdapterPoweredChange(onPoweredChange);
      },
      (e: unknown) => {
        if (cancelled) return;
        radar.setStatus('error', errorMessage(e));
      },
    );

    return () => {
      cancelled = true;
      unsubscribeAdapter?.();
      if (tickTimer !== null) clearInterval(tickTimer);
      if (flushTimer !== null) clearTimeout(flushTimer);
      if (bleRunning) stopBle();
      engineRef.current = initialEngineState();
      useRadar.getState().reset();
      // Denial turns scanning off, which lands here; keep the status so the UI can explain why.
      if (denied) useRadar.getState().setStatus('denied');
    };
  }, [activeUserId, scanAllDevices]);
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
