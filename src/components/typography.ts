import { Platform, StyleSheet } from 'react-native';

import { colors, font } from '@/theme';

export const text = StyleSheet.create({
  title: {
    color: colors.text,
    fontSize: font.title,
    fontWeight: '700',
  },
  heading: {
    color: colors.text,
    fontSize: font.heading,
    fontWeight: '600',
  },
  body: {
    color: colors.text,
    fontSize: font.body,
  },
  muted: {
    color: colors.textMuted,
    fontSize: font.body,
  },
  small: {
    color: colors.textMuted,
    fontSize: font.small,
  },
  section: {
    color: colors.textMuted,
    fontSize: font.small,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  mono: {
    color: colors.text,
    fontSize: font.mono,
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
  },
});
