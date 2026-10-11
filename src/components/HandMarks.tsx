/** Hand-drawn marks. Decorative only. Use each at most once per view. */
import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { colors } from '@/theme';

/** Hides a decorative mark from screen readers on every platform. */
function Decorative({ children }: { children: ReactNode }) {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden>
      {children}
    </View>
  );
}

/** Scribbled underline under the active tab or the current item. */
export function Scribble({ width = 72, color = colors.primary }: { width?: number; color?: string }) {
  return (
    <Decorative>
      <Svg width={width} height={8} viewBox="0 0 120 10" preserveAspectRatio="none">
        <Path
          d="M2 6.5 C 20 3, 38 8, 58 5 S 98 3.5, 118 5.5"
          fill="none"
          stroke={color}
          strokeWidth={2.6}
          strokeLinecap="round"
        />
      </Svg>
    </Decorative>
  );
}

/** Arrow wordmark glyph: a hand-drawn ink disc with an up-right arrow. */
export function ArrowGlyph({ size = 26 }: { size?: number }) {
  return (
    <Decorative>
      <Svg width={size} height={size} viewBox="0 0 32 32">
        <Path
          d="M16 2.5 C 24 2, 30 8.5, 29.5 16.5 C 29 24, 23 29.8, 15.5 29.5 C 8 29.2, 2.3 23, 2.6 15.5 C 2.9 8, 8.5 3, 16 2.5 Z"
          fill={colors.ink}
        />
        <Path
          d="M10.5 21.5 L21 11 M13.5 10.8 H21.2 V18.5"
          stroke={colors.background}
          strokeWidth={2.6}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </Decorative>
  );
}

/** Hand-drawn arrow for inline "go there" links. */
export function ArrowRight({ color = colors.text }: { color?: string }) {
  return (
    <Decorative>
      <Svg width={18} height={18} viewBox="0 0 18 18">
        <Path
          d="M3.5 9.2 C 7 8.8, 10.5 9.1, 14 9 M10 5 L14.2 9 L10 13"
          stroke={color}
          strokeWidth={2}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </Decorative>
  );
}
