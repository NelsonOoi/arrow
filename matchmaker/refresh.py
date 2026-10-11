"""Flow 2: the live pool. Trigger rules, the locked refresh commit, status transitions and the scheduler.

The pure pieces (`next_fire_at`, the pairing policies) take plain values; the rest wires them to Postgres.
All timestamps come from the injected Clock.

Lock order, everywhere: the per-event advisory lock (refresh only), then attendee rows sorted by id, then
the conversation row. Keeping one order means status changes, ends and refreshes serialize without deadlocks.
"""

import asyncio
import logging
import random
import time
import uuid
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session, sessionmaker

from matchmaker.clock import Clock
from matchmaker.matching import blocking_pairs, filter_lists, gale_shapley
from matchmaker.models import Attendee, Conversation, Event, PairScore, RefreshRun

log = logging.getLogger(__name__)


class Conflict(Exception):
    """An illegal transition (mapped to HTTP 409)."""


# ---------------------------------------------------------------------------------------------- triggers


@dataclass(frozen=True)
class PoolMember:
    id: uuid.UUID
    side: str
    available_since: datetime
    ref: str = ""  # stable sort key (external_ref, else id); uuids differ between cloned events


@dataclass(frozen=True)
class TriggerState:
    pending_since: datetime | None  # earliest join among people who joined since the last refresh
    pending_a: int
    pending_b: int


def trigger_state(pool: Sequence[PoolMember], last_run_at: datetime | None, last_left_waiting: set[uuid.UUID]) -> TriggerState:
    """People count as new joiners unless they were left waiting by the last refresh and haven't rejoined since.

    Leftovers still take part in matching; they just don't start or satisfy the trigger.
    """
    pending = [
        m for m in pool if last_run_at is None or m.id not in last_left_waiting or m.available_since > last_run_at
    ]
    return TriggerState(
        pending_since=min((m.available_since for m in pending), default=None),
        pending_a=sum(1 for m in pending if m.side == "A"),
        pending_b=sum(1 for m in pending if m.side == "B"),
    )


def next_fire_at(state: TriggerState, config: Mapping[str, Any]) -> tuple[datetime, str] | None:
    """When the next automatic refresh is due, and why. None when nobody new has joined (the pool is unchanged)."""
    if state.pending_since is None:
        return None
    k = int(config["refresh_min_per_side"])
    if state.pending_a >= k and state.pending_b >= k:
        return state.pending_since, "pool_threshold"
    return state.pending_since + timedelta(seconds=float(config["refresh_window_seconds"])), "window_elapsed"


# ---------------------------------------------------------------------------------------------- policies

Lists = dict[uuid.UUID, list[uuid.UUID]]


@dataclass(frozen=True)
class PolicyInput:
    lists_a: Lists  # filtered: in pool, unmet, mutually acceptable, frozen order
    lists_b: Lists
    proposer_side: str
    rng: random.Random
    joined_order: Sequence[uuid.UUID]  # pool ids by available_since, oldest first
    sort_key: Mapping[uuid.UUID, str]  # stable per-person key for any order-dependent policy


Policy = Callable[[PolicyInput], dict[uuid.UUID, uuid.UUID]]  # returns {side_a_id: side_b_id}


def gale_shapley_policy(p: PolicyInput) -> dict[uuid.UUID, uuid.UUID]:
    if p.proposer_side == "A":
        return gale_shapley(p.lists_a, p.lists_b)
    return {a: b for b, a in gale_shapley(p.lists_b, p.lists_a).items()}


@dataclass(frozen=True)
class PolicySpec:
    name: str
    pair: Policy
    stable: bool  # assert no blocking pairs within the pool


DESIGN_POLICY = PolicySpec("design", gale_shapley_policy, stable=True)


# ---------------------------------------------------------------------------------------------- frozen lists

_lists_cache: dict[uuid.UUID, tuple[Lists, dict[tuple[uuid.UUID, uuid.UUID], int]]] = {}


