"""Check 5: drive a live event over HTTP on the real clock, with conversations sped up to 30-90 s.

Start the server first (`uv run uvicorn --factory matchmaker.api:app`), seed and open an event
(`uv run python -m scripts.seed_demo --precompute --live`), then:

    uv run python -m scripts.live_run --event <id> [--minutes 10]

Staggered check-ins, everyone polls /current every 3 s like a client would, conversations end after
30-90 s, one person leaves mid-conversation, one steps away and comes back. Invariants are checked against
the database every cycle and the pool is printed.
"""

import argparse
import asyncio
import random
import time
import uuid

import httpx
from sqlalchemy import func, select

from matchmaker.db import get_engine, make_sessionmaker
from matchmaker.models import Attendee, Conversation

POLL_S = 3.0


def check_invariants(sf, event_id) -> list[str]:
    problems = []
    with sf() as s:
        people = {a.id: a for a in s.scalars(select(Attendee).where(Attendee.event_id == event_id))}
        convs = s.scalars(select(Conversation).where(Conversation.event_id == event_id)).all()
    active = [p for c in convs if c.status == "active" for p in (c.side_a_attendee_id, c.side_b_attendee_id)]
    if len(active) != len(set(active)):
        problems.append("someone is double-booked")
    for pid, p in people.items():
        if (p.status == "in_conversation") != (pid in active):
            problems.append(f"{p.display_name}: status {p.status} disagrees with conversations")
    pairs = [(c.side_a_attendee_id, c.side_b_attendee_id) for c in convs]
    if len(pairs) != len(set(pairs)):
        problems.append("a pair met twice")
    return problems


async def run(args) -> None:
    sf = make_sessionmaker(get_engine())
    with sf() as s:
        people = s.execute(
            select(Attendee.id, Attendee.display_name).where(Attendee.event_id == args.event).order_by(Attendee.external_ref)
        ).all()
    rng = random.Random(args.seed)
    ids = [i for i, _ in people]
    name = dict(people)
    leaver, stepper = rng.sample(ids, 2)
    checkin_at = {i: rng.uniform(0, args.stagger) for i in ids}
    end_at: dict[uuid.UUID, tuple[float, uuid.UUID]] = {}  # conversation -> (when, ended_by)
    left, stepped_back, step_back_at = False, False, None
    t0 = time.monotonic()
    checked_in: set[uuid.UUID] = set()
    problems_seen = 0

    async with httpx.AsyncClient(base_url=args.base, timeout=10) as c:
        while (now := time.monotonic() - t0) < args.minutes * 60:
            for i in ids:
                if i not in checked_in and now >= checkin_at[i]:
                    (await c.post(f"/attendees/{i}/status", json={"status": "available"})).raise_for_status()
                    checked_in.add(i)
            currents = await asyncio.gather(*(c.get(f"/attendees/{i}/current") for i in checked_in))
            for r in currents:
                cur = r.json()
                conv = cur.get("conversation")
                if conv and uuid.UUID(conv["id"]) not in end_at:
                    by = rng.choice([uuid.UUID(cur["attendee_id"]), uuid.UUID(conv["partner_id"])])
                    end_at[uuid.UUID(conv["id"])] = (now + rng.uniform(args.conv_min, args.conv_max), by)
                    who = uuid.UUID(cur["attendee_id"])
                    # The leaver walks out of their first conversation part-way through.
                    if not left and who == leaver and now > args.stagger:
                        await c.post(f"/attendees/{leaver}/status", json={"status": "away"})
                        left = True
                        print(f"[{now:5.0f}s] {name[leaver]} left the event mid-conversation")
            for cid, (when, by) in list(end_at.items()):
                if when is not None and now >= when:
                    await c.post(f"/conversations/{cid}/end", json={"ended_by": str(by)})
                    end_at[cid] = (None, by)
            if step_back_at is None and now > args.minutes * 60 / 3 and stepper in checked_in:
                await c.post(f"/attendees/{stepper}/status", json={"status": "away"})
                step_back_at = now + 60
                print(f"[{now:5.0f}s] {name[stepper]} stepped away")
            if step_back_at is not None and not stepped_back and now >= step_back_at:
                await c.post(f"/attendees/{stepper}/status", json={"status": "available"})
                stepped_back = True
                print(f"[{now:5.0f}s] {name[stepper]} came back")

            pool = (await c.get(f"/events/{args.event}/pool")).json()
            problems = check_invariants(sf, args.event)
            problems_seen += len(problems)
            waits = [w["waiting_seconds"] for w in pool["waiting"]]
            print(
                f"[{now:5.0f}s] waiting={len(waits):2d} (max {max(waits, default=0):3d}s) active={pool['active_conversations']:2d} "
                f"next={pool['next_refresh_trigger'] or '-'} {'PROBLEMS: ' + '; '.join(problems) if problems else 'ok'}"
            )
            await asyncio.sleep(POLL_S)

    with sf() as s:
        total = s.scalar(select(func.count()).select_from(Conversation).where(Conversation.event_id == args.event))
    print(f"done: {total} conversations, invariant violations seen: {problems_seen}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--event", type=uuid.UUID, required=True)
    ap.add_argument("--base", default="http://127.0.0.1:8000")
    ap.add_argument("--minutes", type=float, default=10)
    ap.add_argument("--stagger", type=float, default=90, help="spread check-ins over this many seconds")
    ap.add_argument("--conv-min", type=float, default=30)
    ap.add_argument("--conv-max", type=float, default=90)
    ap.add_argument("--seed", type=int, default=1)
    asyncio.run(run(ap.parse_args()))


if __name__ == "__main__":
    main()
