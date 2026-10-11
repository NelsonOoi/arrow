import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

const DOT = 10;

export function PulseDot({ color, active }: { color: string; active: boolean }) {
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(0);

  useEffect(() => {
    if (active && !reduceMotion) {
      progress.set(withRepeat(withTiming(1, { duration: 1600, easing: Easing.out(Easing.quad) }), -1));
    } else {
      cancelAnimation(progress);
      progress.set(0);
    }
  }, [active, progress, reduceMotion]);

  const ringStyle = useAnimatedStyle(() => ({
    opacity: active ? (1 - progress.get()) * 0.6 : 0,
    transform: [{ scale: 1 + progress.get() * 1.8 }],
  }));

  return (
    <View style={styles.box} accessible={false}>
      <Animated.View style={[styles.dot, { backgroundColor: color }, ringStyle]} />
      <View style={[styles.dot, { backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    width: DOT * 2,
    height: DOT * 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    position: 'absolute',
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
  },
});