def frozen_lists(s: Session, event_id: uuid.UUID) -> tuple[Lists, dict[tuple[uuid.UUID, uuid.UUID], int]]:
    """Everyone's ranked list, best first, and the rank lookup. Frozen after precompute, so cached per event."""
    if event_id not in _lists_cache:
        rows = s.execute(
            select(PairScore.from_attendee_id, PairScore.to_attendee_id, PairScore.rank)
            .where(PairScore.event_id == event_id, PairScore.rank.is_not(None))
            .order_by(PairScore.from_attendee_id, PairScore.rank)
        ).all()
        lists: Lists = {}
        ranks = {}
        for f, t, r in rows:
            lists.setdefault(f, []).append(t)
            ranks[(f, t)] = r
        _lists_cache[event_id] = (lists, ranks)
    return _lists_cache[event_id]


def _met(s: Session, event_id: uuid.UUID) -> set[tuple[uuid.UUID, uuid.UUID]]:
    rows = s.execute(text("SELECT side_a_attendee_id, side_b_attendee_id FROM matchmaker.met_pairs WHERE event_id = :e"), {"e": event_id})
    return {(a, b) for a, b in rows}


# ---------------------------------------------------------------------------------------------- refresh


def _last_run(s: Session, event_id: uuid.UUID) -> tuple[datetime | None, set[uuid.UUID], int]:
    count = s.scalar(select(func.count()).select_from(RefreshRun).where(RefreshRun.event_id == event_id)) or 0
    last = s.execute(
        select(RefreshRun.created_at, RefreshRun.pool_snapshot)
        .where(RefreshRun.event_id == event_id)
        .order_by(RefreshRun.created_at.desc(), RefreshRun.id.desc())
        .limit(1)
    ).first()
    if last is None:
        return None, set(), count
    return last[0], {uuid.UUID(x) for x in last[1].get("left_waiting_ids", [])}, count


def _pool(s: Session, event_id: uuid.UUID, lock: bool) -> list[PoolMember]:
    q = select(Attendee.id, Attendee.side, Attendee.available_since, Attendee.external_ref).where(
        Attendee.event_id == event_id, Attendee.status == "available"
    ).order_by(Attendee.id)
    if lock:
        q = q.with_for_update()
    return [PoolMember(i, side, since, ref or str(i)) for i, side, since, ref in s.execute(q)]


def due_refresh(s: Session, event_id: uuid.UUID, config: Mapping[str, Any]) -> tuple[datetime, str] | None:
    pool = _pool(s, event_id, lock=False)
    last_at, left, _ = _last_run(s, event_id)
    return next_fire_at(trigger_state(pool, last_at, left), config)


