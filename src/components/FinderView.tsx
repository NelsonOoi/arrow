import { useKeepAwake } from 'expo-keep-awake';
import { StatusBar } from 'expo-status-bar';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { FinderDial } from '@/components/FinderDial';
import { SignalMeter } from '@/components/SignalMeter';
import { useCompass } from '@/proximity/useCompass';
import { useDirectionSweep, type SweepPhase } from '@/proximity/useDirectionSweep';
import { useSignal, type SignalInput } from '@/proximity/useSignal';
import { useRadar } from '@/store/radar';
import { colors, font, radius, spacing } from '@/theme';
import type { RadarStatus } from '@/types';

type FinderViewProps = {
  color: string;
  /** Shown at the top unless Bluetooth itself needs attention. */
  eyebrow: string;
  title: string;
  instruction: string;
  signal: SignalInput;
  /** Small chip under the meter, e.g. a conversation opener. */
  note?: string;
  /** Action buttons, pinned to the bottom. */
  children: ReactNode;
};

const TREND_LABELS = {
  closer: 'Getting closer',
  farther: 'Getting farther',
  steady: 'Holding steady',
} as const;

const SWEEP_BUTTON_LABELS: Record<SweepPhase, string> = {
  idle: 'Find direction',
  sweeping: 'Cancel',
  found: 'Scan again',
  unsure: 'Try again',
};

function sweepInstruction(phase: SweepPhase, live: boolean, flat: boolean): string | null {
  switch (phase) {
    case 'sweeping':
      if (!live) return 'Waiting for a signal. Stay put for a moment.';
      if (!flat) return 'Hold your phone flat, screen up, and keep turning.';
      return 'Hold your phone flat in front of your chest and turn slowly in a full circle.';
    case 'found':
      return 'Walk where the arrow points. Scan again if the signal fades.';
    case 'unsure':
      return "Couldn't tell which way. Try again from a more open spot, turning slowly.";
    default:
      return null;
  }
}

function bluetoothProblem(status: RadarStatus): string | null {
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
  children,
}: FinderViewProps) {
  useKeepAwake();
  const status = useRadar((s) => s.status);
  const reading = useSignal(signal, { haptics: true });
  const compass = useCompass();
  const sweep = useDirectionSweep(
    signal ? { rssi: signal.rawRssi ?? signal.rssi, lastSeen: signal.lastSeen } : undefined,
    compass.headingRef,
  );
  const sweeping = sweep.phase === 'sweeping';

  return (
    <View style={[styles.root, { backgroundColor: color }]}>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.root} edges={['top', 'left', 'right', 'bottom']}>
        <Text style={styles.eyebrow} accessibilityRole="header">
          {bluetoothProblem(status) ?? eyebrow}
        </Text>

        <View style={styles.center}>
          <FinderDial
            strength={reading.strength}
            live={reading.live}
            color={colors.ink}
            heading={compass.heading}
            covered={sweeping ? sweep.covered : null}
            bearing={sweep.phase === 'found' ? sweep.bearing : null}
          />
          <Text style={styles.title} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7}>
            {title}
          </Text>
          <Text style={styles.instruction} accessibilityLiveRegion="polite">
            {sweepInstruction(sweep.phase, reading.live, compass.flat) ?? instruction}
          </Text>

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

          {compass.available ? (
            <Button
              label={SWEEP_BUTTON_LABELS[sweep.phase]}
              variant="inkSoft"
              onPress={sweeping ? sweep.cancel : sweep.start}
              style={styles.sweepButton}
            />
          ) : null}

          {note && !sweeping ? (
            <View style={styles.note}>
              <Text style={styles.noteText}>{note}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.actions}>{children}</View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  eyebrow: {
    marginTop: spacing.lg,
    textAlign: 'center',
    color: colors.inkMuted,
    fontSize: font.caption,
    fontWeight: '700',
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
    fontSize: font.display,
    lineHeight: 50,
    fontWeight: '700',
    letterSpacing: -1,
    textAlign: 'center',
  },
  instruction: {
    maxWidth: 300,
    color: colors.inkMuted,
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
    fontSize: font.body,
    fontWeight: '700',
  },
  trend: {
    color: colors.inkMuted,
    fontSize: font.small,
  },
  sweepButton: {
    minWidth: 180,
    marginTop: spacing.xs,
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
