"""One group: anyone can be paired with anyone. Drops sides and stores conversations as unordered pairs.

- events lose side_a_label/side_b_label, attendees lose side, refresh_runs lose proposer_side.
- conversations.side_a/side_b_attendee_id become person_a_id/person_b_id with person_a_id < person_b_id,
  so UNIQUE (event_id, person_a_id, person_b_id) still means a pair never meets twice. Existing rows are
  swapped into that order (with their ranks and waits).
- A person can appear in either column now, so the two per-column unique indexes can't stop double-booking.
  A trigger checks it instead; writers already hold the attendee row locks, so the check can't race.

Revision ID: 0003_one_group
Revises: 0002_lockdown
"""

from alembic import op

revision = "0003_one_group"
down_revision = "0002_lockdown"
branch_labels = None
depends_on = None

DDL = """
SET LOCAL search_path TO matchmaker, public, extensions;

DROP VIEW met_pairs;
DROP INDEX conv_one_active_a;
DROP INDEX conv_one_active_b;

ALTER TABLE conversations RENAME COLUMN side_a_attendee_id TO person_a_id;
ALTER TABLE conversations RENAME COLUMN side_b_attendee_id TO person_b_id;
-- Postgres shortened the auto-generated name of UNIQUE (event_id, side_a..., side_b...), so look it up.
DO $$
DECLARE c text;
BEGIN
  SELECT conname INTO STRICT c FROM pg_constraint
   WHERE conrelid = 'matchmaker.conversations'::regclass AND contype = 'u';
  EXECUTE format('ALTER TABLE matchmaker.conversations RENAME CONSTRAINT %I TO conversations_event_id_person_a_id_person_b_id_key', c);
END $$;
ALTER TABLE conversations RENAME CONSTRAINT conversations_side_a_attendee_id_fkey TO conversations_person_a_id_fkey;
ALTER TABLE conversations RENAME CONSTRAINT conversations_side_b_attendee_id_fkey TO conversations_person_b_id_fkey;
UPDATE conversations
   SET person_a_id = person_b_id, person_b_id = person_a_id,
       a_rank_of_b = b_rank_of_a, b_rank_of_a = a_rank_of_b,
       a_wait_seconds = b_wait_seconds, b_wait_seconds = a_wait_seconds
 WHERE person_a_id > person_b_id;
ALTER TABLE conversations ADD CONSTRAINT conversations_pair_order_check CHECK (person_a_id < person_b_id);
CREATE INDEX conv_active_a ON conversations (person_a_id) WHERE status = 'active';
CREATE INDEX conv_active_b ON conversations (person_b_id) WHERE status = 'active';

CREATE FUNCTION matchmaker.conversations_one_active() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.status = 'active' AND EXISTS (
    SELECT 1 FROM matchmaker.conversations c
     WHERE c.status = 'active' AND c.id <> NEW.id
       AND (c.person_a_id IN (NEW.person_a_id, NEW.person_b_id) OR c.person_b_id IN (NEW.person_a_id, NEW.person_b_id))
  ) THEN
    RAISE EXCEPTION 'attendee is already in an active conversation' USING ERRCODE = 'unique_violation';
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION matchmaker.conversations_one_active() FROM PUBLIC;
CREATE TRIGGER conversations_one_active BEFORE INSERT OR UPDATE OF status, person_a_id, person_b_id
  ON conversations FOR EACH ROW EXECUTE FUNCTION matchmaker.conversations_one_active();

CREATE VIEW met_pairs WITH (security_invoker = true) AS
  SELECT event_id, person_a_id, person_b_id FROM conversations;

DROP INDEX attendees_pool;
ALTER TABLE attendees DROP COLUMN side;
CREATE INDEX attendees_pool ON attendees (event_id, status, available_since);

ALTER TABLE refresh_runs DROP COLUMN proposer_side;
ALTER TABLE events DROP COLUMN side_a_label, DROP COLUMN side_b_label;
DROP TYPE side;
"""


def upgrade() -> None:
    op.execute(DDL)


def downgrade() -> None:
    raise NotImplementedError("sides can't be restored; recreate the database from 0002 instead")
