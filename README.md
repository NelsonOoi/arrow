# mingled: event matchmaking prototype

Everyone at the event is in one group: anyone can be paired with anyone, and every conversation is 1-on-1. Two flows, adapted from the design doc of Oct 11, 2026:

- **Flow 1 (precompute):** Jev scores every directed pair once, before the event (n × (n − 1) calls: 1,560 for 40 people). The scores are aggregated into one frozen, ranked list per person.
- **Flow 2 (live refresh):** whenever the pool of free people changes, it pairs them over the frozen lists and starts their conversations. It uses Irving's stable-roommates algorithm, so no two people in the pool would both rather be with each other. When no stable pairing exists, it falls back to a maximum-weight matching that pairs as many people as possible by mutual preference, and records a `no_stable_pairing` warning on the refresh run. Either person can end a conversation at any time; both go back into the pool, and a pair never meets twice.

## Setup

```bash
uv sync
npx supabase@2.118.0 start -x gotrue,realtime,storage-api,imgproxy,kong,mailpit,postgrest,postgres-meta,studio,edge-runtime,logflare,vector,supavisor
cp .env.example .env        # local DB by default; set DATABASE_URL to hosted Supabase for the demo
uv run alembic upgrade head
uv run pytest               # creates and drops a throwaway database on the local Supabase
```

If ROS or another tool sets `PYTHONPATH`, prefix commands with `env -u PYTHONPATH`, because its pytest plugins break collection.

For hosted Supabase from a long-lived process (uvicorn, scripts), use the **session pooler (port 5432)** or the direct connection. On Vercel, use the **transaction pooler (6543)**: with `VERCEL=1` the engine drops its client-side pool and turns off psycopg's prepared statements, which the transaction pooler can't keep. All locks are transaction-scoped, so both poolers work. All tables live in the `matchmaker` schema, which the Data API doesn't expose. RLS is on and the API roles have no grants.

## Run

```bash
uv run python -m scripts.seed_demo --precompute --live [--scorer jev]   # prints the event id
uv run uvicorn --factory matchmaker.api:app
uv run python -m scripts.live_run --event <id> --minutes 10           # check 5
```

## Host dashboard (web/)

The Cloudflare Worker in `web/` is the event-planning side: the host adds guests, AI calls collect their answers, and **Run matching** hands them to this backend through the shared database. While the API runs, `matchmaker/web_bridge.py` polls `public.events` for those requests. For each one it imports the answered guests, runs precompute with the configured scorer, goes live, and writes each guest's match back to `public.matches` for the guest page. Apply `web/schema.sql` once for the `mm_*` handoff columns. Without them the bridge stays off. See [web/README.md](web/README.md).

## Deploy (Vercel)

One Vercel project, two services ([vercel.json](vercel.json)): `web` (dashboard + guest page + `/api`) and `matchmaker` (this API, under `/mm`). `web` reaches `matchmaker` over a private service binding.

Functions only run during a request, so nothing runs in the background there:
- **Live refresh:** `matchmaker/vercel_app.py` sets `refresh_on_request`. Attendee requests (the app polls `/current` every 3 s) run any refresh that's due. The asyncio `Scheduler` is for uvicorn only.
- **Precompute:** `POST /events/{id}/precompute` runs inside the request until about 30 s before `MAX_DURATION_SECONDS`, then returns `status: precomputing`. Call it again to resume. A DB lease (`precompute_lease_until`) stops two instances from scoring the same event.
- **Run matching** from the dashboard: see [web/README.md](web/README.md#matchmaker-handoff).

```bash
uv run alembic upgrade head                 # against the hosted DB, from your machine (migrations don't run on Vercel)
# and run web/schema.sql once in the Supabase SQL editor (adds the mm_* handoff columns)
npx vercel link
npx vercel env add DATABASE_URL             # transaction pooler, port 6543
npx vercel env add TYPESAFE_API_KEY
npx vercel env add SCORER                   # jev
npx vercel env add HOST_KEY                 # guards setup endpoints; the web service needs the same value
npx vercel dev                              # both services locally
npx vercel deploy                           # preview; --prod for production
```

`MAX_DURATION_SECONDS` (default 300) must match the `maxDuration` in vercel.json. Raise both on Pro.

## App (Arrow)

The Expo app in `src/` is the attendee client. On launch it loads the newest live event's roster from `GET /events/{id}/attendees`. Each person picks who they are, then:

- **Match tab:** check in or step away (`POST /attendees/{id}/status`). The app polls `GET /attendees/{id}/current` every 3 s and buzzes when the matchmaker assigns a conversation partner. *End conversation* puts both people back in the pool.
- **Nearby tab:** BLE scanning. Each phone advertises the 4-char token the roster assigns it, and only the current partner's token can trigger the "match nearby" card.

```bash
npm install
EXPO_PUBLIC_API_URL=https://<project>.vercel.app/mm npm start # deployed; or put it in .env (see .env.example)
# or against a laptop on the LAN:
uv run uvicorn --factory matchmaker.api:app --host 0.0.0.0
EXPO_PUBLIC_API_URL=http://<laptop-lan-ip>:8000 npm start
```

BLE needs a development build (`npm run build:dev`), not Expo Go.

## Demo checks

```bash
uv run python -m matchmaker.export_judging pairs --event <id>        # check 2 (then pairs-reveal)
uv run python -m matchmaker.export_judging ranking --event <id>      # check 3
uv run python -m matchmaker.export_judging stability --event <id>    # check 3, re-scores 90 calls
uv run python -m matchmaker.sim --event <id> --sweep                 # check 4: policies + window sweep
uv run python -m matchmaker.export_judging convs --event <id>        # check 4 blind sheet (then convs-reveal)
```

`demo/attendees.json` and `demo/answer_key.json` are drafts. Edit them before running precompute with Jev.

## Changes from the design doc

- The refresh window and the early-fire threshold (`refresh_min_pending`, 6 new joiners) count only people who joined since the last refresh. People left over from a refresh still take part in matching.
- One group instead of two sides (migration `0003_one_group`). Conversations store the pair as `person_a_id < person_b_id`, and a trigger rejects a second active conversation for anyone. The pairing runs on each attendee's `external_ref`, so the simulator's cloned events pair exactly like their source.
- SDK retries are off (`RetryPolicy(max_retries=0)`), so the worker's own 3 retries with backoff are the only ones and `attempts` stays accurate. The model is pinned by passing `model="jev-1.13.0"` on every call. The worker also checks at startup that this model is listed.
- When `avoid_text` is empty, the Noul question is skipped and `dealbreaker_prob` is set to 0.
- All Flow 2 timestamps come from the injected Clock.
- Refreshes lock the pool's attendee rows. Status changes and ends lock attendee rows in id order, then the conversation.
- Precompute runs as one job per event in this process, rather than claiming rows with `SKIP LOCKED`. Holding 16 connections open through Jev calls would exceed Supabase's session-pooler limits. Resume picks up both failed and pending rows.
- Pass bars: added *Flow 1 stability*. Re-scored aggregates must stay within 0.05 on at least 27 of 30 rows, and the paraphrase twins must share at least 2 of their top 3. The garbled row in the doc becomes *Flow 2: obvious pairs meet, 5 of 6 or more*.
