"""Replay a full session on a simulated clock through the real refresh code, so policies compare on identical
conditions (same seed, same frozen lists).

Each run clones the source event (attendees and frozen pair_scores, matched by external_ref) into a fresh
live event, then drives check-ins, conversation ends, step-aways and early leavers in time order, firing a
refresh whenever the trigger says one is due.

    python -m matchmaker.sim --event <id> [--answer-key demo/answer_key.json] [--sweep] [--out demo/out]
"""

import argparse
import heapq
import json
import math
import random
import statistics
import uuid
from dataclasses import asdict, dataclass, field
from datetime import timedelta
from pathlib import Path
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.orm import Session, sessionmaker

from matchmaker import refresh
from matchmaker.baselines import POLICIES
from matchmaker.clock import FakeClock
from matchmaker.db import get_engine, make_sessionmaker
from matchmaker.models import Attendee, Conversation, Event, RefreshRun
from matchmaker.refresh import Conflict, PolicySpec


@dataclass(frozen=True)
class SimConfig:
    duration_s: int = 90 * 60
    arrival_window_s: int = 15 * 60
    mean_conversation_s: float = 6 * 60
    conversation_sigma: float = 0.35  # lognormal spread
    early_leavers: int = 2
    step_aways: int = 4
    step_away_s: int = 5 * 60
    seed: int = 1


@dataclass
class SimResult:
    policy: str
    event_id: uuid.UUID
    metrics: dict[str, Any]
    conversations: list[dict[str, Any]] = field(default_factory=list)


def clone_event(sf: sessionmaker[Session], src_event_id: uuid.UUID, name: str) -> uuid.UUID:
    """Copy an event's attendees and frozen lists into a new live event (attendees start as registered)."""
    with sf() as s, s.begin():
        src = s.get(Event, src_event_id)
        if src.status not in ("ready", "live", "closed"):
            raise Conflict(f"source event is {src.status}; precompute must finish first")
        new = Event(
            name=name,
            rubric=src.rubric,
            config=src.config,
            side_a_label=src.side_a_label,
            side_b_label=src.side_b_label,
            model_version=src.model_version,
            status="live",
            precompute_total=src.precompute_total,
            precompute_done=src.precompute_done,
            precompute_finished_at=src.precompute_finished_at,
        )
        s.add(new)
        s.flush()
        params = {"src": src_event_id, "new": new.id}
        s.execute(
            text(
                """
                INSERT INTO matchmaker.attendees
                  (event_id, external_ref, display_name, side, seeking_text, offering_text, avoid_text, tags, profile_hash)
                SELECT :new, external_ref, display_name, side, seeking_text, offering_text, avoid_text, tags, profile_hash
                FROM matchmaker.attendees WHERE event_id = :src
                """
            ),
            params,
        )
        s.execute(
            text(
                """
                INSERT INTO matchmaker.pair_scores
                  (event_id, from_attendee_id, to_attendee_id, status, dimensions, dealbreaker_prob, aggregate,
                   min_confidence, acceptable, rank, request_id, attempts)
                SELECT :new, nf.id, nt.id, ps.status, ps.dimensions, ps.dealbreaker_prob, ps.aggregate,
                       ps.min_confidence, ps.acceptable, ps.rank, ps.request_id, ps.attempts
                FROM matchmaker.pair_scores ps
                JOIN matchmaker.attendees f  ON f.id = ps.from_attendee_id
                JOIN matchmaker.attendees t  ON t.id = ps.to_attendee_id
                JOIN matchmaker.attendees nf ON nf.event_id = :new AND nf.external_ref = f.external_ref
                JOIN matchmaker.attendees nt ON nt.event_id = :new AND nt.external_ref = t.external_ref
                WHERE ps.event_id = :src
                """
            ),
            params,
        )
        return new.id


