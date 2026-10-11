import { Linking, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { colors, font, fonts, radius, spacing } from '@/theme';
import type { RadarStatus } from '@/types';

export function statusMessage(status: RadarStatus, error: string | null): string {
  switch (status) {
    case 'idle':
      return 'Not scanning';
    case 'starting':
      return 'Starting Bluetooth…';
    case 'running':
      return 'Scanning for your matches';
    case 'denied':
      return 'Bluetooth permission denied — enable it in Settings';
    case 'poweredOff':
      return 'Turn on Bluetooth to find matches';
    case 'error':
      return error ?? 'Something went wrong with Bluetooth';
  }
}

const accents: Record<RadarStatus, string> = {
  idle: colors.far,
  starting: colors.warning,
  running: colors.near,
  denied: colors.danger,
  poweredOff: colors.warning,
  error: colors.danger,
};

export function StatusBanner({ status, error }: { status: RadarStatus; error: string | null }) {
  return (
    <View style={[styles.banner, { borderLeftColor: accents[status] }]}>
      <Text style={styles.text}>{statusMessage(status, error)}</Text>
      {status === 'denied' ? (
        <Button label="Open Settings" variant="secondary" onPress={() => Linking.openSettings()} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderLeftWidth: 4,
    padding: spacing.lg,
    gap: spacing.md,
  },
  text: {
    color: colors.text,
    fontFamily: fonts.bodyMedium,
    fontSize: font.body,
  },
});