def run_refresh(
    sf: sessionmaker[Session],
    event_id: uuid.UUID,
    clock: Clock,
    trigger: str,
    policy: PolicySpec = DESIGN_POLICY,
    config_override: Mapping[str, Any] | None = None,
) -> uuid.UUID | None:
    """Pair the current pool and start conversations. Returns the refresh_runs id, or None when skipped
    (another refresh holds the lock, the refresh isn't due, or nobody new has joined)."""
    started = time.monotonic()
    with sf() as s, s.begin():
        if not s.scalar(text("SELECT pg_try_advisory_xact_lock(hashtext(:k))"), {"k": f"refresh:{event_id}"}):
            return None
        event = s.get(Event, event_id)
        if event is None or event.status != "live":
            return None
        config = {**event.config, **(config_override or {})}
        now = clock.now()
        pool = _pool(s, event_id, lock=True)
        last_at, left, run_count = _last_run(s, event_id)
        due = next_fire_at(trigger_state(pool, last_at, left), config)
        # Keep refresh_runs strictly ordered even when a fake clock fires two refreshes at the same instant.
        run_at = now if last_at is None or now > last_at else last_at + timedelta(microseconds=1)
        if due is None:
            return None  # unchanged pool can't produce new pairs
        if trigger != "manual":
            fire_at, trigger = due
            if fire_at > now:
                return None

        lists, ranks = frozen_lists(s, event_id)
        met = _met(s, event_id)
        side = {m.id: m.side for m in pool}
        pool_a = [m.id for m in pool if m.side == "A"]
        pool_b = [m.id for m in pool if m.side == "B"]
        fa, fb = filter_lists(pool_a, pool_b, lists, met)

        proposer = "A" if run_count % 2 == 0 else "B"
        seed = int(config["base_seed"]) * 1_000_003 + run_count
        joined_order = [m.id for m in sorted(pool, key=lambda m: (m.available_since, m.ref))]
        sort_key = {m.id: m.ref for m in pool}
        pairs = policy.pair(PolicyInput(fa, fb, proposer, random.Random(seed), joined_order, sort_key))
        if policy.stable:
            blocking = blocking_pairs(pairs, fa, fb)
            assert not blocking, f"blocking pairs within the pool: {blocking}"

        paired = set(pairs) | set(pairs.values())
        leftovers = [m.id for m in pool if m.id not in paired]
        warnings = []
        for x in leftovers:
            has_option = any(
                x in lists.get(y, ()) and ((x, y) if side[x] == "A" else (y, x)) not in met for y in lists.get(x, ())
            )
            if not has_option:
                warnings.append({"type": "exhausted", "attendee_id": str(x)})

        wait = {m.id: max(0, int((now - m.available_since).total_seconds())) for m in pool}
        run = RefreshRun(
            event_id=event_id,
            trigger=trigger,
            proposer_side=proposer,
            seed=seed,
            pool_snapshot={
                "pool": [{"id": str(m.id), "side": m.side, "wait_seconds": wait[m.id]} for m in pool],
                "left_waiting_ids": [str(x) for x in leftovers],
                "policy": policy.name,
            },
            pairs_made=len(pairs),
            left_waiting=len(leftovers),
            warnings=warnings,
            duration_ms=0,
            created_at=run_at,
        )
        s.add(run)
        s.flush()
        for a, b in sorted(pairs.items(), key=lambda kv: sort_key[kv[0]]):
            s.add(
                Conversation(
                    event_id=event_id,
                    refresh_run_id=run.id,
                    side_a_attendee_id=a,
                    side_b_attendee_id=b,
                    a_rank_of_b=ranks[(a, b)],
                    b_rank_of_a=ranks[(b, a)],
                    a_wait_seconds=wait[a],
                    b_wait_seconds=wait[b],
                    started_at=now,
                )
            )
        if paired:
            s.execute(
                Attendee.__table__.update()
                .where(Attendee.id.in_(paired))
                .values(status="in_conversation", available_since=None, updated_at=now)
            )
        run.duration_ms = int((time.monotonic() - started) * 1000)
        return run.id


# ---------------------------------------------------------------------------------------------- transitions


def _lock_attendees(s: Session, ids: Sequence[uuid.UUID]) -> dict[uuid.UUID, Attendee]:
    q = select(Attendee).where(Attendee.id.in_(sorted(set(ids)))).order_by(Attendee.id).with_for_update()
    rows = s.scalars(q.execution_options(populate_existing=True)).all()
    return {a.id: a for a in rows}


def _active_conversation(s: Session, attendee_id: uuid.UUID, lock: bool = False) -> Conversation | None:
    q = select(Conversation).where(
        Conversation.status == "active",
        (Conversation.side_a_attendee_id == attendee_id) | (Conversation.side_b_attendee_id == attendee_id),
    )
    if lock:
        q = q.with_for_update().execution_options(populate_existing=True)
    return s.scalars(q).first()


def _end(conv: Conversation, people: Mapping[uuid.UUID, Attendee], ended_by: uuid.UUID, reason: str, now: datetime) -> None:
    conv.status = "ended"
    conv.ended_at = now
    conv.ended_by = ended_by
    conv.end_reason = reason
    for pid in (conv.side_a_attendee_id, conv.side_b_attendee_id):
        p = people[pid]
        if p.status == "in_conversation":
            p.status = "available"
            p.available_since = now
            p.updated_at = now


