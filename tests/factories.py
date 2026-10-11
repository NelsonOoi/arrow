"""Small synthetic events for tests."""

import asyncio
import random

from matchmaker import setup
from matchmaker.precompute.fake import FakeScorer
from matchmaker.precompute.worker import run_precompute

TOPICS = ["python", "design", "marketing", "fundraising", "hiring", "sales", "data", "product", "career", "leadership"]


def people(n: int, seed: int = 0, avoid_rate: float = 0.3) -> list[dict]:
    rng = random.Random(seed)
    out = []
    for i in range(n):
        mine = rng.sample(TOPICS, 3)
        want = rng.sample(TOPICS, 3)
        out.append(
            {
                "id": f"p{i:02d}",
                "display_name": f"P{i:02d}",
                "seeking_text": f"Looking for advice on {' and '.join(want)}",
                "offering_text": f"I have experience in {', '.join(mine)}",
                "avoid_text": f"anyone focused on {rng.choice(TOPICS)}" if rng.random() < avoid_rate else "",
                "tags": {"goals": want[:2], "topics": mine},
            }
        )
    return out


def ready_event(sf, n=12, seed=0, config=None, scorer=None):
    eid = setup.create_event(sf, f"test-{seed}", config=config)
    setup.import_attendees(sf, eid, people(n, seed))
    status = asyncio.run(run_precompute(sf, eid, scorer or FakeScorer()))
    assert status == "ready"
    return eid


def live_event(sf, **kw):
    eid = ready_event(sf, **kw)
    setup.go_live(sf, eid)
    return eid
