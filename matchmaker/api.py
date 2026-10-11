"""FastAPI routes: fourteen JSON endpoints, no auth, no push (clients poll GET /attendees/{id}/current)."""

import asyncio
import logging
import threading
import uuid
from contextlib import asynccontextmanager
from typing import Any, Literal

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from matchmaker import refresh, setup
from matchmaker.clock import Clock, SystemClock
from matchmaker.config import get_settings
from matchmaker.db import get_engine, make_sessionmaker
from matchmaker.models import Event, RefreshRun
from matchmaker.precompute import worker
from matchmaker.precompute.scorer import Scorer

log = logging.getLogger(__name__)


def default_scorer() -> Scorer:
    settings = get_settings()
    if settings.scorer == "jev":
        from matchmaker.precompute.jev import JevScorer

        return JevScorer(model=settings.jev_model, api_key=settings.typesafe_api_key)
    from matchmaker.precompute.fake import FakeScorer

    return FakeScorer()


class EventIn(BaseModel):
    name: str
    side_a_label: str = "mentee"
    side_b_label: str = "mentor"
    rubric: dict[str, Any] | None = None
    config: dict[str, Any] | None = None


class AttendeeIn(BaseModel):
    id: str | None = None  # seed-file id, stored as external_ref
    external_ref: str | None = None
    display_name: str
    side: Literal["A", "B"]
    seeking_text: str
    offering_text: str
    avoid_text: str = ""
    tags: dict[str, Any] = {}


class ImportIn(BaseModel):
    attendees: list[AttendeeIn]


class StatusIn(BaseModel):
    status: Literal["available", "away"]


class EndIn(BaseModel):
    ended_by: uuid.UUID


def create_app(
    sf: sessionmaker[Session] | None = None,
    clock: Clock | None = None,
    scorer_factory=default_scorer,
    run_scheduler: bool = True,
) -> FastAPI:
    sf = sf or make_sessionmaker(get_engine())
    clock = clock or SystemClock()
    scheduler = refresh.Scheduler(sf, clock)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        if run_scheduler:
            with sf() as s:
                for (eid,) in s.execute(select(Event.id).where(Event.status == "live")):
                    scheduler.start(eid)
        yield
        await scheduler.stop_all()

    app = FastAPI(title="Event matchmaking prototype", lifespan=lifespan)
    app.state.sf = sf
    app.state.clock = clock
    app.state.scheduler = scheduler

    def guard(fn, *args):
        try:
            return fn(*args)
        except LookupError as e:
            raise HTTPException(404, str(e)) from e
        except (refresh.Conflict, worker.PrecomputeConflict) as e:
            raise HTTPException(409, str(e)) from e
        except ValueError as e:
            raise HTTPException(422, str(e)) from e

    # ------------------------------------------------------------------ setup

    @app.post("/events", status_code=201)
    def create_event(body: EventIn):
        eid = guard(setup.create_event, sf, body.name, body.rubric, body.config, body.side_a_label, body.side_b_label)
        return {"id": eid}

    @app.post("/events/{event_id}/attendees/import", status_code=201)
    def import_attendees(event_id: uuid.UUID, body: ImportIn):
        ids = guard(setup.import_attendees, sf, event_id, [a.model_dump() for a in body.attendees])
        return {"ids": ids}

    @app.get("/events")
    def list_events():
        return setup.list_events(sf)

    @app.get("/events/{event_id}/attendees")
    def get_roster(event_id: uuid.UUID):
        return guard(setup.roster, sf, event_id)

    # ------------------------------------------------------------------ flow 1

    @app.post("/events/{event_id}/precompute", status_code=202)
    def start_precompute(event_id: uuid.UUID):
        if worker.is_running(event_id):
            raise HTTPException(409, "precompute is already running for this event")
        guard(worker.prepare, sf, event_id)  # validates state and freezes synchronously
        scorer = scorer_factory()
        settings = get_settings()

        def run() -> None:
            async def go():
                if hasattr(scorer, "check_model"):
                    await scorer.check_model()
                try:
                    await worker.run_precompute(sf, event_id, scorer, settings.precompute_concurrency)
                finally:
                    if hasattr(scorer, "aclose"):
                        await scorer.aclose()

            try:
                asyncio.run(go())
            except Exception:
                log.exception("precompute failed for event %s; POST /events/%s/precompute again to resume", event_id, event_id)

        threading.Thread(target=run, name=f"precompute:{event_id}", daemon=True).start()
        return guard(worker.report, sf, event_id)

    @app.get("/events/{event_id}/precompute")
    def precompute_progress(event_id: uuid.UUID):
        return guard(worker.report, sf, event_id)

    @app.get("/attendees/{attendee_id}/preferences")
    def get_preferences(attendee_id: uuid.UUID):
        return guard(setup.preferences, sf, attendee_id)

    # ------------------------------------------------------------------ flow 2

    @app.post("/events/{event_id}/live")
    async def go_live(event_id: uuid.UUID):
        await asyncio.to_thread(guard, setup.go_live, sf, event_id)
        if run_scheduler:
            scheduler.start(event_id)
        return {"id": event_id, "status": "live"}

    @app.post("/attendees/{attendee_id}/status")
    def set_status(attendee_id: uuid.UUID, body: StatusIn):
        event_id, changed = guard(refresh.set_status, sf, attendee_id, body.status, clock)
        if changed:
            scheduler.wake(event_id)
        return guard(refresh.current, sf, attendee_id, clock)

    @app.get("/attendees/{attendee_id}/current")
    def get_current(attendee_id: uuid.UUID):
        return guard(refresh.current, sf, attendee_id, clock)

    @app.post("/conversations/{conversation_id}/end")
    def end_conversation(conversation_id: uuid.UUID, body: EndIn):
        event_id, changed = guard(refresh.end_conversation, sf, conversation_id, body.ended_by, clock)
        if changed:
            scheduler.wake(event_id)
        return {"id": conversation_id, "ended": True, "changed": changed}

    @app.get("/events/{event_id}/pool")
    def get_pool(event_id: uuid.UUID):
        return guard(refresh.pool_view, sf, event_id, clock)

    @app.post("/events/{event_id}/refresh")
    def manual_refresh(event_id: uuid.UUID):
        run_id = refresh.run_refresh(sf, event_id, clock, "manual")
        if run_id is None:
            return {"refresh_run_id": None, "skipped": "pool unchanged, event not live, or another refresh is running"}
        return {"refresh_run_id": run_id, **refresh_run(run_id)}

    @app.get("/refresh-runs/{run_id}")
    def refresh_run(run_id: uuid.UUID):
        with sf() as s:
            r = s.get(RefreshRun, run_id)
            if r is None:
                raise HTTPException(404, "refresh run not found")
            return {
                "id": r.id,
                "event_id": r.event_id,
                "trigger": r.trigger,
                "proposer_side": r.proposer_side,
                "seed": r.seed,
                "pool_snapshot": r.pool_snapshot,
                "pairs_made": r.pairs_made,
                "left_waiting": r.left_waiting,
                "warnings": r.warnings,
                "duration_ms": r.duration_ms,
                "created_at": r.created_at,
            }

    return app


def app() -> FastAPI:
    """Factory for `uvicorn --factory matchmaker.api:app`."""
    return create_app()