def end_conversation(sf: sessionmaker[Session], conversation_id: uuid.UUID, ended_by: uuid.UUID, clock: Clock) -> tuple[uuid.UUID, bool]:
    """End a conversation; both people return to the pool. A second call is a no-op.

    Returns (event_id, changed)."""
    with sf() as s, s.begin():
        conv = s.get(Conversation, conversation_id)
        if conv is None:
            raise LookupError("conversation not found")
        if ended_by not in (conv.side_a_attendee_id, conv.side_b_attendee_id):
            raise Conflict("ended_by must be one of the two people in the conversation")
        people = _lock_attendees(s, [conv.side_a_attendee_id, conv.side_b_attendee_id])
        conv = s.execute(
            select(Conversation).where(Conversation.id == conversation_id).with_for_update().execution_options(populate_existing=True)
        ).scalar_one()
        if conv.status == "ended":
            return conv.event_id, False
        _end(conv, people, ended_by, "ended", clock.now())
        return conv.event_id, True


class _Retry(Exception):
    pass


def set_status(sf: sessionmaker[Session], attendee_id: uuid.UUID, status: str, clock: Clock) -> tuple[uuid.UUID, bool]:
    """Check in / come back (`available`) or step away / leave (`away`). Returns (event_id, changed)."""
    if status not in ("available", "away"):
        raise Conflict("status must be 'available' or 'away'")
    for _ in range(5):
        try:
            return _set_status(sf, attendee_id, status, clock)
        except _Retry:
            continue
    raise Conflict("pool changed concurrently; retry")


def _set_status(sf: sessionmaker[Session], attendee_id: uuid.UUID, status: str, clock: Clock) -> tuple[uuid.UUID, bool]:
    with sf() as s, s.begin():
        me = s.get(Attendee, attendee_id)
        if me is None:
            raise LookupError("attendee not found")
        event = s.get(Event, me.event_id)
        if event.status != "live":
            raise Conflict(f"event is {event.status}; status changes need a live event")
        # Find a partner without locks, then lock both attendee rows in id order, then the conversation.
        conv = _active_conversation(s, attendee_id)
        ids = [attendee_id] + ([conv.side_a_attendee_id, conv.side_b_attendee_id] if conv else [])
        people = _lock_attendees(s, ids)
        me = people[attendee_id]
        now = clock.now()
        if status == "available":
            if me.status == "available":
                return me.event_id, False
            if me.status == "in_conversation":
                raise Conflict("already in a conversation; end it instead")
            me.status = "available"
            me.available_since = now
            me.updated_at = now
            return me.event_id, True
        # away
        if me.status == "away":
            return me.event_id, False
        conv = _active_conversation(s, attendee_id, lock=True)
        if conv is not None:
            if conv.side_a_attendee_id not in people or conv.side_b_attendee_id not in people:
                raise _Retry  # a refresh paired us after we looked; roll back and lock the new partner too
            _end(conv, people, attendee_id, "left_event", now)
        me.status = "away"
        me.available_since = None
        me.updated_at = now
        return me.event_id, True


# ---------------------------------------------------------------------------------------------- read views


def current(sf: sessionmaker[Session], attendee_id: uuid.UUID, clock: Clock) -> dict[str, Any]:
    with sf() as s:
        me = s.get(Attendee, attendee_id)
        if me is None:
            raise LookupError("attendee not found")
        out: dict[str, Any] = {"attendee_id": me.id, "status": me.status, "conversation": None, "waiting_seconds": None}
        conv = _active_conversation(s, attendee_id)
        if conv is not None:
            is_a = conv.side_a_attendee_id == attendee_id
            partner = s.get(Attendee, conv.side_b_attendee_id if is_a else conv.side_a_attendee_id)
            out["conversation"] = {
                "id": conv.id,
                "partner_id": partner.id,
                "partner_name": partner.display_name,
                "partner_about": partner.offering_text,
                "started_at": conv.started_at,
                "your_rank_of_partner": conv.a_rank_of_b if is_a else conv.b_rank_of_a,
            }
        elif me.status == "available" and me.available_since is not None:
            out["waiting_seconds"] = int((clock.now() - me.available_since).total_seconds())
            last = s.execute(
                select(RefreshRun.warnings).where(RefreshRun.event_id == me.event_id).order_by(RefreshRun.created_at.desc()).limit(1)
            ).scalar()
            out["exhausted"] = any(w.get("attendee_id") == str(me.id) for w in (last or []))
        return out


