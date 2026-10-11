"""Flow 2: trigger rules on a fake clock, invariants under random event sequences, determinism."""

import random
import threading
import uuid

import pytest
from sqlalchemy import func, select, text

from matchmaker import refresh
from matchmaker.matching import blocking_pairs, filter_lists
from matchmaker.models import Attendee, Conversation, Event, PairScore, RefreshRun
from matchmaker.sim import SimConfig, simulate
from tests.factories import live_event, ready_event


def _ids(sf, eid, side=None):
    with sf() as s:
        q = select(Attendee.id).where(Attendee.event_id == eid).order_by(Attendee.external_ref)
        if side:
            q = q.where(Attendee.side == side)
        return list(s.scalars(q))


def _checkin(sf, clock, *ids):
    for i in ids:
        refresh.set_status(sf, i, "available", clock)


def _runs(sf, eid):
    with sf() as s:
        return s.scalar(select(func.count()).select_from(RefreshRun).where(RefreshRun.event_id == eid))


# ------------------------------------------------------------------------------------------- triggers


def test_fires_after_window_not_before(sf, clock):
    eid = live_event(sf, n_a=6, n_b=6, seed=11)
    a, b = _ids(sf, eid, "A"), _ids(sf, eid, "B")
    _checkin(sf, clock, a[0], b[0])
    clock.advance(19)
    assert refresh.run_refresh(sf, eid, clock, "window_elapsed") is None
    clock.advance(1)
    assert refresh.run_refresh(sf, eid, clock, "window_elapsed") is not None
    with sf() as s:
        assert s.scalars(select(RefreshRun.trigger).where(RefreshRun.event_id == eid)).one() == "window_elapsed"


def test_fires_early_at_threshold(sf, clock):
    eid = live_event(sf, n_a=6, n_b=6, seed=12)
    a, b = _ids(sf, eid, "A"), _ids(sf, eid, "B")
    _checkin(sf, clock, *a[:3], *b[:2])
    clock.advance(1)
    with sf() as s:
        due = refresh.due_refresh(s, eid, s.get(Event, eid).config)
    assert due[1] == "window_elapsed"
    _checkin(sf, clock, b[2])
    with sf() as s:
        due = refresh.due_refresh(s, eid, s.get(Event, eid).config)
    assert due[1] == "pool_threshold" and due[0] <= clock.now()
    assert refresh.run_refresh(sf, eid, clock, "window_elapsed") is not None
    with sf() as s:
        assert s.scalars(select(RefreshRun.trigger).where(RefreshRun.event_id == eid)).one() == "pool_threshold"


def test_never_fires_on_unchanged_pool_and_leftovers_dont_retrigger(sf, clock):
    eid = live_event(sf, n_a=6, n_b=6, seed=13)
    a = _ids(sf, eid, "A")
    _checkin(sf, clock, *a[:4])  # one side only: nobody can be paired
    clock.advance(20)
    assert refresh.run_refresh(sf, eid, clock, "window_elapsed") is not None
    clock.advance(600)
    assert refresh.run_refresh(sf, eid, clock, "window_elapsed") is None
    assert refresh.run_refresh(sf, eid, clock, "manual") is None
    # A new joiner starts a fresh window even though leftovers have waited long.
    b = _ids(sf, eid, "B")
    _checkin(sf, clock, b[0])
    with sf() as s:
        due = refresh.due_refresh(s, eid, s.get(Event, eid).config)
    assert (due[0] - clock.now()).total_seconds() == 20
    assert _runs(sf, eid) == 1


