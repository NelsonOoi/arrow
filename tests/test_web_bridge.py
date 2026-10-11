"""The host dashboard bridge: Run matching on the Worker's tables → matchmaker precompute → public.matches."""

import asyncio
import json
import time
import uuid
from pathlib import Path

import pytest
from sqlalchemy import select, text

from matchmaker import web_bridge
from matchmaker.models import Attendee, Event
from matchmaker.precompute import worker
from matchmaker.precompute.fake import FakeScorer

SCHEMA = Path(__file__).parent.parent / "web" / "schema.sql"

GUESTS = [
    ("Ana Ruiz", {"position": "ML engineer", "company": "Acme", "interest": "robotics perception", "goal": "a robotics founder hiring"}),
    ("Ben Cho", {"position": "Robotics founder", "company": "Botco", "interest": "hiring perception engineers", "goal": "an ML engineer for robotics perception"}),
    ("Cy Patel", {"position": "Designer", "company": "Studio", "interest": "typography", "goal": "a typography nerd"}),
    ("Di Okafor", {"position": "Type designer", "company": "Foundry", "interest": "typography and fonts", "goal": "a designer who loves typography"}),
]


@pytest.fixture(scope="module")
def web_tables(engine):
    with engine.begin() as c:
        c.exec_driver_sql(SCHEMA.read_text())


def make_event(sf, answered=GUESTS, pending=1) -> str:
    eid = f"evt_{uuid.uuid4().hex[:8]}"
    with sf() as s, s.begin():
        s.execute(
            text("INSERT INTO public.events (id, name, type, mm_status, mm_requested_at) VALUES (:id, 'Demo night', 'networking', 'requested', now())"),
            {"id": eid},
        )
        rows = [
            {
                "uid": f"u_{eid}_{i}",
                "name": name,
                "status": "answered",
                "answers": json.dumps([{"key": k, "question": k, "answer": v} for k, v in a.items()]),
            }
            for i, (name, a) in enumerate(answered)
        ] + [{"uid": f"u_{eid}_p{i}", "name": f"Pending {i}", "status": "pending", "answers": None} for i in range(pending)]
        for r in rows:
            s.execute(
                text(
                    "INSERT INTO public.people (uid, event_id, name, phone, status, answers, token)"
                    " VALUES (:uid, :eid, :name, '+15550000000', :status, CAST(:answers AS jsonb), :uid)"
                ),
                {**r, "eid": eid},
            )
    return eid


def web_row(sf, eid):
    with sf() as s:
        return s.execute(text("SELECT * FROM public.events WHERE id = :id"), {"id": eid}).mappings().one()


def matches(sf, eid):
    with sf() as s:
        return s.execute(text("SELECT * FROM public.matches WHERE event_id = :id"), {"id": eid}).mappings().all()


def claim_event(sf, eid) -> web_bridge.WebEvent:
    # Other tests' events may also be requested; take this one directly.
    while (web := web_bridge.claim(sf)) is not None and web.id != eid:
        pass
    assert web is not None
    return web


def test_run_matching_end_to_end(sf, web_tables):
    eid = make_event(sf)
    live = []
    asyncio.run(web_bridge.process(sf, claim_event(sf, eid), FakeScorer, live.append))

    row = web_row(sf, eid)
    assert row["mm_status"] == "done", row["mm_error"]
    assert row["mm_done"] == row["mm_total"] == 4 * 3
    assert live == [row["mm_event_id"]]
    with sf() as s:
        assert s.get(Event, row["mm_event_id"]).status == "live"
        refs = set(s.scalars(select(Attendee.external_ref).where(Attendee.event_id == row["mm_event_id"])))
    assert refs == {f"u_{eid}_{i}" for i in range(4)}  # only guests who answered

    got = {m["uid"]: m for m in matches(sf, eid)}
    assert set(got) == refs
    pairs = {(m["uid"], m["match_uid"]) for m in got.values()}
    assert (f"u_{eid}_0", f"u_{eid}_1") in pairs and (f"u_{eid}_2", f"u_{eid}_3") in pairs
    assert all(m["must_meet"] and m["rank"] == 1 and m["reason"] for m in got.values())
    assert got[f"u_{eid}_0"]["reason"].startswith("It goes both ways: Ben (Robotics founder at Botco)")


