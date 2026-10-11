"""Bridge from the host dashboard (web/, a Cloudflare Worker) to the matchmaker.

Both share one Supabase database: the Worker's tables live in `public`, ours in `matchmaker`. When the host
clicks Run matching, the Worker sets `public.events.mm_status = 'requested'`. The bridge claims the request,
imports the guests who answered as attendees, runs Flow 1 (Jev precompute), takes the event live so the Arrow
app picks it up, and writes each guest's one person to meet to `public.matches` for the guest page.

Two ways in:
- Serverless (Vercel): the Worker POSTs /bridge/{id} and `claim_one` takes that request. Work stops at the
  function's deadline and leaves `mm_status = 'running'`; while it works it refreshes `mm_heartbeat_at`. When
  the heartbeat goes stale (deadline, crash), the dashboard's next poll calls /bridge again and it resumes.
- Long-lived server (uvicorn): `run` polls for requests. Claims use SKIP LOCKED. A 'running' request left behind
  by a crash is resumed when the bridge next starts.
"""

import asyncio
import logging
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from sqlalchemy import select, text, update
from sqlalchemy.orm import Session, sessionmaker

from matchmaker import setup
from matchmaker.config import get_settings
from matchmaker.matching import max_weight_pairs, stable_roommates
from matchmaker.models import Attendee, Event, PairScore
from matchmaker.precompute import worker
from matchmaker.precompute.scorer import Scorer

log = logging.getLogger(__name__)

POLL_SECONDS = 3.0
PROGRESS_SECONDS = 2.0
STALE_SECONDS = 45  # a 'running' request with no heartbeat for this long is up for grabs again
STRONG_FIT = 0.75  # a dimension's normalized expected level at or above this counts as a clear fit in reasons


@dataclass(frozen=True)
class WebEvent:
    id: str
    name: str
    mm_event_id: uuid.UUID | None


def available(sf: sessionmaker[Session]) -> bool:
    """True when the Worker's tables, with the handoff columns from web/schema.sql, are in this database."""
    with sf() as s:
        return (
            s.execute(
                text(
                    "SELECT 1 FROM information_schema.columns"
                    " WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'mm_status'"
                )
            ).first()
            is not None
        )


def claim(sf: sessionmaker[Session], resume: bool = False) -> WebEvent | None:
    """Take the oldest request. With `resume`, also take one left 'running' (only safe at startup)."""
    states = "('requested', 'running')" if resume else "('requested')"
    with sf() as s, s.begin():
        row = s.execute(
            text(
                f"""
                UPDATE public.events SET mm_status = 'running', mm_error = NULL, mm_heartbeat_at = now()
                WHERE id = (
                    SELECT id FROM public.events WHERE mm_status IN {states}
                    ORDER BY mm_status DESC, mm_requested_at NULLS FIRST LIMIT 1
                    FOR UPDATE SKIP LOCKED
                )
                RETURNING id, name, mm_event_id
                """
            )
        ).first()
    return WebEvent(row.id, row.name, row.mm_event_id) if row else None


def claim_one(sf: sessionmaker[Session], web_id: str) -> WebEvent | None:
    """Take this event's request if it's waiting, or if the job running it has gone quiet."""
    with sf() as s, s.begin():
        row = s.execute(
            text(
                """
                UPDATE public.events SET mm_status = 'running', mm_error = NULL, mm_heartbeat_at = now()
                WHERE id = :id AND (
                    mm_status = 'requested'
                    OR (mm_status = 'running'
                        AND (mm_heartbeat_at IS NULL OR mm_heartbeat_at < now() - make_interval(secs => :stale)))
                )
                RETURNING id, name, mm_event_id
                """
            ),
            {"id": web_id, "stale": STALE_SECONDS},
        ).first()
    return WebEvent(row.id, row.name, row.mm_event_id) if row else None


def say(sf: sessionmaker[Session], web_id: str, msg: str) -> None:
    """Append to the dashboard's activity log."""
    log.info("[%s] %s", web_id, msg)
    with sf() as s, s.begin():
        s.execute(text("INSERT INTO public.logs (event_id, msg) VALUES (:id, :msg)"), {"id": web_id, "msg": msg})


# ------------------------------------------------------------------ import


