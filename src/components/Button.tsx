import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { colors, font, radius, spacing } from '@/theme';

/** `ink` and `inkSoft` are for screens filled with a bright match color. */
type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'ink' | 'inkSoft';

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: Variant;
  size?: 'md' | 'lg';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

const backgrounds: Record<Variant, string> = {
  primary: colors.primary,
  secondary: colors.surfaceRaised,
  danger: colors.danger,
  ghost: 'transparent',
  ink: colors.ink,
  inkSoft: colors.inkFill,
};

const labelColors: Record<Variant, string> = {
  primary: colors.primaryText,
  secondary: colors.text,
  danger: colors.ink,
  ghost: colors.textMuted,
  ink: colors.text,
  inkSoft: colors.ink,
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  style,
}: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        size === 'lg' && styles.large,
        { backgroundColor: backgrounds[variant] },
        disabled && styles.disabled,
        pressed && styles.pressed,
        style,
      ]}>
      <Text
        style={[styles.label, size === 'lg' && styles.largeLabel, { color: labelColors[variant] }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  large: {
    minHeight: 56,
    paddingHorizontal: spacing.xl,
  },
  disabled: {
    opacity: 0.4,
  },
  pressed: {
    opacity: 0.75,
  },
  label: {
    fontSize: font.body,
    fontWeight: '600',
  },
  largeLabel: {
    fontSize: font.headline,
  },
});