def simulate(
    sf: sessionmaker[Session],
    src_event_id: uuid.UUID,
    policy_name: str = "design",
    sim: SimConfig = SimConfig(),
    config_override: dict[str, Any] | None = None,
    answer_key: dict[str, Any] | None = None,
) -> SimResult:
    spec, policy_override = POLICIES[policy_name]
    override = {**policy_override, **(config_override or {})}
    event_id = clone_event(sf, src_event_id, f"sim:{policy_name}:{sim.seed}:{json.dumps(override, sort_keys=True)}")
    clock = FakeClock()
    start = clock.now()
    end = start + timedelta(seconds=sim.duration_s)
    rng = random.Random(sim.seed)

    with sf() as s:
        people = s.execute(
            select(Attendee.id, Attendee.external_ref).where(Attendee.event_id == event_id).order_by(Attendee.external_ref)
        ).all()
    ids = [i for i, _ in people]

    heap: list[tuple[float, int, str, Any]] = []
    seq = 0

    def push(at_s: float, kind: str, payload: Any) -> None:
        nonlocal seq
        seq += 1
        heapq.heappush(heap, (at_s, seq, kind, payload))

    # The schedule depends only on the seed and the sorted external refs, so it is identical across policies.
    for pid in ids:
        push(rng.uniform(0, sim.arrival_window_s), "checkin", pid)
    chosen = rng.sample(ids, min(len(ids), sim.early_leavers + sim.step_aways))
    leavers, steppers = chosen[: sim.early_leavers], chosen[sim.early_leavers :]
    for pid in leavers:
        push(rng.uniform(30 * 60, 75 * 60), "leave", pid)
    for pid in steppers:
        t = rng.uniform(20 * 60, 70 * 60)
        push(t, "away", pid)
        push(t + sim.step_away_s, "back", pid)
    conv_rng = random.Random(sim.seed * 7919 + 1)  # conversation lengths, drawn in creation order
    left: set[uuid.UUID] = set()
    mu = math.log(sim.mean_conversation_s) - sim.conversation_sigma**2 / 2

    def elapsed() -> float:
        return (clock.now() - start).total_seconds()

    def schedule_ends(run_id: uuid.UUID) -> None:
        with sf() as s:
            convs = s.execute(
                select(Conversation.id, Conversation.side_a_attendee_id, Conversation.side_b_attendee_id)
                .join(Attendee, Attendee.id == Conversation.side_a_attendee_id)
                .where(Conversation.refresh_run_id == run_id)
                .order_by(Attendee.external_ref)
            ).all()
        for cid, a, b in convs:
            length = conv_rng.lognormvariate(mu, sim.conversation_sigma)
            push(elapsed() + length, "end", (cid, a if conv_rng.random() < 0.5 else b))

    while True:
        with sf() as s:
            config = {**s.get(Event, event_id).config, **override}
            due = refresh.due_refresh(s, event_id, config)
        next_evt = heap[0][0] if heap else math.inf
        if due is not None:
            due_s = max(elapsed(), (due[0] - start).total_seconds())
            if due_s <= next_evt and due_s <= sim.duration_s:
                clock.set(start + timedelta(seconds=due_s))
                run_id = refresh.run_refresh(sf, event_id, clock, due[1], policy=spec, config_override=override)
                if run_id is not None:
                    schedule_ends(run_id)
                continue
        if next_evt > sim.duration_s:
            break
        t, _, kind, payload = heapq.heappop(heap)
        clock.set(start + timedelta(seconds=t))
        try:
            if kind == "checkin":
                refresh.set_status(sf, payload, "available", clock)
            elif kind == "end":
                cid, by = payload
                refresh.end_conversation(sf, cid, by, clock)
            elif kind == "leave":
                left.add(payload)
                refresh.set_status(sf, payload, "away", clock)
            elif kind == "away":
                refresh.set_status(sf, payload, "away", clock)
            elif kind == "back" and payload not in left:
                refresh.set_status(sf, payload, "available", clock)
        except Conflict:
            pass  # e.g. stepping away before checking in

    clock.set(end)
    metrics, convs = _metrics(sf, event_id, clock, answer_key)
    metrics["policy"] = policy_name
    metrics["config_override"] = override
    metrics["sim"] = asdict(sim)
    return SimResult(policy_name, event_id, metrics, convs)


def _pct(xs: list[float], q: float) -> float | None:
    if not xs:
        return None
    xs = sorted(xs)
    k = (len(xs) - 1) * q
    lo, hi = math.floor(k), math.ceil(k)
    return xs[lo] + (xs[hi] - xs[lo]) * (k - lo)