def _answers(raw: Any) -> dict[str, str]:
    """public.people.answers is [{key, question, answer}]; answers are null when the guest skipped one."""
    out = {}
    for a in raw or []:
        v = a.get("answer")
        if v is not None and str(v).strip():
            out[a["key"]] = str(v).strip()
    return out


def to_attendee(guest: dict[str, Any]) -> dict[str, Any]:
    """Map a dashboard guest to a matchmaker attendee. The transcript stands in when extraction found nothing."""
    a = _answers(guest["answers"])
    role = " at ".join(x for x in (a.get("position"), a.get("company")) if x)
    about = "; ".join(
        x
        for x in (role, a.get("interest") and f"working on {a['interest']}", a.get("hobby") and f"for fun: {a['hobby']}")
        if x
    )
    heard = (guest["transcript"] or "").strip()[:600]
    return {
        "external_ref": guest["uid"],
        "display_name": guest["name"] or "Guest",
        "seeking_text": a.get("goal") or heard or "Open to meeting anyone",
        "offering_text": about or heard or "Nothing shared yet",
        "tags": {
            "topics": [x for x in (a.get("interest"), a.get("hobby")) if x],
            "goals": [a["goal"]] if a.get("goal") else [],
            "answers": a,  # kept for the reasons on the guest page; cards only read topics and goals
        },
    }


def import_guests(sf: sessionmaker[Session], web: WebEvent) -> uuid.UUID:
    """Create a matchmaker event from the guests who answered and record it on the dashboard event."""
    with sf() as s:
        guests = (
            s.execute(
                text(
                    "SELECT uid, name, answers, transcript FROM public.people"
                    " WHERE event_id = :id AND status = 'answered' ORDER BY created_at, uid"
                ),
                {"id": web.id},
            )
            .mappings()
            .all()
        )
    if len(guests) < 2:
        raise ValueError(f"need at least 2 guests who answered (have {len(guests)})")
    mm_id = setup.create_event(sf, web.name, config={"web_event_id": web.id})
    setup.import_attendees(sf, mm_id, [to_attendee(dict(g)) for g in guests])
    with sf() as s, s.begin():
        s.execute(
            text("UPDATE public.events SET mm_event_id = :mm, mm_done = 0, mm_total = :n WHERE id = :id"),
            {"id": web.id, "mm": mm_id, "n": len(guests) * (len(guests) - 1)},
        )
    return mm_id


# ------------------------------------------------------------------ precompute


def _progress(sf: sessionmaker[Session], web_id: str, mm_id: uuid.UUID) -> None:
    with sf() as s, s.begin():
        e = s.get(Event, mm_id)
        s.execute(
            text(
                "UPDATE public.events SET mm_done = :d, mm_total = :t, mm_heartbeat_at = now()"
                " WHERE id = :id AND mm_event_id = :mm"
            ),
            {"id": web_id, "mm": mm_id, "d": e.precompute_done, "t": e.precompute_total},
        )


async def run_scorer(
    sf: sessionmaker[Session], mm_id: uuid.UUID, scorer_factory: Callable[[], Scorer], deadline: float | None = None
) -> str:
    """Run Flow 1 for one event on its own thread and event loop: the scoring loop does blocking DB writes,
    which would otherwise stall the server's loop. Returns the event status (`precomputing` = call again)."""
    scorer = scorer_factory()
    concurrency = get_settings().precompute_concurrency

    async def go() -> str:
        if hasattr(scorer, "check_model"):
            await scorer.check_model()
        try:
            return await worker.run_precompute(sf, mm_id, scorer, concurrency, deadline=deadline)
        finally:
            if hasattr(scorer, "aclose"):
                await scorer.aclose()

    return await asyncio.to_thread(asyncio.run, go())


async def precompute(
    sf: sessionmaker[Session],
    web_id: str,
    mm_id: uuid.UUID,
    scorer_factory: Callable[[], Scorer],
    deadline: float | None = None,
) -> str:
    """`run_scorer`, copying progress (and a heartbeat) to the dashboard while it runs."""
    job = asyncio.create_task(run_scorer(sf, mm_id, scorer_factory, deadline))
    while not job.done():
        await asyncio.to_thread(_progress, sf, web_id, mm_id)
        await asyncio.wait({job}, timeout=PROGRESS_SECONDS)
    await asyncio.to_thread(_progress, sf, web_id, mm_id)
    return job.result()