def test_rerun_closes_the_previous_live_event(sf, web_tables):
    eid = make_event(sf)
    asyncio.run(web_bridge.process(sf, claim_event(sf, eid), FakeScorer))
    first = web_row(sf, eid)["mm_event_id"]
    with sf() as s, s.begin():
        s.execute(text("UPDATE public.events SET mm_status = 'requested', mm_event_id = NULL WHERE id = :id"), {"id": eid})
    asyncio.run(web_bridge.process(sf, claim_event(sf, eid), FakeScorer))
    second = web_row(sf, eid)["mm_event_id"]
    assert second != first
    with sf() as s:
        assert s.get(Event, first).status == "closed"
        assert s.get(Event, second).status == "live"


def test_too_few_answers_fails_with_a_message(sf, web_tables):
    eid = make_event(sf, answered=GUESTS[:1])
    asyncio.run(web_bridge.process(sf, claim_event(sf, eid), FakeScorer))
    row = web_row(sf, eid)
    assert row["mm_status"] == "failed"
    assert "at least 2" in row["mm_error"]
    assert matches(sf, eid) == []


def test_a_rerun_during_precompute_drops_the_stale_result(sf, web_tables):
    eid = make_event(sf)
    web = claim_event(sf, eid)
    mm_id = web_bridge.import_guests(sf, web)
    asyncio.run(web_bridge.precompute(sf, eid, mm_id, FakeScorer))
    with sf() as s, s.begin():  # the host clicked Run matching again meanwhile
        s.execute(text("UPDATE public.events SET mm_status = 'requested', mm_event_id = NULL WHERE id = :id"), {"id": eid})
    assert web_bridge.publish(sf, eid, mm_id) is None
    assert matches(sf, eid) == []
    assert web_row(sf, eid)["mm_status"] == "requested"


def test_transcript_stands_in_for_missing_answers():
    a = web_bridge.to_attendee({"uid": "u1", "name": None, "answers": [{"key": "goal", "question": "?", "answer": None}], "transcript": "I build drones."})
    assert a["display_name"] == "Guest"
    assert a["seeking_text"] == a["offering_text"] == "I build drones."
    assert a["tags"] == {"topics": [], "goals": [], "answers": {}}


# ------------------------------------------------------------------ serverless: /bridge + heartbeat


def set_web(sf, eid, **fields):
    sets = ", ".join(f"{k} = {v}" for k, v in fields.items())
    with sf() as s, s.begin():
        s.execute(text(f"UPDATE public.events SET {sets} WHERE id = :id"), {"id": eid})


def test_claim_one_takes_waiting_or_stale_requests_only(sf, web_tables):
    eid = make_event(sf)
    assert web_bridge.claim_one(sf, eid).id == eid  # requested
    assert web_bridge.claim_one(sf, eid) is None  # running with a fresh heartbeat
    set_web(sf, eid, mm_heartbeat_at="now() - interval '60 seconds'")
    assert web_bridge.claim_one(sf, eid).id == eid  # its job went quiet
    set_web(sf, eid, mm_status="'done'")
    assert web_bridge.claim_one(sf, eid) is None


def test_deadline_pauses_then_the_next_kick_finishes(sf, web_tables):
    eid = make_event(sf)
    asyncio.run(web_bridge.process(sf, web_bridge.claim_one(sf, eid), FakeScorer, deadline=time.monotonic() - 1))
    row = web_row(sf, eid)
    assert row["mm_status"] == "running" and row["mm_event_id"] is not None
    assert row["mm_heartbeat_at"] is None  # so the dashboard's next poll kicks it right away
    assert row["mm_done"] == 0 and matches(sf, eid) == []

    web = web_bridge.claim_one(sf, eid)
    assert web.mm_event_id == row["mm_event_id"]  # resumes the same matchmaker event
    asyncio.run(web_bridge.process(sf, web, FakeScorer))
    row = web_row(sf, eid)
    assert row["mm_status"] == "done" and row["mm_done"] == row["mm_total"] == 12
    assert len(matches(sf, eid)) == 4


def test_a_held_lease_leaves_the_request_running(sf, web_tables):
    eid = make_event(sf)
    web = web_bridge.claim_one(sf, eid)
    mm_id = web_bridge.import_guests(sf, web)
    assert worker.claim_lease(sf, mm_id)  # a job that died a moment ago
    web = web_bridge.claim_one(sf, eid) or web_bridge.WebEvent(eid, web.name, mm_id)
    asyncio.run(web_bridge.process(sf, web, FakeScorer))
    assert web_row(sf, eid)["mm_status"] == "running"
