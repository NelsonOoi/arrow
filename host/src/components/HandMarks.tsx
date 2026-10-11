/**
 * Hand-drawn marks from the design guideline (DESIGN.md §4). Decorative only.
 * Use each at most once per view.
 */

/** Scribbled underline under the active nav item, current setup step or selected tab. */
export function Scribble({ color = 'var(--pen)' }: { color?: string }) {
  return (
    <svg className="scribble" viewBox="0 0 120 10" preserveAspectRatio="none" height="8" aria-hidden="true">
      <path
        d="M2 6.5 C 20 3, 38 8, 58 5 S 98 3.5, 118 5.5"
        fill="none"
        stroke={color}
        strokeWidth="2.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Loose hand-drawn circle to ring one number that needs attention. */
export function LooseCircle({ color = 'var(--pen)' }: { color?: string }) {
  return (
    <svg className="loose-circle" viewBox="0 0 120 70" preserveAspectRatio="none" aria-hidden="true">
      <path
        d="M64 6 C 30 3, 6 16, 8 36 C 10 58, 44 66, 72 63 C 100 60, 116 46, 112 28 C 108 10, 80 3, 52 8"
        fill="none"
        stroke={color}
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Arrow wordmark glyph. */
export function ArrowGlyph({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <path
        d="M16 2.5 C 24 2, 30 8.5, 29.5 16.5 C 29 24, 23 29.8, 15.5 29.5 C 8 29.2, 2.3 23, 2.6 15.5 C 2.9 8, 8.5 3, 16 2.5 Z"
        fill="var(--ink)"
      />
      <path d="M10.5 21.5 L21 11 M13.5 10.8 H21.2 V18.5" stroke="var(--paper)" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
