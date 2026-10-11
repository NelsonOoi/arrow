# mingled: event matchmaking prototype

Two flows, from the design doc of Oct 11, 2026:

- **Flow 1 (precompute):** Jev scores every cross-side directed pair once, before the event. The scores are aggregated into one frozen, ranked list per person.
- **Flow 2 (live refresh):** whenever the pool of free people changes, it pairs them with Gale-Shapley over the frozen lists and starts their conversations. Either person can end a conversation at any time.

## Setup

```bash
uv sync
npx supabase@2.118.0 start -x gotrue,realtime,storage-api,imgproxy,kong,mailpit,postgrest,postgres-meta,studio,edge-runtime,logflare,vector,supavisor
cp .env.example .env        # local DB by default; set DATABASE_URL to hosted Supabase for the demo
uv run alembic upgrade head
uv run pytest               # creates and drops a throwaway database on the local Supabase
```

If ROS or another tool sets `PYTHONPATH`, prefix commands with `env -u PYTHONPATH`, because its pytest plugins break collection.

For hosted Supabase, use the **session pooler (port 5432)** or the direct connection. Do not use the transaction pooler on 6543. All tables live in the `matchmaker` schema, which the Data API doesn't expose. RLS is on and the API roles have no grants.

## Run

```bash
uv run python -m scripts.seed_demo --precompute --live [--scorer jev]   # prints the event id
uv run uvicorn --factory matchmaker.api:app
uv run python -m scripts.live_run --event <id> --minutes 10           # check 5
```

## App (Arrow)

The Expo app in `src/` is the attendee client. On launch it loads the newest live event's roster from `GET /events/{id}/attendees`. Each person picks who they are, then:

- **Match tab:** check in or step away (`POST /attendees/{id}/status`). The app polls `GET /attendees/{id}/current` every 3 s and buzzes when the matchmaker assigns a conversation partner. *End conversation* puts both people back in the pool.
- **Nearby tab:** BLE scanning. Each phone advertises the 4-char token the roster assigns it, and only the current partner's token can trigger the "match nearby" card.

```bash
npm install
uv run uvicorn --factory matchmaker.api:app --host 0.0.0.0     # reachable from phones on the LAN
EXPO_PUBLIC_API_URL=http://<laptop-lan-ip>:8000 npm start      # or put it in .env (see .env.example)
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

- The refresh window and the 3-per-side threshold count only people who joined since the last refresh. People left over from a refresh still take part in matching.
- SDK retries are off (`RetryPolicy(max_retries=0)`), so the worker's own 3 retries with backoff are the only ones and `attempts` stays accurate. The model is pinned by passing `model="jev-1.13.0"` on every call. The worker also checks at startup that this model is listed.
- When `avoid_text` is empty, the Noul question is skipped and `dealbreaker_prob` is set to 0.
- All Flow 2 timestamps come from the injected Clock.
- Refreshes lock the pool's attendee rows. Status changes and ends lock attendee rows in id order, then the conversation.
- Precompute runs as one job per event in this process, rather than claiming rows with `SKIP LOCKED`. Holding 16 connections open through Jev calls would exceed Supabase's session-pooler limits. Resume picks up both failed and pending rows.
- Pass bars: added *Flow 1 stability*. Re-scored aggregates must stay within 0.05 on at least 27 of 30 rows, and the paraphrase twins must share at least 2 of their top 3. The garbled row in the doc becomes *Flow 2: obvious pairs meet, 5 of 6 or more*.