def test_never_runs_twice_at_once(sf, clock, engine):
    eid = live_event(sf, n_a=6, n_b=6, seed=14)
    a, b = _ids(sf, eid, "A"), _ids(sf, eid, "B")
    _checkin(sf, clock, *a, *b)
    with engine.connect() as other:
        with other.begin():
            assert other.scalar(text("SELECT pg_try_advisory_xact_lock(hashtext(:k))"), {"k": f"refresh:{eid}"})
            assert refresh.run_refresh(sf, eid, clock, "manual") is None
    assert refresh.run_refresh(sf, eid, clock, "manual") is not None

    # Concurrent manual refreshes: exactly one makes pairs; nobody is double-booked.
    eid2 = live_event(sf, n_a=6, n_b=6, seed=15)
    _checkin(sf, clock, *_ids(sf, eid2))
    results = []
    threads = [threading.Thread(target=lambda: results.append(refresh.run_refresh(sf, eid2, clock, "manual"))) for _ in range(6)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert sum(r is not None for r in results) == 1


def test_proposer_alternates(sf, clock):
    eid = live_event(sf, n_a=4, n_b=4, seed=16)
    a, b = _ids(sf, eid, "A"), _ids(sf, eid, "B")
    _checkin(sf, clock, a[0])
    refresh.run_refresh(sf, eid, clock, "manual")
    _checkin(sf, clock, b[0])
    refresh.run_refresh(sf, eid, clock, "manual")
    with sf() as s:
        sides = s.scalars(select(RefreshRun.proposer_side).where(RefreshRun.event_id == eid).order_by(RefreshRun.created_at)).all()
    assert sides == ["A", "B"]


# ------------------------------------------------------------------------------------------- invariants


def _check_invariants(sf, eid):
    with sf() as s:
        people = {a.id: a for a in s.scalars(select(Attendee).where(Attendee.event_id == eid))}
        convs = s.scalars(select(Conversation).where(Conversation.event_id == eid)).all()
        ranks = {
            (f, t): r
            for f, t, r in s.execute(
                select(PairScore.from_attendee_id, PairScore.to_attendee_id, PairScore.rank).where(PairScore.event_id == eid)
            )
        }
    active = [c for c in convs if c.status == "active"]
    in_active = [p for c in active for p in (c.side_a_attendee_id, c.side_b_attendee_id)]
    assert len(in_active) == len(set(in_active)), "someone is in two active conversations"
    for pid, p in people.items():
        assert (p.status == "in_conversation") == (pid in in_active), f"{p.display_name} status {p.status} out of sync"
        assert (p.status == "available") == (p.available_since is not None)
    pairs = [(c.side_a_attendee_id, c.side_b_attendee_id) for c in convs]
    assert len(pairs) == len(set(pairs)), "a pair met twice"
    for c in convs:
        assert ranks[(c.side_a_attendee_id, c.side_b_attendee_id)] == c.a_rank_of_b is not None
        assert ranks[(c.side_b_attendee_id, c.side_a_attendee_id)] == c.b_rank_of_a is not None


def _check_stable_at_refresh(sf, eid, run_id):
    """Recompute the filtered lists as of the refresh and confirm the pairs made are stable within that pool."""
    with sf() as s:
        run = s.get(RefreshRun, run_id)
        lists, _ = refresh.frozen_lists(s, eid)
        convs = s.scalars(select(Conversation).where(Conversation.refresh_run_id == run_id)).all()
        earlier = s.execute(
            select(Conversation.side_a_attendee_id, Conversation.side_b_attendee_id)
            .join(RefreshRun, RefreshRun.id == Conversation.refresh_run_id)
            .where(Conversation.event_id == eid, RefreshRun.created_at < run.created_at)
        ).all()

    pool = run.pool_snapshot["pool"]
    pa = [uuid.UUID(m["id"]) for m in pool if m["side"] == "A"]
    pb = [uuid.UUID(m["id"]) for m in pool if m["side"] == "B"]
    fa, fb = filter_lists(pa, pb, lists, {tuple(x) for x in earlier})
    m = {c.side_a_attendee_id: c.side_b_attendee_id for c in convs}
    for a, b in m.items():
        assert b in fa[a], "pair must come from the filtered (in-pool, unmet, mutual) lists"
    assert blocking_pairs(m, fa, fb) == []


@pytest.mark.parametrize("seed", [1, 2, 3, 4])
def test_invariants_under_random_event_sequences(sf, clock, seed):
    eid = live_event(sf, n_a=6, n_b=5, seed=100 + seed)
    rng = random.Random(seed)
    everyone = _ids(sf, eid)
    run_ids = []
    for _ in range(120):
        op = rng.random()
        with sf() as s:
            statuses = dict(s.execute(select(Attendee.id, Attendee.status).where(Attendee.event_id == eid)).all())
            active = s.scalars(select(Conversation).where(Conversation.event_id == eid, Conversation.status == "active")).all()
        try:
            if op < 0.3:
                pid = rng.choice(everyone)
                refresh.set_status(sf, pid, "available", clock)
            elif op < 0.55 and active:
                c = rng.choice(active)
                refresh.end_conversation(sf, c.id, rng.choice([c.side_a_attendee_id, c.side_b_attendee_id]), clock)
                # Ending twice is a no-op.
                assert refresh.end_conversation(sf, c.id, c.side_a_attendee_id, clock)[1] is False
            elif op < 0.65:
                pid = rng.choice(everyone)
                partner = None
                if statuses[pid] == "in_conversation":
                    c = next(c for c in active if pid in (c.side_a_attendee_id, c.side_b_attendee_id))
                    partner = c.side_b_attendee_id if c.side_a_attendee_id == pid else c.side_a_attendee_id
                refresh.set_status(sf, pid, "away", clock)
                if partner:
                    with sf() as s:
                        assert s.get(Attendee, partner).status == "available", "stepping away frees the partner"
                        ended = s.get(Conversation, c.id)
                        assert ended.end_reason == "left_event" and ended.status == "ended"
            else:
                clock.advance(rng.choice([1, 5, 10, 25]))
        except refresh.Conflict:
            pass
        with sf() as s:
            due = refresh.due_refresh(s, eid, s.get(Event, eid).config)
        if due and due[0] <= clock.now():
            rid = refresh.run_refresh(sf, eid, clock, due[1])
            assert rid is not None
            run_ids.append(rid)
        _check_invariants(sf, eid)
    assert run_ids, "sequence should have triggered refreshes"
    for rid in run_ids:
        _check_stable_at_refresh(sf, eid, rid)


def test_ending_returns_both_to_pool(sf, clock):
    eid = live_event(sf, n_a=3, n_b=3, seed=21)
    _checkin(sf, clock, *_ids(sf, eid))
    assert refresh.run_refresh(sf, eid, clock, "manual")
    with sf() as s:
        c = s.scalars(select(Conversation).where(Conversation.event_id == eid)).first()
    clock.advance(300)
    refresh.end_conversation(sf, c.id, c.side_b_attendee_id, clock)
    with sf() as s:
        for pid in (c.side_a_attendee_id, c.side_b_attendee_id):
            p = s.get(Attendee, pid)
            assert p.status == "available" and p.available_since == clock.now()
        ended = s.get(Conversation, c.id)
        assert ended.ended_by == c.side_b_attendee_id and ended.end_reason == "ended"


def test_status_change_requires_live_event(sf, clock):
    eid = ready_event(sf, 2, 2, seed=22)
    with pytest.raises(refresh.Conflict):
        refresh.set_status(sf, _ids(sf, eid)[0], "available", clock)


# ------------------------------------------------------------------------------------------- determinism


def test_same_sequence_seed_and_clock_give_identical_conversations(sf):
    src = ready_event(sf, n_a=6, n_b=6, seed=31)
    sim = SimConfig(duration_s=30 * 60, arrival_window_s=5 * 60, mean_conversation_s=180, early_leavers=1, step_aways=2, seed=5)
    r1 = simulate(sf, src, "design", sim)
    r2 = simulate(sf, src, "design", sim)
    strip = lambda rows: [{k: v for k, v in r.items() if k != "conversation_id"} for r in rows]  # noqa: E731
    assert r1.metrics["conversations"] > 5
    assert strip(r1.conversations) == strip(r2.conversations)
    assert r1.metrics["double_booked"] == 0 and r1.metrics["repeat_pairs"] == 0


@pytest.mark.parametrize("policy", ["instant_greedy", "random"])
def test_baselines_respect_invariants(sf, policy):
    src = ready_event(sf, n_a=5, n_b=5, seed=32)
    sim = SimConfig(duration_s=20 * 60, arrival_window_s=3 * 60, mean_conversation_s=120, seed=3)
    r = simulate(sf, src, policy, sim)
    assert r.metrics["conversations"] > 0
    assert r.metrics["double_booked"] == 0 and r.metrics["repeat_pairs"] == 0
    _check_invariants(sf, r.event_id)
