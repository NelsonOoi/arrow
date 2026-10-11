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

const SIZE = 96;
const RING_OFFSETS = [0, 0.5];

type SonarArrowProps = {
  /** 0..1; pulses speed up as it rises. */
  strength: number;
  /** False while there's no live signal: pulses slow down and dim. */
  live: boolean;
  color: string;
};

export function SonarArrow({ strength, live, color }: SonarArrowProps) {
  const reduceMotion = useReducedMotion();
  const phase = useSharedValue(0);
  const cyclesPerSecond = useSharedValue(0.3);
  const intensity = useSharedValue(live ? 1 : 0.4);

  useEffect(() => {
    cyclesPerSecond.set(withTiming(live ? 0.35 + strength * 1.4 : 0.3, { duration: 600 }));
    intensity.set(withTiming(live ? 1 : 0.4, { duration: 600 }));
  }, [cyclesPerSecond, intensity, live, strength]);

  // Integrating speed into phase (instead of restarting a repeat animation) keeps the rings
  // continuous when the speed changes several times a second.
  useFrameCallback((frame) => {
    const dt = (frame.timeSincePreviousFrame ?? 16) / 1000;
    phase.set((phase.get() + dt * cyclesPerSecond.get()) % 1);
  }, !reduceMotion);

  return (
    <View style={styles.box} accessible={false} importantForAccessibility="no-hide-descendants">
      {reduceMotion
        ? null
        : RING_OFFSETS.map((offset) => (
            <Ring key={offset} offset={offset} phase={phase} intensity={intensity} color={color} />
          ))}
      <Text style={[styles.arrow, { color }]}>↑</Text>
    </View>
  );
}

type RingProps = {
  offset: number;
  phase: SharedValue<number>;
  intensity: SharedValue<number>;
  color: string;
};

function Ring({ offset, phase, intensity, color }: RingProps) {
  const style = useAnimatedStyle(() => {
    const p = (phase.get() + offset) % 1;
    return {
      opacity: (1 - p) * 0.45 * intensity.get(),
      transform: [{ scale: 0.55 + p * 1.1 }],
    };
  });
  return <Animated.View style={[styles.ring, { borderColor: color }, style]} />;
}

const styles = StyleSheet.create({
  box: {
    width: SIZE,
    height: SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: 2,
  },
  arrow: {
    fontSize: 44,
    lineHeight: 52,
    fontWeight: '500',
  },
});
