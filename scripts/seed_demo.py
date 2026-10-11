"""Create the demo event and its attendees from demo/attendees.json.

    uv run python -m scripts.seed_demo [--precompute] [--live] [--scorer fake|jev]

Prints the event id. With --precompute it runs Flow 1 inline (resumable: re-run with --event to retry
failed rows); with --live it also opens the event.
"""

import argparse
import asyncio
import json
import uuid
from pathlib import Path

from matchmaker import setup
from matchmaker.config import get_settings
from matchmaker.db import get_engine, make_sessionmaker
from matchmaker.precompute import worker


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", type=Path, default=Path("demo/attendees.json"))
    ap.add_argument("--event", type=uuid.UUID, help="resume an existing event instead of creating one")
    ap.add_argument("--precompute", action="store_true")
    ap.add_argument("--live", action="store_true")
    ap.add_argument("--scorer", choices=["fake", "jev"], default=get_settings().scorer)
    args = ap.parse_args()

    sf = make_sessionmaker(get_engine())
    eid = args.event
    if eid is None:
        data = json.loads(args.file.read_text())
        ev = data["event"]
        eid = setup.create_event(sf, ev["name"])
        setup.import_attendees(sf, eid, data["attendees"])
        print(f"created event {eid} with {len(data['attendees'])} attendees")

    if args.precompute:
        if args.scorer == "jev":
            from matchmaker.precompute.jev import JevScorer

            s = get_settings()
            scorer = JevScorer(model=s.jev_model, api_key=s.typesafe_api_key)
        else:
            from matchmaker.precompute.fake import FakeScorer

            scorer = FakeScorer()

        async def go() -> str:
            try:
                if hasattr(scorer, "check_model"):
                    await scorer.check_model()
                return await worker.run_precompute(sf, eid, scorer, get_settings().precompute_concurrency)
            finally:
                if hasattr(scorer, "aclose"):
                    await scorer.aclose()

        status = asyncio.run(go())
        rep = worker.report(sf, eid)
        print(f"precompute: status={status} done={rep['done']}/{rep['total']} failed={rep['failed']} "
              f"low_confidence={len(rep['low_confidence'])}")
        if status != "ready":
            print(f"re-run with --event {eid} --precompute to retry failed rows")
            return
    if args.live:
        setup.go_live(sf, eid)
        print("event is live")
    print(eid)


if __name__ == "__main__":
    main()
