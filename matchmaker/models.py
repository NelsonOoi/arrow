"""SQLAlchemy models matching the design doc's DDL.

Everything lives in the `matchmaker` schema rather than `public`, so Supabase's auto-generated Data API
never exposes these tables to the anon key.
"""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Index,
    Integer,
    MetaData,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

SCHEMA = "matchmaker"

EVENT_STATUS = ("draft", "precomputing", "ready", "live", "closed")
ATTENDEE_STATUS = ("registered", "available", "in_conversation", "away")
SCORE_STATUS = ("pending", "done", "failed")
CONV_STATUS = ("active", "ended")


class Base(DeclarativeBase):
    metadata = MetaData(schema=SCHEMA)


def _enum(name: str, values: tuple[str, ...]) -> Enum:
    return Enum(*values, name=name, schema=SCHEMA, metadata=Base.metadata)


event_status_t = _enum("event_status", EVENT_STATUS)
attendee_status_t = _enum("attendee_status", ATTENDEE_STATUS)
score_status_t = _enum("score_status", SCORE_STATUS)
conv_status_t = _enum("conv_status", CONV_STATUS)


def _pk() -> Mapped[uuid.UUID]:
    return mapped_column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"), default=uuid.uuid4)


def _ts(nullable: bool = False) -> Mapped[Any]:
    return mapped_column(DateTime(timezone=True), nullable=nullable, server_default=None if nullable else func.now())


class Event(Base):
    __tablename__ = "events"

    id: Mapped[uuid.UUID] = _pk()
    name: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(event_status_t, nullable=False, server_default="draft", default="draft")
    model_version: Mapped[str] = mapped_column(Text, nullable=False, server_default="jev-1.13.0", default="jev-1.13.0")
    rubric: Mapped[dict] = mapped_column(JSONB, nullable=False)
    config: Mapped[dict] = mapped_column(JSONB, nullable=False)
    precompute_total: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0", default=0)
    precompute_done: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0", default=0)
    precompute_failed: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0", default=0)
    precompute_finished_at: Mapped[datetime | None] = _ts(nullable=True)
    precompute_lease_until: Mapped[datetime | None] = _ts(nullable=True)  # held by the running precompute job
    created_at: Mapped[datetime] = _ts()


class Attendee(Base):
    __tablename__ = "attendees"
    __table_args__ = (
        UniqueConstraint("event_id", "external_ref"),
        Index("attendees_pool", "event_id", "status", "available_since"),
    )

    id: Mapped[uuid.UUID] = _pk()
    event_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("events.id"), nullable=False)
    external_ref: Mapped[str | None] = mapped_column(Text)
    display_name: Mapped[str] = mapped_column(Text, nullable=False)
    seeking_text: Mapped[str] = mapped_column(Text, nullable=False)
    offering_text: Mapped[str] = mapped_column(Text, nullable=False)
    avoid_text: Mapped[str] = mapped_column(Text, nullable=False, server_default="", default="")
    tags: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default=text("'{}'::jsonb"), default=dict)
    profile_hash: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(attendee_status_t, nullable=False, server_default="registered", default="registered")
    available_since: Mapped[datetime | None] = _ts(nullable=True)
    created_at: Mapped[datetime] = _ts()
    updated_at: Mapped[datetime] = _ts()


class PairScore(Base):
    __tablename__ = "pair_scores"
    __table_args__ = (
        UniqueConstraint("event_id", "from_attendee_id", "to_attendee_id"),
        Index("pair_scores_list", "from_attendee_id", "rank"),
    )

    id: Mapped[uuid.UUID] = _pk()
    event_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("events.id"), nullable=False)
    from_attendee_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("attendees.id"), nullable=False)
    to_attendee_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("attendees.id"), nullable=False)
    status: Mapped[str] = mapped_column(score_status_t, nullable=False, server_default="pending", default="pending")
    dimensions: Mapped[dict | None] = mapped_column(JSONB)
    dealbreaker_prob: Mapped[float | None] = mapped_column(Float(precision=24))
    aggregate: Mapped[float | None] = mapped_column(Float(precision=24))
    min_confidence: Mapped[float | None] = mapped_column(Float(precision=24))
    acceptable: Mapped[bool | None] = mapped_column(Boolean)
    rank: Mapped[int | None] = mapped_column(Integer)
    raw_response: Mapped[dict | None] = mapped_column(JSONB)
    request_id: Mapped[str | None] = mapped_column(Text)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0", default=0)
    error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = _ts()
    updated_at: Mapped[datetime] = _ts()


class RefreshRun(Base):
    __tablename__ = "refresh_runs"
    __table_args__ = (CheckConstraint("trigger IN ('window_elapsed','pool_threshold','manual')", name="refresh_runs_trigger_check"),)

    id: Mapped[uuid.UUID] = _pk()
    event_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("events.id"), nullable=False)
    trigger: Mapped[str] = mapped_column(Text, nullable=False)
    seed: Mapped[int] = mapped_column(BigInteger, nullable=False)
    pool_snapshot: Mapped[dict] = mapped_column(JSONB, nullable=False)
    pairs_made: Mapped[int] = mapped_column(Integer, nullable=False)
    left_waiting: Mapped[int] = mapped_column(Integer, nullable=False)
    warnings: Mapped[list] = mapped_column(JSONB, nullable=False, server_default=text("'[]'::jsonb"), default=list)
    duration_ms: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = _ts()


class Conversation(Base):
    __tablename__ = "conversations"
    __table_args__ = (
        UniqueConstraint("event_id", "person_a_id", "person_b_id"),  # a pair never meets twice
        CheckConstraint("person_a_id < person_b_id", name="conversations_pair_order_check"),
        CheckConstraint("end_reason IN ('ended','left_event')", name="conversations_end_reason_check"),
        # One active conversation per person is enforced by the conversations_one_active trigger (0003).
        Index("conv_active_a", "person_a_id", postgresql_where=text("status = 'active'")),
        Index("conv_active_b", "person_b_id", postgresql_where=text("status = 'active'")),
    )

    id: Mapped[uuid.UUID] = _pk()
    event_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("events.id"), nullable=False)
    refresh_run_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("refresh_runs.id"), nullable=False)
    # Unordered pair stored as (smaller id, larger id); a_* / b_* columns follow that order.
    person_a_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("attendees.id"), nullable=False)
    person_b_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("attendees.id"), nullable=False)
    a_rank_of_b: Mapped[int] = mapped_column(Integer, nullable=False)
    b_rank_of_a: Mapped[int] = mapped_column(Integer, nullable=False)
    a_wait_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    b_wait_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(conv_status_t, nullable=False, server_default="active", default="active")
    started_at: Mapped[datetime] = _ts()
    ended_at: Mapped[datetime | None] = _ts(nullable=True)
    ended_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("attendees.id"))
    end_reason: Mapped[str | None] = mapped_column(Text)


MET_PAIRS_VIEW_SQL = f"""
CREATE VIEW {SCHEMA}.met_pairs AS
  SELECT event_id, person_a_id, person_b_id FROM {SCHEMA}.conversations
"""
