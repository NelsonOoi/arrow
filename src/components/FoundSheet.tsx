import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { StampButton } from '@/components/Stamp';
import { colors, font, fonts, spacing } from '@/theme';

type FoundSheetProps = {
  name: string;
  /** When the countdown runs out, `onFound` fires on its own. */
  durationMs: number;
  onFound: () => void;
  onNotYet: () => void;
};

const SLIDE_MS = 280;
const OFFSCREEN = 420;

/**
 * Slides up from the bottom once the signal is really strong. "Found" is highlighted and drains
 * right to left like a fuse: if nobody taps anything, we assume the two found each other.
 */
export function FoundSheet({ name, durationMs, onFound, onNotYet }: FoundSheetProps) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const offset = useSharedValue(reduceMotion ? 0 : OFFSCREEN);
  const fuse = useSharedValue(1);
  const [startedAt] = useState(() => Date.now());

  useEffect(() => {
    offset.set(withTiming(0, { duration: SLIDE_MS, easing: Easing.out(Easing.cubic) }));
    fuse.set(withTiming(0, { duration: durationMs, easing: Easing.linear }));
  }, [durationMs, fuse, offset]);

  useEffect(() => {
    const id = setTimeout(onFound, durationMs);
    return () => clearTimeout(id);
  }, [durationMs, onFound]);

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: offset.get() }] }));
  const fuseStyle = useAnimatedStyle(() => ({ width: `${fuse.get() * 100}%` }));

  return (
    <Animated.View
      style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }, sheetStyle]}
      accessibilityViewIsModal
      accessibilityLiveRegion="assertive">
      <View style={styles.handle} />
      <Text style={styles.title}>Found {name}?</Text>
      <Text style={styles.detail}>
        Your signals are right next to each other. We’ll count it as found unless you tap Not yet.
      </Text>

      <StampButton label={`Found ${name}`} onPress={onFound} cardStyle={styles.found}>
        {/* The fuse: a lighter band whose right edge slides left as time runs out. */}
        <Animated.View style={[styles.fuse, fuseStyle]} />
        <Text style={styles.foundLabel}>Found ✓</Text>
        <Countdown startedAt={startedAt} ms={durationMs} />
      </StampButton>
      <Button size="lg" variant="secondary" label="Not yet" onPress={onNotYet} />
    </Animated.View>
  );
}

function Countdown({ startedAt, ms }: { startedAt: number; ms: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, []);
  const seconds = Math.max(0, Math.ceil((startedAt + ms - now) / 1000));
  return <Text style={styles.countdown}>{seconds}s</Text>;
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    gap: spacing.md,
    paddingTop: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 20,
    shadowColor: '#3C2814',
    shadowOpacity: 0.28,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: -6 },
    elevation: 16,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: spacing.xs,
  },
  title: {
    color: colors.text,
    fontFamily: fonts.display,
    fontSize: 28,
    letterSpacing: -0.6,
  },
  detail: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: font.body,
    lineHeight: 22,
    marginBottom: spacing.xs,
  },
  found: {
    overflow: 'hidden',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.md,
  },
  fuse: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
  },
  foundLabel: {
    color: colors.primaryText,
    fontFamily: fonts.monoBold,
    fontSize: font.body,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  countdown: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontFamily: fonts.mono,
    fontSize: font.headline,
  },
});
