# Arrow host — design guideline

The host web app is where an event organizer imports a Partiful event, signs off
on what Arrow's voice agent will ask guests, and watches matches happen live.
This document is the source of truth for how it looks and feels. Tokens live in
`src/styles/tokens.css`; every rule below maps to something there.

## 1. The feeling: a host's notebook, not a SaaS console

Arrow is about people meeting in a room. The host app should feel like the
clipboard a good host carries around a party — warm paper, ink, a red pen for
the things that need attention — not a grid of identical cards.

What that means in practice:

| Do | Don't |
|---|---|
| Warm paper ground with a faint grain | Flat grey `#F5F5F5` or pure white pages |
| Ink-black text and rules; one red "pen" accent | Rainbow status colors, gradients, glows |
| Content separated by rules and whitespace | Every block wrapped in a bordered card |
| Asymmetric layouts: one big thing, a few small things | 3- or 4-up grids of identical stat tiles |
| Numbers set inside sentences ("**26** of 48 are here") | KPI tiles with a label on top and a big number |
| A hand-drawn underline or circle to mark "you are here" | Filled pill backgrounds for every active state |
| Marker highlight for "just changed" | Blue info banners |
| Sentence case, plain words, the host's point of view | Title Case, jargon ("Intake pipeline") |

## 2. Color

Built on the mockup palette, warmed up.

| Token | Hex | Use |
|---|---|---|
| `--paper` | `#F4EFE6` | Page ground |
| `--paper-raised` | `#FBF8F2` | Raised sheets: inputs, the chat, the plan list |
| `--paper-sunk` | `#ECE5D8` | Wells, quiet fills, hover |
| `--ink` | `#1E1B17` | Text, rules, primary dark surfaces |
| `--ink-soft` | `#5A5248` | Secondary text (5.9:1 on paper) |
| `--ink-faint` | `#8C8376` | Placeholders, disabled — never body text |
| `--rule` | `#D9D0C1` | Hairlines and dividers |
| `--pen` | `#C2391B` | The one accent: primary actions, "needs you", live |
| `--pen-deep` | `#9E2C12` | Pen on hover; pen-colored small text |
| `--marker` | `#F6D86B` | Highlighter for "just changed" (always under ink text) |
| `--moss` | `#3F6B3A` | Success / done / "here" |
| `--ochre` | `#A86A0B` | Waiting, retrying, in progress |
| `--indigo` | `#2F3C8F` | Guided / on the way |

Pair colors (the color half of a matched pair's passcode) are their own set:
`--pair-teal #17867F`, `--pair-amber #D49413`, `--pair-violet #6A4BC9`,
`--pair-blue #2B55C8`, `--pair-rose #BC3F73`, `--pair-moss #4D8A3A`. They only
ever appear as a swatch next to the pair's keyword — never as UI chrome.

Rule of thumb: a screen should be ~90% paper and ink. If you see more than two
things in pen red at once, one of them is wrong.

## 3. Type

| Role | Font | Notes |
|---|---|---|
| Display | **Fraunces** (soft, 600) | Page titles, section titles, big numerals. Italic for a single emphasized word. |
| Body / UI | **Instrument Sans** (400/500/600) | Everything else. 15px base, 1.5 line height. |
| Codes | **JetBrains Mono** (500) | Pair keywords, phone digits, links, timestamps. Uppercase keywords get 0.06em tracking. |

Scale (px): 13 · 15 · 17 · 20 · 26 · 34 · 46. Titles use `--font-display` with
`letter-spacing: -0.02em`. Never set body text below 13px.

Small uppercase "eyebrow" labels are allowed once per section at most.

## 4. Shape and line

- **Hand-cut corners.** Raised sheets use the slightly uneven radius
  `--radius-sheet` (e.g. `18px 14px 20px 12px`) so nothing looks stamped out of a
  component library. Controls (inputs, buttons) use plain `--radius-control: 10px`.
- **Rules over boxes.** Prefer a `1px solid var(--rule)` divider, or the dashed
  `--rule-hand` divider, over a border on all four sides.
- **Ink shadow, not blur.** Elevated things (open dropdowns, the chat) get
  `--shadow-lift` — a soft, low, warm shadow. No glows.
- **Hand marks.** Two SVG marks live in `components/HandMarks.tsx`: a scribbled
  underline (active nav item, current setup step) and a loose circle (to ring a
  number that needs attention). Use each at most once per view.

## 5. Layout

- Left rail (220px) with the wordmark and two links: **Events**, **Settings**. On
  narrow screens it becomes a top bar.
- Content column max 1180px, 40px side padding (16px on phones).
- Setup screens show the three-step trail at the top: *Import → Questions →
  Finish setting up*.
- Each screen has **one** dominant element (the import field, the call plan, the
  live pair list). Everything else is visibly secondary.
- Spacing scale (px): 4 · 8 · 12 · 16 · 24 · 32 · 48 · 72.

## 6. Components (see `src/components`)

- **Button** — `primary` (pen fill, white text), `ink` (ink fill), `quiet`
  (underlined text). Min height 44px. Primary buttons read as an action
  ("Sign off & start calls"), never "Submit".
- **Field** — label above, raised paper input, ink focus ring (2px). Helper text
  below in `--ink-soft`.
- **Dropdown** — custom listbox; each option can carry a description and a
  trailing action (e.g. ▶ voice sample).
- **StatusTag** — dot + word, colored by status (moss/ochre/indigo/pen). Never a
  filled pill.
- **PairMark** — pair color swatch + mono keyword. The only place pair colors appear.
- **Steps** — setup trail with the scribble under the current step.

## 7. Voice

Talk like the host's sharp friend. Short sentences. Say what happens next.

- "Arrow is calling your guests now." not "Call orchestration in progress."
- "Nobody's free yet — we'll ping them." not "Queue: 3 pending."
- Placeholders for unknown real data use brackets: `[Event name]`.

## 8. Motion

Quick and soft: 160ms ease-out for hover/focus, 240ms for things appearing.
"Just changed" marker highlights stay until the next change replaces them. Respect
`prefers-reduced-motion`.

## 9. Accessibility

Real `<button>`, `<a>`, `<label>`. Text contrast ≥ 4.5:1 (pen on paper is
5.2:1; white on pen is 5.6:1). Status is never color alone — always a word.
Every icon-only button has an `aria-label`.

## 10. For AI agents editing this app

- Every screen file starts with a header comment: route, purpose, what data it
  reads, what it writes, and what's mocked.
- Every input carries `data-field="<path>"` naming the backend field it maps to
  (paths follow `src/types.ts`). Keep these in sync when you change the schema.
- Mock data lives in `src/mock/`. Search for `MOCK:` to find every place a real
  API call should replace a stub.
