# Arrow

An AI calls every guest before the event, asks what they're looking for, and texts each one the one person they should meet, plus a beacon to find them in the room.

Live (Cloudflare, before the move to Vercel): **https://arrow.sunisgreat1.workers.dev**

- Host dashboard: `/?event=evt_demo`
- Guest match page: `/m/demo` (Sun) or `/m/demo-2` (Maya). Open both, tap **Find Maya** on Sun's page, and Maya's screen flashes the same color.

## Stack

The `web` service of the repo's Vercel project ([../vercel.json](../vercel.json)). [server.js](server.js) runs the JSON API router in [src/worker.js](src/worker.js), and the pages in `public/` are static files (`/` → `host.html`, `/m/*` → `m.html`).

| Piece | Uses |
|---|---|
| Data | Supabase (project `euzqbkrabyxlbqdcsddj`, `public` schema), tables in [schema.sql](schema.sql), reached through the REST API with the service key ([src/db.js](src/db.js)) |
| AI phone interviews + texts | [Dial](https://docs.getdial.ai) REST API ([src/dial.js](src/dial.js)) |
| Pulling answers out of transcripts | AI SDK on Vercel AI Gateway (`anthropic/claude-haiku-5.5`, override with `AI_GATEWAY_MODEL`) |
| Match scoring | [Jev](https://docs.typesafe.ai) by TypeSafe ([src/match.js](src/match.js)): one Score question per pair; keyword-overlap fallback without a key |

## Flow

| Step | Host dashboard | What happens |
|---|---|---|
| 1. Guests | Add guests | Paste `name, phone`, one per line |
| 2. AI calls | Call everyone | Calls one guest at a time (a Dial number carries one call). Each dashboard poll finishes the current call and starts the next. No answer → the questions go out by text; the inbox icon pulls replies in. |
| 3. Match | Run matching | With the matchmaker service bound (or `MATCHER=matchmaker`), hands the guests who answered to the Python matchmaker (see below). Otherwise [src/match.js](src/match.js) scores every pair with Jev and pairs them greedily. Either way: one `matches` row per guest, `rank = 1`, `must_meet` for mutual pairs. |
| 4. Links | Text links | Texts each guest `/m/<token>` |
| 5. Find | Guest page | "Find X" makes both phones flash the same color until one taps "found" |

## Setup

Deployed together with the matchmaker; see "Deploy (Vercel)" in the [root README](../README.md). This service's variables:

```bash
npx vercel env add SUPABASE_SERVICE_KEY  # Supabase → Project settings → API keys → service_role
npx vercel env add DIAL_API_KEY          # from ~/.local/share/dial/auth.json after `dial auth login`
npx vercel env add TYPESAFE_API_KEY      # only for MATCHER=local (match.js)
npx vercel env add HOST_KEY              # same value as the matchmaker's
```

AI Gateway authenticates through Vercel (OIDC), so it needs no key there.

Optional: `DIAL_FROM_NUMBER` (a Dial number id or E.164) to pick which number calls; defaults to the account's first number.

Tables: run [schema.sql](schema.sql) once in the Supabase SQL editor.

Demo data: `node seed.mjs` (reads the key from `~/.config/arrow/supabase.key`), then **Run matching**.

Local dev: `npx vercel dev` from the repo root runs this service (through [dev.js](dev.js)) and the matchmaker together. It talks to the same Supabase project.

## Matchmaker handoff

**Run matching** sets `events.mm_status = 'requested'` and calls the matchmaker's `/bridge/<event>` over the service binding (`MATCHMAKER_URL`). The matchmaker ([../matchmaker/web_bridge.py](../matchmaker/web_bridge.py)) shares this Supabase project. It:

1. Imports the answered guests into the `matchmaker` schema as attendees (`external_ref` = `people.uid`).
2. Runs Jev precompute over every directed pair. The dashboard shows `mm_done` of `mm_total`.
3. Takes the event live, so the Arrow app picks it up for live pairing.
4. Writes `matches` from a stable-roommates pairing over the ranked lists.

A function only runs for its `maxDuration`, so a long precompute stops just before it and leaves the rest pending. While it works, it refreshes `mm_heartbeat_at`. When that goes quiet for 45 s (stopped or crashed), the dashboard's next poll calls `/bridge` again and it resumes where it left off.

Without the binding (the matchmaker on a laptop under `uv run uvicorn --factory matchmaker.api:app`, with `MATCHER=matchmaker` here), the matchmaker polls the table for requests instead. Set `MATCHER=local` to score in this service with match.js.

## Team

Marco (UI/UX, pitch, sponsors) · Sun (calls) · Scott (matching backend) · Nelson (guest page).
Sponsors: Dial, Jev (TypeSafe), Alike, Keewano.
