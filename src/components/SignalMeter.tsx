import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';

type SignalMeterProps = {
  /** 0..1 */
  strength: number;
  color: string;
  trackColor: string;
  bars?: number;
  height?: number;
  /** Spread bars across the parent's width instead of using fixed-width bars. */
  stretch?: boolean;
};

const SPRING = { damping: 18, stiffness: 170, mass: 0.6 };

export function SignalMeter({
  strength,
  color,
  trackColor,
  bars = 8,
  height = 20,
  stretch = false,
}: SignalMeterProps) {
  const level = useSharedValue(strength);

  useEffect(() => {
    level.set(withSpring(strength, SPRING));
  }, [level, strength]);

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Signal strength"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(strength * 100) }}
      style={[styles.row, { height, gap: stretch ? 4 : 3 }, stretch && styles.stretch]}>
      {Array.from({ length: bars }, (_, i) => (
        <Bar
          key={i}
          index={i}
          count={bars}
          level={level}
          color={color}
          trackColor={trackColor}
          height={height * (0.3 + 0.7 * ((i + 1) / bars))}
          stretch={stretch}
        />
      ))}
    </View>
  );
}

type BarProps = {
  index: number;
  count: number;
  level: SharedValue<number>;
  color: string;
  trackColor: string;
  height: number;
  stretch: boolean;
};

function Bar({ index, count, level, color, trackColor, height, stretch }: BarProps) {
  // Each bar fades in over its own slice of the range, so the meter sweeps instead of stepping.
  const fillStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, Math.max(0, level.get() * count - index)),
  }));

  return (
    <View
      style={[
        styles.bar,
        stretch ? styles.barStretch : styles.barFixed,
        { height, backgroundColor: trackColor },
      ]}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: color }, fillStyle]} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  stretch: {
    alignSelf: 'stretch',
  },
  bar: {
    borderRadius: 2,
    overflow: 'hidden',
  },
  barFixed: {
    width: 4,
  },
  barStretch: {
    flex: 1,
  },
});
