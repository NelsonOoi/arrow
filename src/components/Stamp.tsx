import type { ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { colors, font, fonts, spacing } from '@/theme';

/**
 * The offset stamp: a card with a thick ink border and a solid ink block behind it, so it reads
 * as raised and stamped. Use it for at most one or two things per screen: the thing you act on,
 * or the thing that identifies you (the pair keyword and name, the current event, the active tab).
 */

type Size = 'sm' | 'md';

const OFFSET: Record<Size, number> = { sm: 3, md: 7 };
const BORDER: Record<Size, number> = { sm: 2, md: 3 };
const CORNERS: Record<Size, ViewStyle> = {
  sm: { borderTopLeftRadius: 8, borderTopRightRadius: 6, borderBottomRightRadius: 9, borderBottomLeftRadius: 5 },
  md: { borderTopLeftRadius: 14, borderTopRightRadius: 10, borderBottomRightRadius: 16, borderBottomLeftRadius: 9 },
};

type StampProps = {
  children: ReactNode;
  size?: Size;
  /** Card color. Defaults to warm paper. */
  color?: string;
  /** Shifts the card onto its shadow, for a pressed state. */
  pressed?: boolean;
  style?: StyleProp<ViewStyle>;
  cardStyle?: StyleProp<ViewStyle>;
};

export function Stamp({
  children,
  size = 'md',
  color = colors.surface,
  pressed = false,
  style,
  cardStyle,
}: StampProps) {
  const offset = OFFSET[size];
  return (
    <View style={[{ marginRight: offset, marginBottom: offset }, style]}>
      <View
        style={[
          styles.shadow,
          CORNERS[size],
          { top: offset, left: offset, right: -offset, bottom: -offset },
        ]}
      />
      <View
        style={[
          styles.card,
          size === 'sm' ? styles.cardSm : styles.cardMd,
          CORNERS[size],
          { backgroundColor: color, borderWidth: BORDER[size] },
          pressed && { transform: [{ translateX: offset }, { translateY: offset }] },
          cardStyle,
        ]}>
        {children}
      </View>
    </View>
  );
}

type StampButtonProps = {
  label: string;
  onPress: () => void;
  /** `primary` is pen red with white text: the main action. `paper` is for everything else. */
  variant?: 'primary' | 'paper';
  size?: 'md' | 'lg';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Replaces the label, e.g. to add a countdown. Keep `label` for screen readers. */
  children?: ReactNode;
  cardStyle?: StyleProp<ViewStyle>;
};

/** A stamp you press: the card slides down onto its ink shadow. Every filled button uses this. */
export function StampButton({
  label,
  onPress,
  variant = 'primary',
  size = 'lg',
  disabled = false,
  style,
  children,
  cardStyle,
}: StampButtonProps) {
  const primary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[disabled && styles.disabled, style]}>
      {({ pressed }) => (
        <Stamp
          size={size === 'lg' ? 'md' : 'sm'}
          pressed={pressed}
          color={primary ? colors.primary : colors.surface}
          cardStyle={[size === 'lg' ? styles.buttonLg : styles.buttonMd, cardStyle]}>
          {children ?? (
            <Text
              style={[
                styles.buttonLabel,
                size === 'md' && styles.buttonLabelMd,
                { color: primary ? colors.primaryText : colors.ink },
              ]}>
              {label}
            </Text>
          )}
        </Stamp>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shadow: {
    position: 'absolute',
    backgroundColor: colors.ink,
  },
  card: {
    borderColor: colors.ink,
    alignItems: 'center',
    gap: spacing.xs,
  },
  cardMd: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  cardSm: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  buttonLg: {
    minHeight: 56,
    justifyContent: 'center',
  },
  buttonMd: {
    minHeight: 42,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.5,
  },
  buttonLabel: {
    fontFamily: fonts.monoBold,
    fontSize: font.body,
    letterSpacing: 1,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  buttonLabelMd: {
    fontSize: font.small,
  },
});
