/**
 * Design tokens, shared with the host web app: warm paper, ink, and one red "pen" accent.
 * Source of truth for the look is host/DESIGN.md; values mirror host/src/styles/tokens.css.
 */
export const colors = {
  /** Page ground (--paper). */
  background: '#F4EFE6',
  /** Raised sheets (--paper-raised). */
  surface: '#FBF8F2',
  /** Wells, quiet fills, pressed states (--paper-sunk). */
  surfaceRaised: '#ECE5D8',
  /** Hairlines and dividers (--rule). */
  border: '#D9D0C1',
  text: '#1E1B17',
  textSecondary: '#3A352E',
  /** --ink-soft: secondary text, 5.9:1 on paper. */
  textMuted: '#5A5248',
  /** --ink-faint: placeholders and disabled only, never body text. */
  textFaint: '#8C8376',
  /** --pen: the one accent. Primary actions, "needs you", live. */
  primary: '#C2391B',
  primaryText: '#FFFFFF',
  /** --pen-deep: pen-colored small text. */
  primaryDeep: '#9E2C12',
  /** --pen-wash: background for the one thing that needs attention. */
  primaryWash: '#F7E1D8',
  /** --marker: highlighter under ink text for "just changed". */
  marker: '#F6D86B',
  accentSurface: '#FBF8F2',
  accentBorder: '#D9D0C1',
  /** Dark text and fills drawn on top of a bright match color. */
  ink: '#1E1B17',
  inkMuted: 'rgba(30, 27, 23, 0.78)',
  inkFill: 'rgba(30, 27, 23, 0.1)',
  /** --moss: success, done, "here". */
  near: '#3F6B3A',
  nearSurface: '#E3EAD9',
  far: '#8C8376',
  /** --ochre: waiting, in progress. */
  warning: '#A86A0B',
  danger: '#C2391B',
};

/**
 * Full-screen finder colors. Brighter than the host's pair swatches on purpose: they have to be
 * spotted across a room, and all keep ink text above 6:1 contrast.
 */
export const matchPalette = [
  '#FF5A36', '#FFC233', '#4ADE80', '#38C8F0', '#FF7AB6',
  '#B69CFF', '#A3E635', '#FF9F1C', '#5EEAD4', '#FFAB91',
];

export const fonts = {
  /** Fraunces: page titles, section titles, big names. */
  display: 'Fraunces_600SemiBold',
  /** Italic display for a single emphasized word. */
  displayItalic: 'Fraunces_500Medium_Italic',
  /** Instrument Sans: everything else. */
  body: 'InstrumentSans_400Regular',
  bodyMedium: 'InstrumentSans_500Medium',
  bodySemibold: 'InstrumentSans_600SemiBold',
  /** JetBrains Mono: codes, phone numbers, timestamps. */
  mono: 'JetBrainsMono_500Medium',
  /** The pair keyword on the finder: it has to read from arm's length. */
  monoBold: 'JetBrainsMono_800ExtraBold',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const radius = {
  sm: 8,
  /** --radius-control: inputs and small controls. */
  md: 10,
  lg: 18,
  pill: 999,
};

/** --radius-sheet: slightly uneven corners so sheets look hand-cut, not stamped. */
export const sheetCorners = {
  borderTopLeftRadius: 18,
  borderTopRightRadius: 14,
  borderBottomRightRadius: 20,
  borderBottomLeftRadius: 12,
};

/** --radius-sheet-alt, for a second sheet next to the first. */
export const sheetCornersAlt = {
  borderTopLeftRadius: 14,
  borderTopRightRadius: 20,
  borderBottomRightRadius: 12,
  borderBottomLeftRadius: 18,
};

/** Type scale from DESIGN.md §3: 13 · 15 · 17 · 20 · 26 · 34 · 46. */
export const font = {
  display: 46,
  title: 34,
  heading: 20,
  headline: 17,
  body: 15,
  small: 13,
  caption: 13,
  mono: 13,
};
