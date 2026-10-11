"""End-to-end through HTTP: setup, precompute, live, check-in, refresh, poll, end, step away."""

import re
import time
import uuid

from fastapi.testclient import TestClient

from matchmaker.api import create_app
from matchmaker.precompute.fake import FakeScorer
from tests.factories import people


def test_full_flow_over_http(sf, clock):
    app = create_app(sf=sf, clock=clock, scorer_factory=FakeScorer, run_scheduler=False)
    with TestClient(app) as c:
        eid = c.post("/events", json={"name": "http"}).json()["id"]
        ids = c.post(f"/events/{eid}/attendees/import", json={"attendees": people(3, 3, seed=7)}).json()["ids"]
        assert len(ids) == 6

        assert c.post(f"/events/{eid}/precompute").status_code == 202
        for _ in range(100):
            prog = c.get(f"/events/{eid}/precompute").json()
            if prog["status"] == "ready":
                break
            time.sleep(0.05)
        assert prog["status"] == "ready" and prog["done"] == prog["total"] == 18
        assert c.post(f"/events/{eid}/attendees/import", json={"attendees": people(1, 0, seed=8)}).status_code == 409

        prefs = c.get(f"/attendees/{ids[0]}/preferences").json()
        assert [r["rank"] for r in prefs["ranked"]] == list(range(1, len(prefs["ranked"]) + 1))

        assert c.post(f"/attendees/{ids[0]}/status", json={"status": "available"}).status_code == 409  # not live
        assert c.post(f"/events/{eid}/live").json()["status"] == "live"
        for i in ids:
            assert c.post(f"/attendees/{i}/status", json={"status": "available"}).json()["status"] == "available"
        pool = c.get(f"/events/{eid}/pool").json()
        assert len(pool["waiting"]) == 6 and pool["next_refresh_trigger"] == "pool_threshold"

        run = c.post(f"/events/{eid}/refresh").json()
        assert run["refresh_run_id"] and run["pairs_made"] >= 1
        assert c.get(f"/refresh-runs/{run['refresh_run_id']}").json()["pairs_made"] == run["pairs_made"]
        assert c.post(f"/events/{eid}/refresh").json()["refresh_run_id"] is None  # unchanged pool

        cur = next(c.get(f"/attendees/{i}/current").json() for i in ids if c.get(f"/attendees/{i}/current").json()["conversation"])
        conv = cur["conversation"]
        clock.advance(120)
        assert c.post(f"/conversations/{conv['id']}/end", json={"ended_by": cur["attendee_id"]}).json()["changed"] is True
        assert c.post(f"/conversations/{conv['id']}/end", json={"ended_by": cur["attendee_id"]}).json()["changed"] is False
        after = c.get(f"/attendees/{conv['partner_id']}/current").json()
        assert after["status"] == "available" and after["waiting_seconds"] == 0

        assert c.post(f"/attendees/{cur['attendee_id']}/status", json={"status": "away"}).json()["status"] == "away"
        assert c.get("/attendees/00000000-0000-0000-0000-000000000000/current").status_code == 404


def test_scheduler_fires_refresh_on_real_clock(sf):
    """The live scheduler task wakes on check-in and fires at the pool threshold without a manual call."""
    from matchmaker.clock import SystemClock

    app = create_app(sf=sf, clock=SystemClock(), scorer_factory=FakeScorer, run_scheduler=True)
    with TestClient(app) as c:
        eid = c.post("/events", json={"name": "sched", "config": {"refresh_min_per_side": 2}}).json()["id"]
        ids = c.post(f"/events/{eid}/attendees/import", json={"attendees": people(2, 2, seed=9, avoid_rate=0)}).json()["ids"]
        c.post(f"/events/{eid}/precompute")
        for _ in range(100):
            if c.get(f"/events/{eid}/precompute").json()["status"] == "ready":
                break
            time.sleep(0.05)
        c.post(f"/events/{eid}/live")
        for i in ids:
            c.post(f"/attendees/{i}/status", json={"status": "available"})
        for _ in range(100):
            if any(c.get(f"/attendees/{i}/current").json()["conversation"] for i in ids):
                break
            time.sleep(0.05)
        assert any(c.get(f"/attendees/{i}/current").json()["conversation"] for i in ids)


def test_events_and_roster(sf, clock):
    app = create_app(sf=sf, clock=clock, scorer_factory=FakeScorer, run_scheduler=False)
    with TestClient(app) as c:
        eid = c.post("/events", json={"name": "roster", "side_a_label": "founder", "side_b_label": "investor"}).json()["id"]
        ids = c.post(f"/events/{eid}/attendees/import", json={"attendees": people(4, 3, seed=9)}).json()["ids"]

        assert c.get("/events").json()[0]["id"] == eid  # newest first

        r = c.get(f"/events/{eid}/attendees").json()
        assert r["event"]["side_a_label"] == "founder"
        assert sorted(a["id"] for a in r["attendees"]) == sorted(ids)
        tokens = [a["token"] for a in r["attendees"]]
        assert len(set(tokens)) == len(tokens)
        assert all(re.fullmatch(r"[A-Z0-9]{4}", t) for t in tokens)
        assert {a["side_label"] for a in r["attendees"] if a["side"] == "B"} == {"investor"}
        assert c.get(f"/events/{eid}/attendees").json() == r  # tokens are stable across calls
        assert c.get("/events/00000000-0000-0000-0000-000000000000/attendees").status_code == 404


def test_ble_tokens_resolve_collisions(monkeypatch):
    from matchmaker import setup

    monkeypatch.setattr(setup, "_token", lambda aid, salt: f"AAA{salt}")
    ids = [uuid.uuid4() for _ in range(3)]
    assert sorted(setup.ble_tokens(ids).values()) == ["AAA0", "AAA1", "AAA2"]
