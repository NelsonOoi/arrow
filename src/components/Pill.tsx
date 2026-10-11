import { StyleSheet, Text, View } from 'react-native';

import { colors, font, radius, spacing } from '@/theme';

type Tone = 'near' | 'primary' | 'muted' | 'warning' | 'danger';

const toneColors: Record<Tone, string> = {
  near: colors.near,
  primary: colors.primary,
  muted: colors.far,
  warning: colors.warning,
  danger: colors.danger,
};

export function Pill({ label, tone = 'muted' }: { label: string; tone?: Tone }) {
  const color = toneColors[tone];
  return (
    <View style={[styles.pill, { borderColor: color }]}>
      <Text style={[styles.label, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  label: {
    fontSize: font.small,
    fontWeight: '600',
  },
});
