# Arrow

An AI calls every guest before the event, asks what they're looking for, and texts each one the one person they should meet, plus a beacon to find them in the room.

Live: **https://arrow.sunisgreat1.workers.dev**

- Host dashboard: `/?event=evt_demo`
- Guest match page: `/m/demo` (Sun) or `/m/demo-2` (Maya). Open both, tap **Find Maya** on Sun's page, and Maya's screen flashes the same color.

## Stack

One Cloudflare Worker ([src/worker.js](src/worker.js)) serves the pages in `public/` and the JSON API.

| Piece | Uses |
|---|---|
| Data | Supabase (project `euzqbkrabyxlbqdcsddj`, `public` schema), tables in [schema.sql](schema.sql), reached through the REST API with the service key ([src/db.js](src/db.js)) |
| AI phone interviews + texts | [Dial](https://docs.getdial.ai) REST API ([src/dial.js](src/dial.js)) |
| Pulling answers out of transcripts | Workers AI (`@cf/meta/llama-3.1-8b-instruct`) |
| Match scoring | [Jev](https://docs.typesafe.ai) by TypeSafe ([src/match.js](src/match.js)): one Score question per pair; keyword-overlap fallback without a key |

## Flow

| Step | Host dashboard | What happens |
|---|---|---|
| 1. Guests | Add guests | Paste `name, phone`, one per line |
| 2. AI calls | Call everyone | Calls one guest at a time (a Dial number carries one call). Each dashboard poll finishes the current call and starts the next. No answer → the questions go out by text; the inbox icon pulls replies in. |
| 3. Match | Run matching | Jev scores every pair both ways; a stable pairing gives mutual matches, everyone else gets their best score. One `matches` row per guest, `rank = 1`. |
| 4. Links | Text links | Texts each guest `/m/<token>` |
| 5. Find | Guest page | "Find X" makes both phones flash the same color until one taps "found" |

## Setup

```bash
npx wrangler secret put SUPABASE_SERVICE_KEY  # Supabase → Project settings → API keys → service_role
npx wrangler secret put DIAL_API_KEY       # from ~/.local/share/dial/auth.json after `dial auth login`
npx wrangler secret put TYPESAFE_API_KEY   # from console.typesafe.ai/keys
npx wrangler deploy
```

Optional: `DIAL_FROM_NUMBER` (a Dial number id or E.164) to pick which number calls; defaults to the account's first number.

Tables: run [schema.sql](schema.sql) once in the Supabase SQL editor.

Demo data: `node seed.mjs` (reads the key from `~/.config/arrow/supabase.key`), then **Run matching**.

Local dev: `npx wrangler dev` with `SUPABASE_SERVICE_KEY=...` in `.dev.vars` (it talks to the same Supabase project).

## Team

Marco (UI/UX, pitch, sponsors) · Sun (calls) · Scott (matching backend) · Nelson (guest page).
Sponsors: Dial, Jev (TypeSafe), Alike, Keewano.
