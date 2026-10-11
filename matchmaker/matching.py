"""Flow 2's pure core: list filtering, Gale-Shapley and the blocking-pair checker. No database access.

Preference lists are plain ordered lists of ids, best first, possibly incomplete. Ids can be anything
hashable and orderable (uuids in production, ints or strings in tests).
"""

from collections.abc import Hashable, Iterable, Mapping, Sequence
from itertools import permutations
from typing import TypeVar

Id = TypeVar("Id", bound=Hashable)
Prefs = Mapping[Id, Sequence[Id]]


def filter_lists(
    pool_a: Iterable[Id],
    pool_b: Iterable[Id],
    lists: Prefs,
    met: set[tuple[Id, Id]],
) -> tuple[dict[Id, list[Id]], dict[Id, list[Id]]]:
    """Restrict each pool member's frozen list to partners who are in the pool, not met, and mutually acceptable.

    `met` holds (a, b) pairs with a on side A. The frozen order is never changed.
    """
    in_a, in_b = set(pool_a), set(pool_b)
    accepts = {x: set(lists.get(x, ())) for x in in_a | in_b}

    def keep(x: Id, other_pool: set[Id], x_is_a: bool) -> list[Id]:
        return [
            y
            for y in lists.get(x, ())
            if y in other_pool and x in accepts[y] and ((x, y) if x_is_a else (y, x)) not in met
        ]

    return (
        {a: keep(a, in_b, True) for a in sorted(in_a)},
        {b: keep(b, in_a, False) for b in sorted(in_b)},
    )


def gale_shapley(proposers: Prefs, receivers: Prefs) -> dict[Id, Id]:
    """Proposer-optimal stable matching over (possibly incomplete) lists. Returns {proposer: receiver}.

    A proposal is only considered when the receiver lists the proposer; unlisted proposers are rejected.
    Free proposers are processed in sorted order, so the result is deterministic.
    """
    rank = {r: {p: i for i, p in enumerate(lst)} for r, lst in receivers.items()}
    next_choice = {p: 0 for p in proposers}
    held: dict[Id, Id] = {}  # receiver -> proposer
    free = sorted(proposers, reverse=True)  # pop() takes the smallest first
    while free:
        p = free.pop()
        prefs = proposers[p]
        while next_choice[p] < len(prefs):
            r = prefs[next_choice[p]]
            next_choice[p] += 1
            r_rank = rank.get(r, {})
            if p not in r_rank:
                continue
            current = held.get(r)
            if current is None:
                held[r] = p
                break
            if r_rank[p] < r_rank[current]:
                held[r] = p
                free.append(current)
                break
    return {p: r for r, p in held.items()}


def blocking_pairs(matching: Mapping[Id, Id], prefs_x: Prefs, prefs_y: Prefs) -> list[tuple[Id, Id]]:
    """All (x, y) pairs that both list each other and both prefer each other to their current partner (or being alone).

    `matching` maps side-x ids to side-y ids.
    """
    partner_of_y = {y: x for x, y in matching.items()}
    rank_y = {y: {x: i for i, x in enumerate(lst)} for y, lst in prefs_y.items()}
    out = []
    for x, lst in prefs_x.items():
        cur_x = matching.get(x)
        for y in lst:
            if y == cur_x:
                break  # everything after is worse for x
            if x not in rank_y.get(y, {}):
                continue
            cur_y = partner_of_y.get(y)
            if cur_y is None or rank_y[y][x] < rank_y[y][cur_y]:
                out.append((x, y))
    return out


def all_stable_matchings(prefs_x: Prefs, prefs_y: Prefs) -> list[dict[Id, Id]]:
    """Brute-force every stable matching. Exponential; for tests with at most ~6 per side."""
    xs = sorted(prefs_x)
    ys = sorted(prefs_y)
    acceptable = {(x, y) for x in xs for y in prefs_x[x] if x in prefs_y.get(y, ())}
    n = max(len(xs), len(ys))
    padded_ys: list[Id | None] = list(ys) + [None] * (n - len(ys))
    padded_xs: list[Id | None] = list(xs) + [None] * (n - len(xs))
    seen: set[frozenset] = set()
    out = []
    for perm in permutations(padded_ys, n):
        m = {x: y for x, y in zip(padded_xs, perm) if x is not None and y is not None and (x, y) in acceptable}
        key = frozenset(m.items())
        if key in seen:
            continue
        seen.add(key)
        if not blocking_pairs(m, prefs_x, prefs_y):
            out.append(m)
    return out
