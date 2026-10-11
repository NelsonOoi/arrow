import { StyleSheet } from 'react-native';

import { colors, font, fonts } from '@/theme';

export const text = StyleSheet.create({
  title: {
    color: colors.text,
    fontFamily: fonts.display,
    fontSize: font.title,
    lineHeight: 37,
    letterSpacing: -0.7,
  },
  heading: {
    color: colors.text,
    fontFamily: fonts.display,
    fontSize: font.heading,
    lineHeight: 24,
    letterSpacing: -0.4,
  },
  body: {
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: font.body,
    lineHeight: 22,
  },
  muted: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: font.body,
    lineHeight: 22,
  },
  small: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: font.small,
    lineHeight: 19,
  },
  /** Small uppercase eyebrow. At most one per section (DESIGN.md §3). */
  section: {
    color: colors.primaryDeep,
    fontFamily: fonts.bodySemibold,
    fontSize: font.caption,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  mono: {
    color: colors.text,
    fontFamily: fonts.mono,
    fontSize: font.mono,
  },
});
