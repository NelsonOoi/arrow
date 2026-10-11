import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { StampButton } from '@/components/Stamp';
import { colors, font, fonts, spacing } from '@/theme';

/**
 * Every filled button is an offset stamp, so buttons look the same across the app:
 *   primary   -> pen red stamp, white text. The main action on a screen.
 *   secondary -> paper stamp.
 *   danger    -> pen red stamp, for destructive actions.
 *   ghost     -> quiet underlined text, for links like "Not now".
 *   ink / inkSoft -> plain pills for screens filled with a bright match color.
 */
type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'ink' | 'inkSoft';

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: Variant;
  size?: 'md' | 'lg';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

type PillVariant = 'ghost' | 'ink' | 'inkSoft';

const backgrounds: Record<PillVariant, string> = {
  ghost: 'transparent',
  ink: colors.ink,
  inkSoft: colors.inkFill,
};

const labelColors: Record<PillVariant, string> = {
  ghost: colors.text,
  ink: colors.surface,
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
  if (variant === 'primary' || variant === 'secondary' || variant === 'danger') {
    return (
      <StampButton
        label={label}
        onPress={onPress}
        variant={variant === 'secondary' ? 'paper' : 'primary'}
        size={size}
        disabled={disabled}
        style={style}
      />
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        size === 'lg' && styles.large,
        variant === 'ghost' && styles.quiet,
        { backgroundColor: backgrounds[variant] },
        disabled && styles.disabled,
        pressed && styles.pressed,
        style,
      ]}>
      <Text
        style={[
          styles.label,
          size === 'lg' && styles.largeLabel,
          variant === 'ghost' && styles.quietLabel,
          { color: labelColors[variant] },
        ]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 44,
    paddingHorizontal: spacing.xl,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  large: {
    minHeight: 54,
    paddingHorizontal: spacing.xxl,
  },
  quiet: {
    minHeight: 36,
    paddingHorizontal: spacing.xs,
    alignSelf: 'center',
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.7,
  },
  label: {
    fontFamily: fonts.bodySemibold,
    fontSize: font.body,
  },
  largeLabel: {
    fontSize: font.headline,
  },
  quietLabel: {
    fontFamily: fonts.bodyMedium,
    textDecorationLine: 'underline',
  },
});
