"""Flow 1 orchestration: freeze, render cards, enumerate pairs, score with bounded concurrency, aggregate, rank.

Each finished row is committed on its own, so a stopped job resumes where it left off and done rows are
never re-sent. Only one job per event runs at a time in this process (the app runs a single worker).
"""

import asyncio
import logging
import threading
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import asdict
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session, sessionmaker

from matchmaker.cards import Profile, profile_hash
from matchmaker.models import Attendee, Event, PairScore
from matchmaker.precompute.aggregate import Scored, aggregate, rank_lists
from matchmaker.precompute.scorer import JevResult, RetryableScorerError, Scorer

log = logging.getLogger(__name__)

MAX_RETRIES = 3
BACKOFF_BASE_SECONDS = 1.0

_running: set[uuid.UUID] = set()
_running_lock = threading.Lock()


class PrecomputeConflict(Exception):
    """The event is not in a state where precompute can start or resume."""


def to_profile(a: Attendee) -> Profile:
    return Profile(a.display_name, a.side, a.seeking_text, a.offering_text, a.avoid_text, dict(a.tags or {}))


def prepare(sf: sessionmaker[Session], event_id: uuid.UUID) -> None:
    """Steps 1-3 (first call) or reset failed rows to pending (resume). Moves draft -> precomputing."""
    with sf() as s, s.begin():
        event = s.execute(select(Event).where(Event.id == event_id).with_for_update()).scalar_one_or_none()
        if event is None:
            raise LookupError("event not found")
        if event.status == "draft":
            attendees = s.scalars(select(Attendee).where(Attendee.event_id == event_id)).all()
            side_a = [a for a in attendees if a.side == "A"]
            side_b = [a for a in attendees if a.side == "B"]
            if not side_a or not side_b:
                raise PrecomputeConflict("both sides need at least one attendee")
            for a in attendees:
                a.profile_hash = profile_hash(to_profile(a))
            rows = [
                PairScore(event_id=event_id, from_attendee_id=x.id, to_attendee_id=y.id)
                for xs, ys in ((side_a, side_b), (side_b, side_a))
                for x in xs
                for y in ys
            ]
            s.add_all(rows)
            event.precompute_total = len(rows)
            event.status = "precomputing"
        elif event.status == "precomputing":
            s.execute(
                update(PairScore)
                .where(PairScore.event_id == event_id, PairScore.status == "failed")
                .values(status="pending", error=None)
            )
            event.precompute_failed = 0
        else:
            raise PrecomputeConflict(f"event is {event.status}; precompute only runs from draft or precomputing")


async def score_pending(
    sf: sessionmaker[Session],
    event_id: uuid.UUID,
    scorer: Scorer,
    concurrency: int = 16,
    sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
    limit: int | None = None,
) -> None:
    """Step 4-5: score every pending row. `limit` stops early (used by tests to simulate an interrupted job)."""
    with sf() as s:
        event = s.get(Event, event_id)
        rubric, config = event.rubric, event.config
        people = {a.id: to_profile(a) for a in s.scalars(select(Attendee).where(Attendee.event_id == event_id))}
        pending = s.execute(
            select(PairScore.id, PairScore.from_attendee_id, PairScore.to_attendee_id)
            .where(PairScore.event_id == event_id, PairScore.status == "pending")
            .order_by(PairScore.from_attendee_id, PairScore.to_attendee_id)
        ).all()
    if limit is not None:
        pending = pending[:limit]

    sem = asyncio.Semaphore(concurrency)

    async def one(row_id: uuid.UUID, from_id: uuid.UUID, to_id: uuid.UUID) -> None:
        async with sem:
            attempts = 0
            result: JevResult | None = None
            error: str | None = None
            while True:
                attempts += 1
                try:
                    result = await scorer.score(people[from_id], people[to_id], rubric)
                    break
                except RetryableScorerError as e:
                    error = str(e)
                    if attempts > MAX_RETRIES:
                        break
                    await sleep(BACKOFF_BASE_SECONDS * 2 ** (attempts - 1))
                except Exception as e:  # non-retryable: bad request, auth, mapping bug
                    error = f"{type(e).__name__}: {e}"
                    log.exception("scoring failed for pair %s", row_id)
                    break
            _store(sf, event_id, row_id, result, error, attempts, rubric, config)

    await asyncio.gather(*(one(*row) for row in pending))