def _metrics(sf, event_id, clock, answer_key) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    with sf() as s:
        ref = dict(s.execute(select(Attendee.id, Attendee.external_ref).where(Attendee.event_id == event_id)).all())
        convs = s.scalars(select(Conversation).where(Conversation.event_id == event_id).order_by(Conversation.started_at)).all()
        still_waiting = s.execute(
            select(Attendee.available_since).where(Attendee.event_id == event_id, Attendee.status == "available")
        ).scalars().all()
        runs = s.scalars(select(RefreshRun).where(RefreshRun.event_id == event_id)).all()
    now = clock.now()
    waits = [c.a_wait_seconds for c in convs] + [c.b_wait_seconds for c in convs]
    open_waits = [(now - t).total_seconds() for t in still_waiting]
    all_waits = waits + open_waits
    ranks = [c.a_rank_of_b for c in convs] + [c.b_rank_of_a for c in convs]
    per_person = {i: 0 for i in ref}
    for c in convs:
        per_person[c.side_a_attendee_id] += 1
        per_person[c.side_b_attendee_id] += 1
    met = {(ref[c.side_a_attendee_id], ref[c.side_b_attendee_id]) for c in convs}

    double_booked = 0
    by_person: dict[uuid.UUID, list[tuple]] = {}
    for c in convs:
        span = (c.started_at, c.ended_at or now)
        for p in (c.side_a_attendee_id, c.side_b_attendee_id):
            by_person.setdefault(p, []).append(span)
    for spans in by_person.values():
        spans.sort()
        double_booked += sum(1 for x, y in zip(spans, spans[1:]) if y[0] < x[1])

    obvious = (answer_key or {}).get("obvious_pairs", [])
    metrics = {
        "conversations": len(convs),
        "refreshes": len(runs),
        "median_wait_s": _pct(all_waits, 0.5),
        "p90_wait_s": _pct(all_waits, 0.9),
        "median_wait_at_start_s": _pct(waits, 0.5),
        "open_waits_at_end": len(open_waits),
        "conversations_per_person": statistics.mean(per_person.values()) if per_person else 0,
        "mean_partner_rank": statistics.mean(ranks) if ranks else None,
        "obvious_pairs_met": sum(1 for a, b in obvious if (a, b) in met or (b, a) in met),
        "obvious_pairs_total": len(obvious),
        "double_booked": double_booked,
        "repeat_pairs": len(convs) - len(met),
        "exhausted_warnings": sum(1 for r in runs for w in r.warnings if w.get("type") == "exhausted"),
    }
    convs = sorted(convs, key=lambda c: (c.started_at, ref[c.side_a_attendee_id]))
    rows = [
        {
            "conversation_id": str(c.id),
            "a_ref": ref[c.side_a_attendee_id],
            "b_ref": ref[c.side_b_attendee_id],
            "a_rank_of_b": c.a_rank_of_b,
            "b_rank_of_a": c.b_rank_of_a,
            "a_wait_seconds": c.a_wait_seconds,
            "b_wait_seconds": c.b_wait_seconds,
            "started_at": c.started_at.isoformat(),
            "ended_at": c.ended_at.isoformat() if c.ended_at else None,
            "end_reason": c.end_reason,
        }
        for c in convs
    ]
    return metrics, rows


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--event", required=True, type=uuid.UUID, help="source event (ready or live) with frozen lists")
    ap.add_argument("--answer-key", type=Path, default=Path("demo/answer_key.json"))
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--policies", default="design,instant_greedy,random")
    ap.add_argument("--sweep", action="store_true", help="also re-run the design with windows 0, 10, 20, 60 s")
    ap.add_argument("--out", type=Path, default=Path("demo/out"))
    args = ap.parse_args()

    sf = make_sessionmaker(get_engine())
    key = json.loads(args.answer_key.read_text()) if args.answer_key.exists() else None
    sim = SimConfig(seed=args.seed)
    args.out.mkdir(parents=True, exist_ok=True)
    report = {"policies": {}, "sweep": []}
    for name in args.policies.split(","):
        r = simulate(sf, args.event, name, sim, answer_key=key)
        report["policies"][name] = r.metrics
        (args.out / f"sim_{name}_conversations.json").write_text(json.dumps(r.conversations, indent=2))
        print(f"{name:15s} {_fmt(r.metrics)}")
    if args.sweep:
        for w in (0, 10, 20, 60):
            r = simulate(sf, args.event, "design", sim, config_override={"refresh_window_seconds": w}, answer_key=key)
            report["sweep"].append({"window_s": w, **r.metrics})
            print(f"window={w:<3d}       {_fmt(r.metrics)}")
    (args.out / "sim_report.json").write_text(json.dumps(report, indent=2, default=str))
    print(f"wrote {args.out / 'sim_report.json'}")


def _fmt(m: dict[str, Any]) -> str:
    f = lambda v: "-" if v is None else f"{v:.1f}"  # noqa: E731
    return (
        f"convs={m['conversations']:3d} median_wait={f(m['median_wait_s'])}s p90_wait={f(m['p90_wait_s'])}s "
        f"per_person={m['conversations_per_person']:.2f} mean_rank={f(m['mean_partner_rank'])} "
        f"obvious={m['obvious_pairs_met']}/{m['obvious_pairs_total']} double={m['double_booked']} repeat={m['repeat_pairs']}"
    )


if __name__ == "__main__":
    main()