def pool_view(sf: sessionmaker[Session], event_id: uuid.UUID, clock: Clock) -> dict[str, Any]:
    with sf() as s:
        event = s.get(Event, event_id)
        if event is None:
            raise LookupError("event not found")
        now = clock.now()
        rows = s.execute(
            select(Attendee.id, Attendee.display_name, Attendee.side, Attendee.available_since)
            .where(Attendee.event_id == event_id, Attendee.status == "available")
            .order_by(Attendee.available_since)
        ).all()
        due = due_refresh(s, event_id, event.config) if event.status == "live" else None
        active = s.scalar(
            select(func.count()).select_from(Conversation).where(Conversation.event_id == event_id, Conversation.status == "active")
        )
        return {
            "event_status": event.status,
            "now": now,
            "waiting": [
                {"id": i, "name": n, "side": side, "waiting_seconds": int((now - since).total_seconds())} for i, n, side, since in rows
            ],
            "active_conversations": active,
            "next_refresh_at": due[0] if due else None,
            "next_refresh_trigger": due[1] if due else None,
        }


# ---------------------------------------------------------------------------------------------- scheduler


class Scheduler:
    """One asyncio task per live event. Sleeps until the next refresh is due or a pool change wakes it."""

    def __init__(self, sf: sessionmaker[Session], clock: Clock) -> None:
        self.sf = sf
        self.clock = clock
        self._tasks: dict[uuid.UUID, asyncio.Task] = {}
        self._wake: dict[uuid.UUID, asyncio.Event] = {}
        self._loop: asyncio.AbstractEventLoop | None = None

    def start(self, event_id: uuid.UUID) -> None:
        self._loop = asyncio.get_running_loop()
        if event_id in self._tasks and not self._tasks[event_id].done():
            return
        self._wake[event_id] = asyncio.Event()
        self._tasks[event_id] = asyncio.create_task(self._run(event_id), name=f"refresh:{event_id}")

    def wake(self, event_id: uuid.UUID) -> None:
        """Thread-safe: called from sync route handlers after any pool change."""
        ev = self._wake.get(event_id)
        if ev is not None and self._loop is not None:
            self._loop.call_soon_threadsafe(ev.set)

    async def stop_all(self) -> None:
        for t in self._tasks.values():
            t.cancel()
        await asyncio.gather(*self._tasks.values(), return_exceptions=True)
        self._tasks.clear()

    def _due(self, event_id: uuid.UUID) -> tuple[str, tuple[datetime, str] | None]:
        with self.sf() as s:
            event = s.get(Event, event_id)
            if event is None or event.status != "live":
                return "stop", None
            return "live", due_refresh(s, event_id, event.config)

    async def _run(self, event_id: uuid.UUID) -> None:
        wake = self._wake[event_id]
        while True:
            wake.clear()
            try:
                state, due = await asyncio.to_thread(self._due, event_id)
                if state == "stop":
                    return
                if due is not None:
                    delay = (due[0] - self.clock.now()).total_seconds()
                    if delay <= 0:
                        await asyncio.to_thread(run_refresh, self.sf, event_id, self.clock, due[1])
                        continue
                    try:
                        await asyncio.wait_for(wake.wait(), timeout=delay)
                    except TimeoutError:
                        pass
                    continue
                await wake.wait()
            except asyncio.CancelledError:
                raise
            except Exception:
                log.exception("refresh scheduler error for event %s", event_id)
                await asyncio.sleep(1.0)
