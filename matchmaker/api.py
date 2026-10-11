"""FastAPI routes: JSON endpoints, no push (clients poll GET /attendees/{id}/current).

Setup endpoints need `Authorization: Bearer <HOST_KEY>` when HOST_KEY is set; the attendee endpoints the app
uses stay open. Long work (precompute, the dashboard bridge) runs inside the request and is resumable, so it
also works on Vercel, where nothing runs between requests.
"""

import asyncio
import logging
import time
import uuid
from contextlib import asynccontextmanager
from typing import Any, Literal

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from matchmaker import refresh, setup, web_bridge
from matchmaker.clock import Clock, SystemClock
from matchmaker.config import get_settings
from matchmaker.db import get_engine, make_sessionmaker
from matchmaker.models import Attendee, Event, RefreshRun
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
    rubric: dict[str, Any] | None = None
    config: dict[str, Any] | None = None


class AttendeeIn(BaseModel):
    id: str | None = None  # seed-file id, stored as external_ref
    external_ref: str | None = None
    display_name: str
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


DEADLINE_MARGIN_SECONDS = 30  # stop starting new work this long before the function's maxDuration
REFRESH_CHECK_SECONDS = 1.0  # at most one due-refresh check per event per process this often


def work_deadline() -> float | None:
    """time.monotonic() value after which long work should stop and leave the rest for the next call."""
    settings = get_settings()
    if not settings.vercel:
        return None
    return time.monotonic() + settings.max_duration_seconds - DEADLINE_MARGIN_SECONDS


def require_host(authorization: str | None = Header(default=None)) -> None:
    key = get_settings().host_key
    if key and authorization != f"Bearer {key}":
        raise HTTPException(401, "host key required")


def create_app(
    sf: sessionmaker[Session] | None = None,
    clock: Clock | None = None,
    scorer_factory=default_scorer,
    run_scheduler: bool = True,
    refresh_on_request: bool = False,
) -> FastAPI:
    """`run_scheduler`: long-lived server (uvicorn): asyncio tasks fire refreshes and poll for dashboard
    requests. `refresh_on_request`: serverless (Vercel): attendee requests run any refresh that is due."""
    sf = sf or make_sessionmaker(get_engine())
    clock = clock or SystemClock()
    scheduler = refresh.Scheduler(sf, clock)
    last_check: dict[uuid.UUID, float] = {}

    def nudge(event_id: uuid.UUID) -> None:
        """Pool changed or someone polled: wake the scheduler, or on serverless run a due refresh inline."""
        if run_scheduler:
            scheduler.wake(event_id)
        if not refresh_on_request:
            return
        now = time.monotonic()
        if now - last_check.get(event_id, 0.0) < REFRESH_CHECK_SECONDS:
            return
        last_check[event_id] = now
        refresh.maybe_refresh(sf, event_id, clock)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        bridge = None
        if run_scheduler:
            with sf() as s:
                for (eid,) in s.execute(select(Event.id).where(Event.status == "live")):
                    scheduler.start(eid)
            # Picks up Run matching from the host dashboard (web/) and starts the event it takes live.
            bridge = asyncio.create_task(web_bridge.run(sf, scorer_factory, scheduler.start), name="web_bridge")
        yield
        if bridge:
            bridge.cancel()
            await asyncio.gather(bridge, return_exceptions=True)
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

    host = [Depends(require_host)]

    @app.post("/events", status_code=201, dependencies=host)
    def create_event(body: EventIn):
        eid = guard(setup.create_event, sf, body.name, body.rubric, body.config)
        return {"id": eid}

    @app.post("/events/{event_id}/attendees/import", status_code=201, dependencies=host)
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

    @app.post("/events/{event_id}/precompute", status_code=202, dependencies=host)
    async def start_precompute(event_id: uuid.UUID):
        """Runs in the request. If it stops at the deadline (status still `precomputing`), call it again."""
        if await asyncio.to_thread(worker.is_running, sf, event_id):
            raise HTTPException(409, "precompute is already running for this event")
        await asyncio.to_thread(guard, worker.prepare, sf, event_id)  # validates state and freezes
        try:
            await web_bridge.run_scorer(sf, event_id, scorer_factory, work_deadline())
        except worker.PrecomputeConflict as e:
            raise HTTPException(409, str(e)) from e
        except Exception:
            log.exception("precompute failed for event %s; POST /events/%s/precompute again to resume", event_id, event_id)
        return await asyncio.to_thread(guard, worker.report, sf, event_id)

    @app.get("/events/{event_id}/precompute")
    def precompute_progress(event_id: uuid.UUID):
        return guard(worker.report, sf, event_id)

    @app.get("/attendees/{attendee_id}/preferences")
    def get_preferences(attendee_id: uuid.UUID):
        return guard(setup.preferences, sf, attendee_id)

    # ------------------------------------------------------------------ flow 2

    @app.post("/events/{event_id}/live", dependencies=host)
    async def go_live(event_id: uuid.UUID):
        await asyncio.to_thread(guard, setup.go_live, sf, event_id)
        if run_scheduler:
            scheduler.start(event_id)
        return {"id": event_id, "status": "live"}

    @app.post("/attendees/{attendee_id}/status")
    def set_status(attendee_id: uuid.UUID, body: StatusIn):
        event_id, changed = guard(refresh.set_status, sf, attendee_id, body.status, clock)
        if changed:
            nudge(event_id)
        return guard(refresh.current, sf, attendee_id, clock)

    @app.get("/attendees/{attendee_id}/current")
    def get_current(attendee_id: uuid.UUID):
        if refresh_on_request:
            with sf() as s:
                event_id = s.scalar(select(Attendee.event_id).where(Attendee.id == attendee_id))
            if event_id is not None:
                nudge(event_id)
        return guard(refresh.current, sf, attendee_id, clock)

    @app.post("/conversations/{conversation_id}/end")
    def end_conversation(conversation_id: uuid.UUID, body: EndIn):
        event_id, changed = guard(refresh.end_conversation, sf, conversation_id, body.ended_by, clock)
        if changed:
            nudge(event_id)
        return {"id": conversation_id, "ended": True, "changed": changed}

    @app.get("/events/{event_id}/pool")
    def get_pool(event_id: uuid.UUID):
        return guard(refresh.pool_view, sf, event_id, clock)

    @app.post("/events/{event_id}/refresh", dependencies=host)
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
                "seed": r.seed,
                "pool_snapshot": r.pool_snapshot,
                "pairs_made": r.pairs_made,
                "left_waiting": r.left_waiting,
                "warnings": r.warnings,
                "duration_ms": r.duration_ms,
                "created_at": r.created_at,
            }

    # ------------------------------------------------------------------ host dashboard (web/)

    @app.post("/bridge/{web_event_id}", dependencies=host)
    async def run_bridge(web_event_id: str):
        """Called by the dashboard Worker after Run matching, and again whenever its heartbeat goes stale."""
        web = await asyncio.to_thread(web_bridge.claim_one, sf, web_event_id)
        if web is None:
            return {"claimed": False}
        await web_bridge.process(sf, web, scorer_factory, scheduler.start if run_scheduler else None, work_deadline())
        return {"claimed": True}

    return app


def app() -> FastAPI:
    """Factory for `uvicorn --factory matchmaker.api:app`."""
    return create_app()
