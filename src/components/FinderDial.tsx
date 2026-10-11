import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useFrameCallback,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { BIN_DEG } from '@/proximity/sweep';

const SIZE = 132;
const PULSE_SIZE = 96;
const TICK_RADIUS = SIZE / 2 - 6;
const RING_OFFSETS = [0, 0.5];

type FinderDialProps = {
  /** 0..1; pulses speed up as it rises. */
  strength: number;
  /** False while there's no live signal: pulses slow down and dim. */
  live: boolean;
  color: string;
  /** Smoothed compass heading in degrees, unwrapped. */
  heading: SharedValue<number>;
  /** Shows the progress ring, one entry per compass bin. */
  covered: boolean[] | null;
  /** When set, the arrow turns to point here and a marker sits on the ring. */
  bearing: number | null;
};

function wrap180(deg: number): number {
  'worklet';
  return ((((deg + 180) % 360) + 360) % 360) - 180;
}

export function FinderDial({ strength, live, color, heading, covered, bearing }: FinderDialProps) {
  const reduceMotion = useReducedMotion();
  const phase = useSharedValue(0);
  const cyclesPerSecond = useSharedValue(0.3);
  const intensity = useSharedValue(live ? 1 : 0.4);
  const target = useSharedValue(bearing ?? 0);
  const pointing = useSharedValue(bearing === null ? 0 : 1);

  useEffect(() => {
    cyclesPerSecond.set(withTiming(live ? 0.35 + strength * 1.4 : 0.3, { duration: 600 }));
    intensity.set(withTiming(live ? 1 : 0.4, { duration: 600 }));
  }, [cyclesPerSecond, intensity, live, strength]);

  useEffect(() => {
    if (bearing !== null) target.set(bearing);
    pointing.set(withTiming(bearing === null ? 0 : 1, { duration: reduceMotion ? 0 : 500 }));
  }, [bearing, pointing, reduceMotion, target]);

  // Integrating speed into phase (instead of restarting a repeat animation) keeps the rings
  // continuous when the speed changes several times a second.
  useFrameCallback((frame) => {
    const dt = (frame.timeSincePreviousFrame ?? 16) / 1000;
    phase.set((phase.get() + dt * cyclesPerSecond.get()) % 1);
  }, !reduceMotion);

  const arrowStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${pointing.get() * wrap180(target.get() - heading.get())}deg` }],
  }));

  // Counter-rotating by the heading pins the ring to the room, so ticks stay put as you turn.
  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${-heading.get()}deg` }],
  }));

  const showRing = covered !== null || bearing !== null;

  return (
    <View style={styles.box} accessible={false} importantForAccessibility="no-hide-descendants">
      {reduceMotion
        ? null
        : RING_OFFSETS.map((offset) => (
            <Pulse key={offset} offset={offset} phase={phase} intensity={intensity} color={color} />
          ))}

      {showRing ? (
        <Animated.View style={[StyleSheet.absoluteFill, ringStyle]}>
          {covered
            ? covered.map((done, i) => (
                <Tick key={i} angle={(i + 0.5) * BIN_DEG} color={color} filled={done} />
              ))
            : null}
          {bearing !== null && covered === null ? <Marker angle={bearing} color={color} /> : null}
        </Animated.View>
      ) : null}

      <Animated.View style={[styles.arrowBox, arrowStyle]}>
        <Text style={[styles.arrow, { color }]}>↑</Text>
      </Animated.View>
    </View>
  );
}

function Pulse({
  offset,
  phase,
  intensity,
  color,
}: {
  offset: number;
  phase: SharedValue<number>;
  intensity: SharedValue<number>;
  color: string;
}) {
  const style = useAnimatedStyle(() => {
    const p = (phase.get() + offset) % 1;
    return {
      opacity: (1 - p) * 0.45 * intensity.get(),
      transform: [{ scale: 0.55 + p * 1.1 }],
    };
  });
  return <Animated.View style={[styles.pulse, { borderColor: color }, style]} />;
}

function Tick({ angle, color, filled }: { angle: number; color: string; filled: boolean }) {
  return (
    <View style={[styles.spoke, { transform: [{ rotate: `${angle}deg` }] }]}>
      <View style={[styles.tick, { backgroundColor: color, opacity: filled ? 1 : 0.18 }]} />
    </View>
  );
}

function Marker({ angle, color }: { angle: number; color: string }) {
  return (
    <View style={[styles.spoke, { transform: [{ rotate: `${angle}deg` }] }]}>
      <View style={[styles.marker, { backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    width: SIZE,
    height: SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulse: {
    position: 'absolute',
    width: PULSE_SIZE,
    height: PULSE_SIZE,
    borderRadius: PULSE_SIZE / 2,
    borderWidth: 2,
  },
  // A full-size layer rotated about the dial's centre; children sit at its top edge.
  spoke: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
  },
  tick: {
    marginTop: SIZE / 2 - TICK_RADIUS - 4,
    width: 3,
    height: 9,
    borderRadius: 1.5,
  },
  marker: {
    marginTop: SIZE / 2 - TICK_RADIUS - 5,
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  arrowBox: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrow: {
    textAlign: 'center',
    fontSize: 44,
    lineHeight: 52,
    fontWeight: '500',
  },
});
