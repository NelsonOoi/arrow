import { useKeepAwake } from 'expo-keep-awake';
import { StatusBar } from 'expo-status-bar';
import type { ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SignalMeter } from '@/components/SignalMeter';
import { SonarArrow } from '@/components/SonarArrow';
import { Stamp } from '@/components/Stamp';
import { useSignal, type SignalInput } from '@/proximity/useSignal';
import { useRadar } from '@/store/radar';
import { colors, font, fonts, radius, spacing } from '@/theme';
import type { RadarStatus } from '@/types';

type FinderViewProps = {
  color: string;
  /** Optional line at the top. A Bluetooth problem takes this spot when there is one. */
  eyebrow?: string;
  title: string;
  instruction: string;
  signal: SignalInput;
  /** Small chip under the meter, e.g. a conversation opener. */
  note?: string;
  /**
   * The pair's passcode word. With the screen color, it's how two matched people confirm
   * they've found the right person.
   */
  keyword?: string;
  /** Small label above the name when it's shown as a stamp, e.g. "Your match". */
  nameLabel?: string;
  /** Shows a close button in the top corner. */
  onClose?: () => void;
  /** Action buttons, pinned to the bottom. */
  children?: ReactNode;
  /** Drawn above everything, e.g. a bottom sheet. */
  overlay?: ReactNode;
};

const TREND_LABELS = {
  closer: 'Getting closer',
  farther: 'Getting farther',
  steady: 'Holding steady',
} as const;

function bluetoothProblem(status: RadarStatus): string | null {
  // Browsers have no Bluetooth here; the web preview runs on a simulated signal instead.
  if (Platform.OS === 'web') return null;
  switch (status) {
    case 'denied':
      return 'Bluetooth permission needed';
    case 'poweredOff':
      return 'Turn on Bluetooth';
    case 'error':
      return 'Bluetooth error';
    default:
      return null;
  }
}

/** Full-screen color card for physically finding someone or something by signal strength. */
export function FinderView({
  color,
  eyebrow,
  title,
  instruction,
  signal,
  note,
  keyword,
  nameLabel = 'Your match',
  onClose,
  children,
  overlay,
}: FinderViewProps) {
  // The browser can refuse the wake lock; without this, releasing it throws on unmount.
  useKeepAwake(undefined, { suppressDeactivateWarnings: true });
  const status = useRadar((s) => s.status);
  const reading = useSignal(signal, { haptics: true });

  return (
    <View style={[styles.root, { backgroundColor: color }]}>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.root} edges={['top', 'left', 'right', 'bottom']}>
        <View style={styles.header}>
          {onClose ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={8}
              onPress={onClose}
              style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
              <Text style={styles.closeText}>×</Text>
            </Pressable>
          ) : null}
          {bluetoothProblem(status) ?? eyebrow ? (
            <Text style={styles.eyebrow} accessibilityRole="header">
              {bluetoothProblem(status) ?? eyebrow}
            </Text>
          ) : null}
        </View>

        {/* Keyword first: it's the thing two people say to each other across the room. */}
        {keyword ? (
          <View style={styles.keyword} accessible accessibilityLabel={`Your word is ${keyword}`}>
            <Stamp>
              <Text style={styles.stampLabel}>Your word</Text>
              <Text style={styles.keywordText} numberOfLines={1} adjustsFontSizeToFit>
                {keyword}
              </Text>
            </Stamp>
          </View>
        ) : null}

        <View style={styles.center}>
          <SonarArrow strength={reading.strength} live={reading.live} color={colors.ink} />
          {/* With a keyword, the name gets the matching stamp so the two read as one passcode. */}
          {keyword ? (
            <Stamp>
              <Text style={styles.stampLabel}>{nameLabel}</Text>
              <Text style={styles.nameText} numberOfLines={1} adjustsFontSizeToFit>
                {title}
              </Text>
            </Stamp>
          ) : (
            <Text style={styles.title} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7}>
              {title}
            </Text>
          )}
          <Text style={styles.instruction}>{instruction}</Text>

          <View style={styles.readout} accessibilityLiveRegion="polite">
            <SignalMeter
              strength={reading.strength}
              color={colors.ink}
              trackColor={colors.inkFill}
              bars={16}
              height={40}
              stretch
            />
            <View style={styles.readoutRow}>
              <Text style={styles.level}>
                {reading.live ? reading.level.label : 'Searching for signal…'}
              </Text>
              {reading.live ? (
                <Text style={styles.trend}>{TREND_LABELS[reading.trend]}</Text>
              ) : null}
            </View>
          </View>

          {note ? (
            <View style={styles.note}>
              <Text style={styles.noteText}>{note}</Text>
            </View>
          ) : null}
        </View>

        {children ? <View style={styles.actions}>{children}</View> : null}
      </SafeAreaView>
      {overlay}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    minHeight: 44,
    marginTop: spacing.sm,
    justifyContent: 'center',
  },
  close: {
    position: 'absolute',
    left: spacing.md,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    zIndex: 1,
  },
  pressed: {
    backgroundColor: colors.inkFill,
  },
  closeText: {
    color: colors.ink,
    fontFamily: fonts.body,
    fontSize: 32,
    lineHeight: 34,
  },
  keyword: {
    alignItems: 'center',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  stampLabel: {
    color: colors.inkMuted,
    fontFamily: fonts.bodySemibold,
    fontSize: font.caption,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  keywordText: {
    color: colors.ink,
    fontFamily: fonts.monoBold,
    fontSize: 52,
    lineHeight: 60,
    letterSpacing: 4,
  },
  nameText: {
    color: colors.ink,
    fontFamily: fonts.monoBold,
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  eyebrow: {
    textAlign: 'center',
    color: colors.inkMuted,
    fontFamily: fonts.bodySemibold,
    fontSize: font.caption,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  title: {
    color: colors.ink,
    fontFamily: fonts.display,
    fontSize: font.title,
    lineHeight: 38,
    letterSpacing: -1,
    textAlign: 'center',
  },
  instruction: {
    maxWidth: 300,
    color: colors.inkMuted,
    fontFamily: fonts.body,
    fontSize: font.headline,
    lineHeight: 23,
    textAlign: 'center',
  },
  readout: {
    width: '100%',
    maxWidth: 340,
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  readoutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: spacing.md,
  },
  level: {
    color: colors.ink,
    fontFamily: fonts.bodySemibold,
    fontSize: font.body,
  },
  trend: {
    color: colors.inkMuted,
    fontFamily: fonts.body,
    fontSize: font.small,
  },
  note: {
    maxWidth: 320,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.inkFill,
  },
  noteText: {
    color: colors.ink,
    fontFamily: fonts.body,
    fontSize: font.small,
    lineHeight: 18,
    textAlign: 'center',
  },
  actions: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
});
