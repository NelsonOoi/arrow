"""Comparison policies for the simulator. Same acceptability rules as the design: mutual, in pool, unmet.

- instant greedy: refresh fires on every join (window 0, threshold 1); each newly free person, oldest first,
  takes their best-ranked available partner.
- random: same batching trigger as the design, but pairs are drawn at random among acceptable ones.
"""

import uuid

from matchmaker.refresh import DESIGN_POLICY, PolicyInput, PolicySpec


def greedy_policy(p: PolicyInput) -> dict[uuid.UUID, uuid.UUID]:
    lists = {**p.lists_a, **p.lists_b}
    side_a = set(p.lists_a)
    taken: set[uuid.UUID] = set()
    out: dict[uuid.UUID, uuid.UUID] = {}
    for x in p.joined_order:
        if x in taken:
            continue
        for y in lists.get(x, ()):
            if y not in taken:
                taken.update((x, y))
                a, b = (x, y) if x in side_a else (y, x)
                out[a] = b
                break
    return out


def random_policy(p: PolicyInput) -> dict[uuid.UUID, uuid.UUID]:
    a_ids = sorted(p.lists_a, key=lambda a: p.sort_key[a])
    p.rng.shuffle(a_ids)
    taken: set[uuid.UUID] = set()
    out: dict[uuid.UUID, uuid.UUID] = {}
    for a in a_ids:
        options = [b for b in p.lists_a[a] if b not in taken]
        if options:
            b = p.rng.choice(options)
            taken.add(b)
            out[a] = b
    return out


GREEDY_POLICY = PolicySpec("instant_greedy", greedy_policy, stable=False)
RANDOM_POLICY = PolicySpec("random", random_policy, stable=False)

# policy name -> (spec, trigger config override)
POLICIES: dict[str, tuple[PolicySpec, dict]] = {
    "design": (DESIGN_POLICY, {}),
    "instant_greedy": (GREEDY_POLICY, {"refresh_window_seconds": 0, "refresh_min_per_side": 1}),
    "random": (RANDOM_POLICY, {}),
}
