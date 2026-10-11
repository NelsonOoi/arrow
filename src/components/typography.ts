import { Platform, StyleSheet } from 'react-native';

import { colors, font } from '@/theme';

export const text = StyleSheet.create({
  title: {
    color: colors.text,
    fontSize: font.title,
    lineHeight: 34,
    fontWeight: '700',
    letterSpacing: -0.6,
  },
  heading: {
    color: colors.text,
    fontSize: font.heading,
    lineHeight: 25,
    fontWeight: '600',
    letterSpacing: -0.3,
  },
  body: {
    color: colors.text,
    fontSize: font.body,
    lineHeight: 21,
  },
  muted: {
    color: colors.textMuted,
    fontSize: font.body,
    lineHeight: 21,
  },
  small: {
    color: colors.textMuted,
    fontSize: font.small,
    lineHeight: 18,
  },
  section: {
    color: colors.textMuted,
    fontSize: font.caption,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  mono: {
    color: colors.text,
    fontSize: font.mono,
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
  },
});
