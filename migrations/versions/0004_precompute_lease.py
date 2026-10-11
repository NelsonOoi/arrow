"""Precompute lease: which job owns an event's precompute, in the database rather than in one process.

On Vercel, requests for the same event can land on different instances, so the in-process `_running` set can't
stop two jobs scoring the same pending rows. A job claims `precompute_lease_until` and renews it while it runs;
a crashed job's lease simply expires.

Revision ID: 0004_precompute_lease
Revises: 0003_one_group
"""

from alembic import op

revision = "0004_precompute_lease"
down_revision = "0003_one_group"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE matchmaker.events ADD COLUMN precompute_lease_until timestamptz")


def downgrade() -> None:
    op.execute("ALTER TABLE matchmaker.events DROP COLUMN precompute_lease_until")
