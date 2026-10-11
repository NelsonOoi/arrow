# Arrow — host web app

The organizer side of Arrow: import a Partiful event, sign off on the voice
agent's call plan, and watch matches live. The guest side is the Expo app in
the repo root; this folder is a separate Vite + React + TypeScript app.

```bash
cd host
npm install
npm run dev        # http://localhost:5174
npm run typecheck
npm run build
```

## Map (MVP)

| Route | Screen | What it's for |
|---|---|---|
| `/events` | `screens/EventsOverview.tsx` | Landing page. Event list + "Import event" (Partiful link, with a sample link for demos). |
| `/events/:id/setup/import` | `screens/ImportStep.tsx` | Setup 1. What was imported: event details + guest list. Read-only. |
| `/events/:id/setup/questions` | `screens/QuestionsStep.tsx` | Setup 2. Call plan: goal, questions, opening, retries. "Finish setup" starts calls. |
| `/events/:id` | `screens/EventDashboard.tsx` | After setup. Metrics, text blast, check-in QR, guest list with call/text/check-in status. |

Matching rules are fixed at `DEFAULT_MATCHING` (top 5, 15 min) and not shown in the MVP.
The full design (chat-edited plan, live pairs, activity feed) is on the `host-full` branch.

- **Design rules:** [DESIGN.md](DESIGN.md) (tokens in `src/styles/tokens.css`).
- **Data model:** `src/types.ts`. Every input has `data-field="<path into these types>"`.
- **State:** `src/store.tsx` (React context). Each action names the API call it stands in for.
- **Mocks:** `src/mock/data.ts` (seed data, sample import, hardcoded during-event metrics).
  Search for `MOCK:` to find every place a real backend call should go.

## For AI agents

Read the header comment at the top of the screen file you're changing first. It
lists the route, purpose, what the screen reads and writes, and what's mocked.
Keep `data-field` paths in sync with `src/types.ts`. Follow DESIGN.md: paper and
ink, one pen-red accent, rules not boxes, no stat-tile grids.
