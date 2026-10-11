"""Flow 1: ranks, dealbreakers, resume without duplicate calls, freeze."""

import asyncio
from collections import defaultdict

import pytest
from sqlalchemy import select

from matchmaker import setup
from matchmaker.models import Attendee, Event, PairScore
from matchmaker.precompute.aggregate import aggregate
from matchmaker.precompute.fake import FakeScorer
from matchmaker.precompute.scorer import DimensionResult, RetryableScorerError
from matchmaker.precompute.worker import PrecomputeConflict, run_precompute
from matchmaker.refresh import Conflict
from tests.factories import people, ready_event


def test_ranks_are_dense_in_aggregate_order_and_dealbreakers_unranked(sf):
    eid = ready_event(sf, 8, 7, seed=3)
    with sf() as s:
        rows = s.scalars(select(PairScore).where(PairScore.event_id == eid)).all()
        assert len(rows) == 2 * 8 * 7
        by_from = defaultdict(list)
        for r in rows:
            assert r.status == "done"
            assert r.acceptable == (r.dealbreaker_prob < 0.5)
            if not r.acceptable:
                assert r.rank is None
            else:
                by_from[r.from_attendee_id].append(r)
        assert any(not r.acceptable for r in rows), "fixture should include dealbreaker hits"
        for lst in by_from.values():
            lst.sort(key=lambda r: r.rank)
            assert [r.rank for r in lst] == list(range(1, len(lst) + 1))
            aggs = [r.aggregate for r in lst]
            assert aggs == sorted(aggs, reverse=True)
        assert s.get(Event, eid).status == "ready"


def test_resume_makes_no_duplicate_scorer_calls(sf):
    eid = setup.create_event(sf, "resume")
    setup.import_attendees(sf, eid, people(5, 5, seed=1))
    scorer = FakeScorer()
    status = asyncio.run(run_precompute(sf, eid, scorer, limit=17))
    assert status == "precomputing"
    status = asyncio.run(run_precompute(sf, eid, scorer))
    assert status == "ready"
    assert len(scorer.calls) == 50
    assert len(set(scorer.calls)) == 50


class FlakyScorer(FakeScorer):
    """Fails every call for one seeker until `heal()`."""

    def __init__(self, bad_name):
        super().__init__()
        self.bad, self.healed = bad_name, False

    async def score(self, seeker, candidate, rubric):
        if seeker.display_name == self.bad and not self.healed:
            raise RetryableScorerError("HTTP 503")
        return await super().score(seeker, candidate, rubric)


def test_failed_rows_retry_with_backoff_then_resume_only_failed(sf):
    eid = setup.create_event(sf, "flaky")
    setup.import_attendees(sf, eid, people(3, 3, seed=2))
    sleeps = []

    async def fake_sleep(d):
        sleeps.append(d)

    scorer = FlakyScorer("A00")
    assert asyncio.run(run_precompute(sf, eid, scorer, sleep=fake_sleep)) == "precomputing"
    with sf() as s:
        failed = s.scalars(select(PairScore).where(PairScore.event_id == eid, PairScore.status == "failed")).all()
        assert len(failed) == 3 and all(r.attempts == 4 for r in failed)
        assert s.get(Event, eid).precompute_failed == 3
    assert sorted(set(sleeps)) == [1.0, 2.0, 4.0]
    scorer.healed = True
    scorer.calls.clear()
    assert asyncio.run(run_precompute(sf, eid, scorer, sleep=fake_sleep)) == "ready"
    assert len(scorer.calls) == 3


def test_import_and_edits_rejected_once_precompute_starts(sf):
    eid = ready_event(sf, 3, 3, seed=4)
    with pytest.raises(Conflict):
        setup.import_attendees(sf, eid, people(1, 0, seed=9))
    with pytest.raises(PrecomputeConflict):
        asyncio.run(run_precompute(sf, eid, FakeScorer()))
    with pytest.raises(Conflict):
        setup.go_live(sf, setup.create_event(sf, "not-ready"))


def test_profile_hash_recorded(sf):
    eid = ready_event(sf, 2, 2, seed=5)
    with sf() as s:
        hashes = [a.profile_hash for a in s.scalars(select(Attendee).where(Attendee.event_id == eid))]
    assert all(len(h) == 64 for h in hashes)


def test_aggregate_formula():
    rubric = {
        "dimensions": [
            {"key": "x", "levels": list("abcde"), "weight": 0.4},
            {"key": "y", "levels": list("abc"), "weight": 0.6},
        ]
    }
    dims = {
        "x": DimensionResult(level=4, expected=4.0, probabilities=[0, 0, 0, 0, 1], confidence=1.0),
        "y": DimensionResult(level=1, expected=1.0, probabilities=[0, 1, 0], confidence=0.3),
    }
    agg, conf = aggregate(dims, rubric)
    assert agg == pytest.approx(0.4 * 1.0 + 0.6 * 0.5)
    assert conf == 0.3
