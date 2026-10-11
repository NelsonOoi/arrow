-- Arrow on Supabase (Postgres). Run once in the Supabase SQL editor.
-- Tables live in `public` so the Worker can reach them through the REST API with the
-- service key. RLS is on with no policies: anon/authenticated keys see nothing; the
-- service key bypasses RLS. (The team's matchmaker tables live in their own schema.)

create table if not exists public.events (
  id          text primary key,
  name        text not null,
  description text,
  type        text not null check (type in ('networking','social')),
  host        text,
  calls_on    boolean not null default false,   -- true while "Call everyone" works through the queue
  created_at  timestamptz not null default now()
);

create table if not exists public.people (
  uid          text primary key,
  event_id     text not null references public.events(id) on delete cascade,
  name         text,
  phone        text not null,
  status       text not null default 'pending',  -- pending | calling | sms_sent | answered | failed
  answers      jsonb,                            -- [{key, question, answer}]
  transcript   text,
  source       text,                             -- call | sms | seed
  call_id      text,
  sms_sent_at  timestamptz,
  link_sent_at timestamptz,
  token        text unique not null,
  created_at   timestamptz not null default now()
);
create index if not exists people_event on public.people(event_id);

-- One row per guest: the one person they should meet (rank = 1).
create table if not exists public.matches (
  event_id   text not null references public.events(id) on delete cascade,
  uid        text not null references public.people(uid) on delete cascade,
  match_uid  text not null references public.people(uid) on delete cascade,
  rank       integer not null default 1,
  score      real,
  reason     text,
  must_meet  boolean not null default false,      -- true = mutual (stable pair)
  primary key (uid, match_uid)
);
create index if not exists matches_event on public.matches(event_id);

create table if not exists public.beacons (
  id         bigint generated always as identity primary key,
  event_id   text not null references public.events(id) on delete cascade,
  from_uid   text not null,
  to_uid     text not null,
  color      text not null,
  created_at timestamptz not null default now(),
  found_at   timestamptz
);

create table if not exists public.logs (
  id       bigint generated always as identity primary key,
  event_id text not null references public.events(id) on delete cascade,
  at       timestamptz not null default now(),
  msg      text not null
);
create index if not exists logs_event on public.logs(event_id);

-- Handoff to the Python matchmaker (matchmaker/web_bridge.py), which shares this database.
-- "Run matching" sets mm_status = 'requested'; the bridge claims it ('running'), runs Jev
-- precompute in the matchmaker schema, writes public.matches, and sets 'done' or 'failed'. On Vercel the
-- Worker calls the matchmaker's /bridge/{id} directly and re-calls it when mm_heartbeat_at goes stale.
alter table public.events add column if not exists mm_status   text check (mm_status in ('requested','running','done','failed'));
alter table public.events add column if not exists mm_event_id uuid;          -- matchmaker.events.id
alter table public.events add column if not exists mm_done     integer not null default 0;  -- pairs scored
alter table public.events add column if not exists mm_total    integer not null default 0;
alter table public.events add column if not exists mm_error    text;
alter table public.events add column if not exists mm_requested_at timestamptz;
alter table public.events add column if not exists mm_heartbeat_at timestamptz;  -- bridge alive; stale = resume

alter table public.events  enable row level security;
alter table public.people  enable row level security;
alter table public.matches enable row level security;
alter table public.beacons enable row level security;
alter table public.logs    enable row level security;
