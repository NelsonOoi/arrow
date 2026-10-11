"""Aggregation and ranking. Pure functions."""

import hashlib
from collections import defaultdict
from collections.abc import Hashable, Iterable
from dataclasses import dataclass
from typing import Any

from matchmaker.precompute.scorer import DimensionResult


def aggregate(dims: dict[str, DimensionResult], rubric: dict[str, Any]) -> tuple[float, float]:
    """Weighted mean of each dimension's expected level normalized to 0..1, and the minimum confidence."""
    num = den = 0.0
    for d in rubric["dimensions"]:
        r = dims[d["key"]]
        norm = r.expected / (len(d["levels"]) - 1)
        num += d["weight"] * norm
        den += d["weight"]
    return num / den, min(r.confidence for r in dims.values())


def tie_break(seed: int, from_id: object, to_id: object) -> int:
    return int.from_bytes(hashlib.sha256(f"{seed}:{from_id}:{to_id}".encode()).digest()[:8], "big")


@dataclass(frozen=True)
class Scored:
    from_id: Hashable
    to_id: Hashable
    aggregate: float
    min_confidence: float
    acceptable: bool


def rank_lists(rows: Iterable[Scored], seed: int) -> dict[tuple[Hashable, Hashable], int | None]:
    """Rank each person's acceptable rows 1..n by aggregate desc, min_confidence desc, then seeded hash.

    Unacceptable rows map to None.
    """
    by_from: dict[Hashable, list[Scored]] = defaultdict(list)
    out: dict[tuple[Hashable, Hashable], int | None] = {}
    for r in rows:
        if r.acceptable:
            by_from[r.from_id].append(r)
        else:
            out[(r.from_id, r.to_id)] = None
    for from_id, lst in by_from.items():
        lst.sort(key=lambda r: (-r.aggregate, -r.min_confidence, tie_break(seed, r.from_id, r.to_id)))
        for i, r in enumerate(lst, start=1):
            out[(from_id, r.to_id)] = i
    return out
