"""Event setup: create, import attendees, go live, and the preferences debug view. Shared by the API, the
seed script and the simulator."""

import hashlib
import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from matchmaker.cards import profile_hash
from matchmaker.config import DEFAULT_CONFIG, DEFAULT_RUBRIC
from matchmaker.models import Attendee, Event, PairScore
from matchmaker.precompute.worker import to_profile
from matchmaker.refresh import Conflict


TOKEN_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
TOKEN_LENGTH = 4  # the app advertises `AR` + token as its BLE local name, so this must stay 4 chars of A-Z/0-9


def _token(attendee_id: uuid.UUID, salt: int) -> str:
    n = int.from_bytes(hashlib.sha256(f"{attendee_id}:{salt}".encode()).digest()[:8])
    out = ""
    for _ in range(TOKEN_LENGTH):
        n, r = divmod(n, len(TOKEN_ALPHABET))
        out += TOKEN_ALPHABET[r]
    return out


def ble_tokens(attendee_ids: list[uuid.UUID]) -> dict[uuid.UUID, str]:
    """Stable, event-unique BLE tokens. Ids are taken in sorted order, so a collision always bumps the same one."""
    taken: set[str] = set()
    out: dict[uuid.UUID, str] = {}
    for aid in sorted(attendee_ids):
        salt = 0
        while (t := _token(aid, salt)) in taken:
            salt += 1
        taken.add(t)
        out[aid] = t
    return out


def create_event(
    sf: sessionmaker[Session],
    name: str,
    rubric: dict[str, Any] | None = None,
    config: dict[str, Any] | None = None,
    side_a_label: str = "mentee",
    side_b_label: str = "mentor",
) -> uuid.UUID:
    rubric = rubric or DEFAULT_RUBRIC
    validate_rubric(rubric)
    with sf() as s, s.begin():
        e = Event(
            name=name,
            rubric=rubric,
            config={**DEFAULT_CONFIG, **(config or {})},
            side_a_label=side_a_label,
            side_b_label=side_b_label,
        )
        s.add(e)
        s.flush()
        return e.id


def validate_rubric(rubric: dict[str, Any]) -> None:
    dims = rubric.get("dimensions") or []
    if not dims:
        raise ValueError("rubric needs at least one dimension")
    keys = set()
    for d in dims:
        if not 2 <= len(d.get("levels", [])) <= 10:
            raise ValueError(f"dimension {d.get('key')} needs 2 to 10 levels")
        if d["key"] in keys or d["key"] == "dealbreaker":
            raise ValueError(f"duplicate or reserved dimension key {d['key']}")
        if d["weight"] <= 0:
            raise ValueError("weights must be positive")
        keys.add(d["key"])
    if not rubric.get("dealbreaker_question"):
        raise ValueError("rubric needs a dealbreaker_question")


def import_attendees(sf: sessionmaker[Session], event_id: uuid.UUID, people: list[dict[str, Any]]) -> list[uuid.UUID]:
    """Bulk-load attendees. Rejected once precompute starts (preferences are frozen)."""
    with sf() as s, s.begin():
        event = s.execute(select(Event).where(Event.id == event_id).with_for_update()).scalar_one_or_none()
        if event is None:
            raise LookupError("event not found")
        if event.status != "draft":
            raise Conflict(f"event is {event.status}; attendees can only be imported in draft")
        rows = []
        for p in people:
            a = Attendee(
                event_id=event_id,
                external_ref=p.get("external_ref") or p.get("id"),
                display_name=p["display_name"],
                side=p["side"],
                seeking_text=p["seeking_text"],
                offering_text=p["offering_text"],
                avoid_text=p.get("avoid_text", ""),
                tags=p.get("tags", {}),
                profile_hash="",
            )
            a.profile_hash = profile_hash(to_profile(a))
            rows.append(a)
        s.add_all(rows)
        s.flush()
        return [a.id for a in rows]


def go_live(sf: sessionmaker[Session], event_id: uuid.UUID) -> None:
    with sf() as s, s.begin():
        event = s.execute(select(Event).where(Event.id == event_id).with_for_update()).scalar_one_or_none()
        if event is None:
            raise LookupError("event not found")
        if event.status == "live":
            return
        if event.status != "ready":
            raise Conflict(f"event is {event.status}; it must be ready (precompute finished) to go live")
        event.status = "live"


def preferences(sf: sessionmaker[Session], attendee_id: uuid.UUID) -> dict[str, Any]:
    """Debug: the person's ranked list with every dimension score, the Noul probability and confidence."""
    with sf() as s:
        me = s.get(Attendee, attendee_id)
        if me is None:
            raise LookupError("attendee not found")
        rows = s.execute(
            select(PairScore, Attendee)
            .join(Attendee, Attendee.id == PairScore.to_attendee_id)
            .where(PairScore.from_attendee_id == attendee_id)
            .order_by(PairScore.rank.asc().nulls_last(), PairScore.aggregate.desc().nulls_last())
        ).all()

        def item(ps: PairScore, a: Attendee) -> dict[str, Any]:
            return {
                "rank": ps.rank,
                "to_attendee_id": a.id,
                "external_ref": a.external_ref,
                "name": a.display_name,
                "status": ps.status,
                "aggregate": ps.aggregate,
                "min_confidence": ps.min_confidence,
                "dealbreaker_prob": ps.dealbreaker_prob,
                "acceptable": ps.acceptable,
                "dimensions": ps.dimensions,
            }

        return {
            "attendee_id": me.id,
            "external_ref": me.external_ref,
            "name": me.display_name,
            "side": me.side,
            "ranked": [item(ps, a) for ps, a in rows if ps.rank is not None],
            "unacceptable": [item(ps, a) for ps, a in rows if ps.rank is None],
        }


def list_events(sf: sessionmaker[Session]) -> list[dict[str, Any]]:
    """Newest first, so the app can pick the most recent live event."""
    with sf() as s:
        rows = s.scalars(select(Event).order_by(Event.created_at.desc())).all()
        return [
            {
                "id": e.id,
                "name": e.name,
                "status": e.status,
                "side_a_label": e.side_a_label,
                "side_b_label": e.side_b_label,
                "created_at": e.created_at,
            }
            for e in rows
        ]


def roster(sf: sessionmaker[Session], event_id: uuid.UUID) -> dict[str, Any]:
    """Public profile of everyone at the event, with the BLE token each phone advertises."""
    with sf() as s:
        event = s.get(Event, event_id)
        if event is None:
            raise LookupError("event not found")
        people = s.scalars(select(Attendee).where(Attendee.event_id == event_id).order_by(Attendee.external_ref, Attendee.id)).all()
        tokens = ble_tokens([a.id for a in people])
        labels = {"A": event.side_a_label, "B": event.side_b_label}
        return {
            "event": {"id": event.id, "name": event.name, "status": event.status, "side_a_label": event.side_a_label, "side_b_label": event.side_b_label},
            "attendees": [
                {
                    "id": a.id,
                    "external_ref": a.external_ref,
                    "display_name": a.display_name,
                    "side": a.side,
                    "side_label": labels[a.side],
                    "offering_text": a.offering_text,
                    "seeking_text": a.seeking_text,
                    "topics": a.tags.get("topics") or [],
                    "goals": a.tags.get("goals") or [],
                    "token": tokens[a.id],
                    "status": a.status,
                }
                for a in people
            ],
        }
