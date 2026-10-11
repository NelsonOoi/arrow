"""Defense in depth on Supabase: RLS on, no grants to the API roles, invoker-rights view.

The matchmaker schema isn't exposed through the Data API, and the app connects as the table owner
(which bypasses RLS), so nothing here changes app behaviour. It keeps the tables closed even if the
schema is exposed later by mistake. Role statements are skipped on plain Postgres without these roles.

Revision ID: 0002_lockdown
Revises: 0001_initial
"""

from alembic import op

revision = "0002_lockdown"
down_revision = "0001_initial"
branch_labels = None
depends_on = None

TABLES = ("events", "attendees", "pair_scores", "refresh_runs", "conversations")


def upgrade() -> None:
    for t in TABLES:
        op.execute(f"ALTER TABLE matchmaker.{t} ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER VIEW matchmaker.met_pairs SET (security_invoker = true)")
    op.execute(
        """
        DO $$
        DECLARE r text;
        BEGIN
          FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
              EXECUTE format('REVOKE ALL ON SCHEMA matchmaker FROM %I', r);
              EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA matchmaker FROM %I', r);
              EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA matchmaker REVOKE ALL ON TABLES FROM %I', r);
            END IF;
          END LOOP;
        END $$;
        """
    )


def downgrade() -> None:
    op.execute("ALTER VIEW matchmaker.met_pairs RESET (security_invoker)")
    for t in TABLES:
        op.execute(f"ALTER TABLE matchmaker.{t} DISABLE ROW LEVEL SECURITY")
