import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, sheetCorners, sheetCornersAlt, spacing } from '@/theme';

type CardProps = {
  children: ReactNode;
  /** Moss-tinted: "here", done, selected. */
  highlight?: boolean;
  /** The other hand-cut corner shape, for a sheet that sits right after another. */
  alt?: boolean;
  /** Ink sheet: dark, for the one thing on a screen that should feel heavier. */
  ink?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** A raised paper sheet with hand-cut corners (host/DESIGN.md §4). */
export function Card({ children, highlight = false, alt = false, ink = false, style }: CardProps) {
  return (
    <View
      style={[
        styles.card,
        alt ? sheetCornersAlt : sheetCorners,
        highlight && styles.highlight,
        ink && styles.ink,
        style,
      ]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    gap: spacing.sm,
  },
  highlight: {
    borderColor: colors.near,
    backgroundColor: colors.nearSurface,
  },
  ink: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
});
