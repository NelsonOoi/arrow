"""The Scorer protocol and the internal result type. Nothing outside jev.py depends on SDK types."""

import math
from dataclasses import dataclass, field
from typing import Any, Protocol

from matchmaker.cards import Profile


@dataclass(frozen=True)
class DimensionResult:
    level: int  # argmax of probabilities
    expected: float  # probability-weighted level, 0..L-1
    probabilities: list[float]
    confidence: float


@dataclass(frozen=True)
class JevResult:
    dimensions: dict[str, DimensionResult]
    dealbreaker_prob: float
    raw_response: dict[str, Any] = field(default_factory=dict)
    request_id: str | None = None


class RetryableScorerError(Exception):
    """Rate limit, timeout, connection or server error: the worker retries these."""


class Scorer(Protocol):
    async def score(self, seeker: Profile, candidate: Profile, rubric: dict[str, Any]) -> JevResult: ...


def spread_confidence(probabilities: list[float]) -> float:
    """1 minus normalized entropy: 1.0 when all mass is on one level, lower as it spreads."""
    n = len(probabilities)
    if n < 2:
        return 1.0
    h = -sum(p * math.log(p) for p in probabilities if p > 0)
    return max(0.0, 1.0 - h / math.log(n))
