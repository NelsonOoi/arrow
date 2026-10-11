"""Flow 2's pure core: list filtering, stable roommates (Irving), the max-weight fallback and the blocking-pair
checker. No database access.

Everyone is in one group: anyone can be paired with anyone they mutually accept. Preference lists are plain
ordered lists of ids, best first, possibly incomplete. Ids can be anything hashable and orderable (uuids in
production, ints or strings in tests). A pairing is a symmetric dict: {x: y, y: x} for every pair.
"""

from collections.abc import Hashable, Iterable, Mapping, Sequence
from typing import TypeVar

import networkx as nx

Id = TypeVar("Id", bound=Hashable)
Prefs = Mapping[Id, Sequence[Id]]


def pair_key(x: Id, y: Id) -> tuple[Id, Id]:
    """The canonical (smaller, larger) order for an unordered pair; conversations are stored this way."""
    return (x, y) if x < y else (y, x)


def filter_lists(pool: Iterable[Id], lists: Prefs, met: set[tuple[Id, Id]]) -> dict[Id, list[Id]]:
    """Restrict each pool member's frozen list to people who are in the pool, not met, and mutually acceptable.

    `met` holds canonical pairs (see `pair_key`). The frozen order is never changed.
    """
    in_pool = set(pool)
    accepts = {x: set(lists.get(x, ())) for x in in_pool}
    return {
        x: [y for y in lists.get(x, ()) if y in in_pool and y != x and x in accepts[y] and pair_key(x, y) not in met]
        for x in sorted(in_pool)
    }


def _mutual(prefs: Prefs) -> dict[Id, list[Id]]:
    return {x: [y for y in lst if y != x and x in prefs.get(y, ())] for x, lst in sorted(prefs.items())}


def stable_roommates(prefs: Prefs) -> dict[Id, Id] | None:
    """Irving's algorithm over (possibly incomplete) lists. Returns a stable pairing, or None if none exists.

    People left unpaired are unpaired in every stable pairing. The result is deterministic: free people
    propose in sorted order and rotations are found starting from the smallest id.
    """
    lists = _mutual(prefs)
    rank = {x: {y: i for i, y in enumerate(lst)} for x, lst in lists.items()}
    alive = {x: set(lst) for x, lst in lists.items()}  # entries not yet deleted; kept symmetric

    def delete(x: Id, y: Id) -> None:
        alive[x].discard(y)
        alive[y].discard(x)

    def ordered(x: Id) -> list[Id]:
        return [y for y in lists[x] if y in alive[x]]

    def hold(y: Id, x: Id) -> None:
        """y holds a proposal from x, so y drops everyone it ranks below x."""
        for z in lists[y][rank[y][x] + 1 :]:
            if z in alive[y]:
                delete(y, z)

    # Phase 1: proposals. Holding truncates the holder's list, so anyone still on x's list will accept x.
    holder: dict[Id, Id] = {}
    free = sorted(lists, reverse=True)  # pop() takes the smallest first
    while free:
        x = free.pop()
        if not alive[x]:
            continue  # rejected by everyone: unpaired in every stable pairing
        y = ordered(x)[0]
        bumped = holder.get(y)
        holder[y] = x
        hold(y, x)
        if bumped is not None and bumped != x:
            free.append(bumped)

    paired = {x for x in lists if alive[x]}

    # Phase 2: eliminate rotations until every remaining list has exactly one entry.
    while True:
        start = next((x for x in sorted(paired) if len(alive[x]) > 1), None)
        if start is None:
            break
        ps: list[Id] = []
        qs: list[Id] = []
        seen: dict[Id, int] = {}
        p = start
        while p not in seen:
            seen[p] = len(ps)
            q = ordered(p)[1]
            ps.append(p)
            qs.append(q)
            p = ordered(q)[-1]
        cycle = list(zip(ps[seen[p] :], qs[seen[p] :]))
        for p_i, q_i in cycle:
            hold(q_i, p_i)  # p_i moves from its first choice to its second
        if any(not alive[x] for x in paired):
            return None

    out = {x: next(iter(alive[x])) for x in paired}
    assert all(out[out[x]] == x for x in out), "phase 2 must leave a symmetric pairing"
    return out


def max_weight_pairs(prefs: Prefs) -> dict[Id, Id]:
    """Pair as many people as possible, then maximize mutual preference (lower ranks on both sides).

    The fallback when no stable pairing exists. Always succeeds; makes no stability guarantee.
    """
    lists = _mutual(prefs)
    rank = {x: {y: i for i, y in enumerate(lst)} for x, lst in lists.items()}
    worst = max((len(lst) for lst in lists.values()), default=0) + 1
    g = nx.Graph()
    for x in lists:
        for y in lists[x]:
            if x < y:
                g.add_edge(x, y, weight=2 * worst - rank[x][y] - rank[y][x])
    out: dict[Id, Id] = {}
    for x, y in nx.max_weight_matching(g, maxcardinality=True):
        out[x], out[y] = y, x
    return out


def blocking_pairs(pairing: Mapping[Id, Id], prefs: Prefs) -> list[tuple[Id, Id]]:
    """Every pair (canonical order) who accept each other and would both rather be together than with their
    current partner (or alone)."""
    rank = {x: {y: i for i, y in enumerate(lst)} for x, lst in prefs.items()}
    out = set()
    for x, lst in prefs.items():
        cur_x = pairing.get(x)
        for y in lst:
            if y == cur_x:
                break  # everything after is worse for x
            if y == x or x not in rank.get(y, {}):
                continue
            cur_y = pairing.get(y)
            if cur_y is None or rank[y][x] < rank[y][cur_y]:
                out.add(pair_key(x, y))
    return sorted(out)


def all_stable_pairings(prefs: Prefs) -> list[dict[Id, Id]]:
    """Brute-force every stable pairing. Exponential; for tests with at most ~10 people."""
    lists = _mutual(prefs)
    people = sorted(lists)
    out: list[dict[Id, Id]] = []

    def extend(i: int, cur: dict[Id, Id]) -> None:
        while i < len(people) and people[i] in cur:
            i += 1
        if i == len(people):
            if not blocking_pairs(cur, lists):
                out.append(dict(cur))
            return
        x = people[i]
        extend(i + 1, cur)  # x stays unpaired
        for y in lists[x]:
            if y not in cur:
                cur[x], cur[y] = y, x
                extend(i + 1, cur)
                del cur[x], cur[y]

    extend(0, {})
    return out