def _pause(sf: sessionmaker[Session], web_id: str, mm_id: uuid.UUID) -> None:
    with sf() as s, s.begin():
        s.execute(
            text("UPDATE public.events SET mm_heartbeat_at = NULL WHERE id = :id AND mm_event_id = :mm AND mm_status = 'running'"),
            {"id": web_id, "mm": mm_id},
        )


# ------------------------------------------------------------------ publish


def _fit(ps: PairScore, key: str) -> float:
    d = (ps.dimensions or {}).get(key)
    if not d or len(d["probabilities"]) < 2:
        return 0.0
    return d["expected"] / (len(d["probabilities"]) - 1)


def reason(other: Attendee, fwd: PairScore, back: PairScore) -> str:
    """Why the viewer should meet `other`, from Jev's dimension scores in both directions."""
    a = (other.tags or {}).get("answers") or {}
    name = other.display_name.split(" ")[0]
    role = " at ".join(x for x in (a.get("position"), a.get("company")) if x)
    who = f"{name} ({role})" if role else name
    goal = a.get("goal")
    they_have = max(_fit(fwd, "goal_fit"), _fit(fwd, "offer_fit")) >= STRONG_FIT
    you_have = max(_fit(back, "goal_fit"), _fit(back, "offer_fit")) >= STRONG_FIT
    if they_have and you_have:
        return f"It goes both ways: {who} has what you're looking for, and you're who they want to meet."
    if they_have:
        return f"{who} has what you said you're looking for."
    if you_have and goal:
        return f"{name} is looking for {goal}, and that's you."
    if _fit(fwd, "interest_overlap") >= STRONG_FIT and a.get("interest"):
        return f"You're into the same things: {name} is working on {a['interest']}."
    if goal:
        return f"{who} is looking for {goal}."
    return f"{name} is your best match from what you both told us."


def publish(sf: sessionmaker[Session], web_id: str, mm_id: uuid.UUID) -> tuple[int, int] | None:
    """Give each guest one person to meet: their partner in a stable pairing over the frozen lists, or, if left
    unpaired, their top pick. Replaces the event's public.matches. Returns (guests, mutual pairs' guests), or
    None if the host re-ran matching in the meantime."""
    with sf() as s, s.begin():
        if not s.execute(
            text("SELECT 1 FROM public.events WHERE id = :id AND mm_event_id = :mm FOR UPDATE"), {"id": web_id, "mm": mm_id}
        ).first():
            return None
        present = set(s.scalars(text("SELECT uid FROM public.people WHERE event_id = :id"), {"id": web_id}))
        people = {
            a.id: a
            for a in s.scalars(select(Attendee).where(Attendee.event_id == mm_id))
            if a.external_ref in present  # the host may have removed a guest since the import
        }
        scores = s.scalars(select(PairScore).where(PairScore.event_id == mm_id)).all()
        by_pair = {(r.from_attendee_id, r.to_attendee_id): r for r in scores}
        prefs: dict[uuid.UUID, list[uuid.UUID]] = {x: [] for x in people}
        for r in sorted((r for r in scores if r.rank is not None), key=lambda r: r.rank):
            if r.from_attendee_id in people and r.to_attendee_id in people:
                prefs[r.from_attendee_id].append(r.to_attendee_id)
        pairing = stable_roommates(prefs)
        if pairing is None:
            pairing = max_weight_pairs(prefs)

        rows = []
        for x, me in people.items():
            to = pairing.get(x) or (prefs[x][0] if prefs[x] else None)
            if to is None:
                continue  # dealbreakers ruled out everyone
            fwd, back = by_pair[(x, to)], by_pair[(to, x)]
            rows.append(
                {
                    "event_id": web_id,
                    "uid": me.external_ref,
                    "match_uid": people[to].external_ref,
                    "score": round(5 * ((fwd.aggregate or 0) + (back.aggregate or 0)), 1),  # 0-10, symmetric
                    "reason": reason(people[to], fwd, back),
                    "must_meet": pairing.get(x) == to,
                }
            )
        s.execute(text("DELETE FROM public.matches WHERE event_id = :id"), {"id": web_id})
        if rows:
            s.execute(
                text(
                    "INSERT INTO public.matches (event_id, uid, match_uid, rank, score, reason, must_meet)"
                    " VALUES (:event_id, :uid, :match_uid, 1, :score, :reason, :must_meet)"
                ),
                rows,
            )
        s.execute(text("UPDATE public.events SET mm_status = 'done', mm_error = NULL WHERE id = :id"), {"id": web_id})
    return len(rows), sum(r["must_meet"] for r in rows)