def _store(sf, event_id, row_id, result: JevResult | None, error, attempts, rubric, config) -> None:
    now = datetime.now(UTC)
    with sf() as s, s.begin():
        row = s.get(PairScore, row_id)
        row.attempts += attempts
        row.updated_at = now
        if result is None:
            row.status = "failed"
            row.error = error
            s.execute(update(Event).where(Event.id == event_id).values(precompute_failed=Event.precompute_failed + 1))
            return
        agg, min_conf = aggregate(result.dimensions, rubric)
        row.status = "done"
        row.error = None
        row.dimensions = {k: asdict(v) for k, v in result.dimensions.items()}
        row.dealbreaker_prob = result.dealbreaker_prob
        row.aggregate = agg
        row.min_confidence = min_conf
        row.acceptable = result.dealbreaker_prob < config["dealbreaker_threshold"]
        row.raw_response = result.raw_response
        row.request_id = result.request_id
        s.execute(update(Event).where(Event.id == event_id).values(precompute_done=Event.precompute_done + 1))


def finish(sf: sessionmaker[Session], event_id: uuid.UUID) -> str:
    """Steps 6-7: if every row is done, rank and mark the event ready. Returns the event status."""
    with sf() as s, s.begin():
        event = s.execute(select(Event).where(Event.id == event_id).with_for_update()).scalar_one()
        counts = dict(
            s.execute(
                select(PairScore.status, func.count()).where(PairScore.event_id == event_id).group_by(PairScore.status)
            ).all()
        )
        event.precompute_done = counts.get("done", 0)
        event.precompute_failed = counts.get("failed", 0)
        if event.status != "precomputing" or counts.get("done", 0) != event.precompute_total:
            return event.status
        rows = s.scalars(select(PairScore).where(PairScore.event_id == event_id)).all()
        ranks = rank_lists(
            (Scored(r.from_attendee_id, r.to_attendee_id, r.aggregate, r.min_confidence, r.acceptable) for r in rows),
            seed=int(event.config["base_seed"]),
        )
        for r in rows:
            r.rank = ranks[(r.from_attendee_id, r.to_attendee_id)]
        event.status = "ready"
        event.precompute_finished_at = datetime.now(UTC)
        return event.status


async def run_precompute(
    sf: sessionmaker[Session],
    event_id: uuid.UUID,
    scorer: Scorer,
    concurrency: int = 16,
    sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
    limit: int | None = None,
) -> str:
    with _running_lock:
        if event_id in _running:
            raise PrecomputeConflict("precompute is already running for this event")
        _running.add(event_id)
    try:
        prepare(sf, event_id)
        await score_pending(sf, event_id, scorer, concurrency, sleep, limit)
        return finish(sf, event_id)
    finally:
        with _running_lock:
            _running.discard(event_id)


def is_running(event_id: uuid.UUID) -> bool:
    with _running_lock:
        return event_id in _running


def report(sf: sessionmaker[Session], event_id: uuid.UUID) -> dict[str, Any]:
    with sf() as s:
        event = s.get(Event, event_id)
        if event is None:
            raise LookupError("event not found")
        names = {a.id: (a.display_name, a.external_ref) for a in s.scalars(select(Attendee).where(Attendee.event_id == event_id))}
        threshold = event.config["low_confidence_threshold"]
        low = s.scalars(
            select(PairScore)
            .where(PairScore.event_id == event_id, PairScore.status == "done", PairScore.min_confidence < threshold)
            .order_by(PairScore.min_confidence)
        ).all()
        failed = s.scalars(select(PairScore).where(PairScore.event_id == event_id, PairScore.status == "failed")).all()
        return {
            "status": event.status,
            "running": is_running(event_id),
            "total": event.precompute_total,
            "done": event.precompute_done,
            "failed": event.precompute_failed,
            "finished_at": event.precompute_finished_at,
            "low_confidence": [
                {
                    "from": names[r.from_attendee_id][0],
                    "to": names[r.to_attendee_id][0],
                    "from_attendee_id": r.from_attendee_id,
                    "to_attendee_id": r.to_attendee_id,
                    "min_confidence": r.min_confidence,
                    "aggregate": r.aggregate,
                    "rank": r.rank,
                }
                for r in low
            ],
            "failed_rows": [{"id": r.id, "attempts": r.attempts, "error": r.error} for r in failed],
        }
