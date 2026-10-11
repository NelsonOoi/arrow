"""Comparison policies for the simulator. Same acceptability rules as the design: mutual, in pool, unmet.

- instant greedy: refresh fires on every join (window 0, threshold 1); each newly free person, oldest first,
  takes their best-ranked available partner.
- random: same batching trigger as the design, but pairs are drawn at random among acceptable ones.
"""

import uuid

from matchmaker.refresh import DESIGN_POLICY, Pairing, PolicyInput, PolicySpec


def greedy_policy(p: PolicyInput) -> Pairing:
    out: dict[uuid.UUID, uuid.UUID] = {}
    for x in p.joined_order:
        if x in out:
            continue
        for y in p.lists.get(x, ()):
            if y not in out:
                out[x], out[y] = y, x
                break
    return Pairing(out, "greedy")


def random_policy(p: PolicyInput) -> Pairing:
    ids = sorted(p.lists, key=lambda x: p.sort_key[x])
    p.rng.shuffle(ids)
    out: dict[uuid.UUID, uuid.UUID] = {}
    for x in ids:
        if x in out:
            continue
        options = [y for y in p.lists[x] if y not in out]
        if options:
            y = p.rng.choice(options)
            out[x], out[y] = y, x
    return Pairing(out, "random")


GREEDY_POLICY = PolicySpec("instant_greedy", greedy_policy)
RANDOM_POLICY = PolicySpec("random", random_policy)

# policy name -> (spec, trigger config override)
POLICIES: dict[str, tuple[PolicySpec, dict]] = {
    "design": (DESIGN_POLICY, {}),
    "instant_greedy": (GREEDY_POLICY, {"refresh_window_seconds": 0, "refresh_min_pending": 1}),
    "random": (RANDOM_POLICY, {}),
}
