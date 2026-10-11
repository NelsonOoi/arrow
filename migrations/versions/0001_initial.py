"""Initial schema: the design doc's five tables plus the met_pairs view, in the matchmaker schema.

Revision ID: 0001_initial
Revises:
"""

from alembic import op

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None

DDL = """
SET LOCAL search_path TO matchmaker, public, extensions;

CREATE TYPE event_status    AS ENUM ('draft','precomputing','ready','live','closed');
CREATE TYPE side            AS ENUM ('A','B');
CREATE TYPE attendee_status AS ENUM ('registered','available','in_conversation','away');
CREATE TYPE score_status    AS ENUM ('pending','done','failed');
CREATE TYPE conv_status     AS ENUM ('active','ended');

CREATE TABLE events (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  text NOT NULL,
  status                event_status NOT NULL DEFAULT 'draft',
  side_a_label          text NOT NULL DEFAULT 'mentee',
  side_b_label          text NOT NULL DEFAULT 'mentor',
  model_version         text NOT NULL DEFAULT 'jev-1.13.0',
  rubric                jsonb NOT NULL,
  config                jsonb NOT NULL,
  precompute_total      int NOT NULL DEFAULT 0,
  precompute_done       int NOT NULL DEFAULT 0,
  precompute_failed     int NOT NULL DEFAULT 0,
  precompute_finished_at timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE attendees (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        uuid NOT NULL REFERENCES events(id),
  external_ref    text,
  display_name    text NOT NULL,
  side            side NOT NULL,
  seeking_text    text NOT NULL,
  offering_text   text NOT NULL,
  avoid_text      text NOT NULL DEFAULT '',
  tags            jsonb NOT NULL DEFAULT '{}',
  profile_hash    text NOT NULL,
  status          attendee_status NOT NULL DEFAULT 'registered',
  available_since timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, external_ref)
);
CREATE INDEX attendees_pool ON attendees (event_id, status, side, available_since);

CREATE TABLE pair_scores (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id         uuid NOT NULL REFERENCES events(id),
  from_attendee_id uuid NOT NULL REFERENCES attendees(id),
  to_attendee_id   uuid NOT NULL REFERENCES attendees(id),
  status           score_status NOT NULL DEFAULT 'pending',
  dimensions       jsonb,
  dealbreaker_prob real,
  aggregate        real,
  min_confidence   real,
  acceptable       boolean,
  rank             int,
  raw_response     jsonb,
  request_id       text,
  attempts         int NOT NULL DEFAULT 0,
  error            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, from_attendee_id, to_attendee_id)
);
CREATE INDEX pair_scores_list ON pair_scores (from_attendee_id, rank);

CREATE TABLE refresh_runs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      uuid NOT NULL REFERENCES events(id),
  trigger       text NOT NULL CONSTRAINT refresh_runs_trigger_check CHECK (trigger IN ('window_elapsed','pool_threshold','manual')),
  proposer_side side NOT NULL,
  seed          bigint NOT NULL,
  pool_snapshot jsonb NOT NULL,
  pairs_made    int NOT NULL,
  left_waiting  int NOT NULL,
  warnings      jsonb NOT NULL DEFAULT '[]',
  duration_ms   int NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX refresh_runs_event ON refresh_runs (event_id, created_at);

CREATE TABLE conversations (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id           uuid NOT NULL REFERENCES events(id),
  refresh_run_id     uuid NOT NULL REFERENCES refresh_runs(id),
  side_a_attendee_id uuid NOT NULL REFERENCES attendees(id),
  side_b_attendee_id uuid NOT NULL REFERENCES attendees(id),
  a_rank_of_b        int NOT NULL,
  b_rank_of_a        int NOT NULL,
  a_wait_seconds     int NOT NULL,
  b_wait_seconds     int NOT NULL,
  status             conv_status NOT NULL DEFAULT 'active',
  started_at         timestamptz NOT NULL DEFAULT now(),
  ended_at           timestamptz,
  ended_by           uuid REFERENCES attendees(id),
  end_reason         text CONSTRAINT conversations_end_reason_check CHECK (end_reason IN ('ended','left_event')),
  UNIQUE (event_id, side_a_attendee_id, side_b_attendee_id)
);
CREATE UNIQUE INDEX conv_one_active_a ON conversations (side_a_attendee_id) WHERE status = 'active';
CREATE UNIQUE INDEX conv_one_active_b ON conversations (side_b_attendee_id) WHERE status = 'active';

CREATE VIEW met_pairs AS
  SELECT event_id, side_a_attendee_id, side_b_attendee_id FROM conversations;
"""


def upgrade() -> None:
    op.execute(DDL)


def downgrade() -> None:
    op.execute(
        """
        DROP VIEW matchmaker.met_pairs;
        DROP TABLE matchmaker.conversations, matchmaker.refresh_runs, matchmaker.pair_scores,
                   matchmaker.attendees, matchmaker.events;
        DROP TYPE matchmaker.conv_status, matchmaker.score_status, matchmaker.attendee_status,
                  matchmaker.side, matchmaker.event_status;
        """
    )
