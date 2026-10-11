import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius, spacing } from '@/theme';

type CardProps = {
  children: ReactNode;
  highlight?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Card({ children, highlight = false, style }: CardProps) {
  return <View style={[styles.card, highlight && styles.highlight, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  highlight: {
    borderColor: colors.near,
    backgroundColor: '#12291F',
  },
});