def close_previous(sf: sessionmaker[Session], web_id: str, keep: uuid.UUID) -> None:
    """Earlier matchmaker events for this dashboard event stop running once a re-run goes live."""
    with sf() as s, s.begin():
        s.execute(
            update(Event)
            .where(Event.config["web_event_id"].astext == web_id, Event.id != keep, Event.status == "live")
            .values(status="closed")
        )


# ------------------------------------------------------------------ loop


async def process(
    sf: sessionmaker[Session],
    web: WebEvent,
    scorer_factory: Callable[[], Scorer],
    on_live: Callable[[uuid.UUID], None] | None = None,
    deadline: float | None = None,
) -> None:
    mm_id = web.mm_event_id
    try:
        with sf() as s:
            mm_event = s.get(Event, mm_id) if mm_id else None
        if mm_event is None:
            mm_id = await asyncio.to_thread(import_guests, sf, web)
            with sf() as s:
                n = len(s.scalars(select(Attendee.id).where(Attendee.event_id == mm_id)).all())
            await asyncio.to_thread(say, sf, web.id, f"Matchmaker: scoring {n} guests with Jev ({n * (n - 1)} pairs)")
        if mm_event is None or mm_event.status in ("draft", "precomputing"):
            status = await precompute(sf, web.id, mm_id, scorer_factory, deadline)
            if status != "ready":
                with sf() as s:
                    e = s.get(Event, mm_id)
                if e.precompute_failed:
                    raise RuntimeError(f"precompute stopped with {e.precompute_failed} failed pairs (see the matchmaker log)")
                # Out of time: stay 'running' and clear the heartbeat so the dashboard's next poll resumes it.
                await asyncio.to_thread(_pause, sf, web.id, mm_id)
                await asyncio.to_thread(
                    say, sf, web.id, f"Matchmaker: paused at {e.precompute_done} of {e.precompute_total} pairs, resuming"
                )
                return
        await asyncio.to_thread(setup.go_live, sf, mm_id)
        await asyncio.to_thread(close_previous, sf, web.id, mm_id)
        if on_live:
            on_live(mm_id)
        result = await asyncio.to_thread(publish, sf, web.id, mm_id)
        if result is None:
            await asyncio.to_thread(say, sf, web.id, "Matchmaker: matching was re-run, so this result was dropped")
            return
        n, mutual = result
        await asyncio.to_thread(say, sf, web.id, f"Matched {n} guests ({mutual} mutual) · matchmaker event {mm_id} is live")
    except worker.PrecomputeConflict:
        # A job that died recently still holds the precompute lease; it expires within a minute and the next
        # kick (heartbeat set at claim, so ~45 s) picks the work back up.
        log.info("precompute lease still held for dashboard event %s; will retry", web.id)
    except Exception as e:
        log.exception("bridge failed for dashboard event %s", web.id)
        with sf() as s, s.begin():
            s.execute(
                text(
                    "UPDATE public.events SET mm_status = 'failed', mm_error = :err"
                    " WHERE id = :id AND mm_status = 'running' AND (mm_event_id IS NULL OR mm_event_id = :mm)"
                ),
                {"id": web.id, "mm": mm_id, "err": str(e)[:500]},
            )
        await asyncio.to_thread(say, sf, web.id, f"✗ Matchmaker: {e}")


async def run(
    sf: sessionmaker[Session],
    scorer_factory: Callable[[], Scorer],
    on_live: Callable[[uuid.UUID], None] | None = None,
    poll: float = POLL_SECONDS,
) -> None:
    """Poll for Run matching requests until cancelled."""
    if not await asyncio.to_thread(available, sf):
        log.warning("public.events has no mm_status column: apply web/schema.sql to connect the host dashboard")
        return
    log.info("host dashboard bridge is polling for Run matching requests")
    resume = True
    while True:
        try:
            web = await asyncio.to_thread(claim, sf, resume)
            if web is None:
                resume = False
                await asyncio.sleep(poll)
                continue
            await process(sf, web, scorer_factory, on_live)
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("host dashboard bridge error")
            await asyncio.sleep(poll)
