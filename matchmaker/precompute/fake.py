"""Deterministic, meaningful stand-in for Jev: keyword overlap between the seeker and candidate."""

import re
from typing import Any

from matchmaker.cards import Profile
from matchmaker.precompute.scorer import DimensionResult, JevResult, spread_confidence

_STOP = {
    "about", "also", "and", "been", "being", "best", "both", "from", "have", "help", "into", "just", "like",
    "looking", "more", "most", "much", "only", "other", "really", "some", "someone", "that", "their", "them",
    "they", "this", "want", "wants", "what", "when", "where", "which", "while", "with", "work", "would", "your",
    "years", "year", "people", "person", "listed", "none", "nothing",
}


def tokens(text: str) -> set[str]:
    out = set()
    for w in re.findall(r"[a-z0-9]+", text.lower()):
        if len(w) < 4 or w in _STOP:
            continue
        out.add(w[:-1] if w.endswith("s") and len(w) > 4 else w)
    return out


def _tags(p: Profile, key: str) -> str:
    return " ".join(p.tags.get(key) or [])


def _dimension(seek: set[str], offer: set[str], levels: int) -> DimensionResult:
    frac = len(seek & offer) / max(1, min(len(seek), 10))
    expected = (levels - 1) * min(1.0, frac * 2.5)
    lower = int(expected)
    probs = [0.0] * levels
    if lower >= levels - 1:
        probs[-1] = 1.0
    else:
        upper_w = expected - lower
        probs[lower] = 1.0 - upper_w
        probs[lower + 1] = upper_w
    level = max(range(levels), key=lambda i: (probs[i], -i))
    return DimensionResult(level=level, expected=expected, probabilities=probs, confidence=spread_confidence(probs))


class FakeScorer:
    def __init__(self) -> None:
        self.calls: list[tuple[str, str]] = []

    async def score(self, seeker: Profile, candidate: Profile, rubric: dict[str, Any]) -> JevResult:
        self.calls.append((seeker.display_name, candidate.display_name))
        seek_text = tokens(seeker.seeking_text)
        seek_goals = tokens(seeker.seeking_text + " " + _tags(seeker, "goals"))
        offer = tokens(candidate.offering_text)
        offer_all = tokens(candidate.offering_text + " " + _tags(candidate, "topics"))
        sources = {
            "goal_fit": (seek_goals, offer_all),
            "offer_fit": (seek_text, offer),
            "interest_overlap": (tokens(_tags(seeker, "topics") + " " + _tags(seeker, "goals")), tokens(_tags(candidate, "topics"))),
        }
        dims = {}
        for d in rubric["dimensions"]:
            seek, off = sources.get(d["key"], (seek_goals, offer_all))
            dims[d["key"]] = _dimension(seek, off, len(d["levels"]))
        avoid = tokens(seeker.avoid_text)
        dealbreaker = (0.9 if avoid & offer_all else 0.05) if avoid else 0.0
        return JevResult(dimensions=dims, dealbreaker_prob=dealbreaker, raw_response={"scorer": "fake"})
