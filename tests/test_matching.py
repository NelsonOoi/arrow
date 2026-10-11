"""Gale-Shapley property tests on random, incomplete preference lists."""

from hypothesis import given, settings
from hypothesis import strategies as st

from matchmaker.matching import all_stable_matchings, blocking_pairs, filter_lists, gale_shapley


@st.composite
def markets(draw, min_size=2, max_size=30):
    n_a = draw(st.integers(min_size // 2 or 1, max_size // 2))
    n_b = draw(st.integers(min_size // 2 or 1, max_size // 2))
    a_ids = [f"a{i}" for i in range(n_a)]
    b_ids = [f"b{i}" for i in range(n_b)]

    def lists(own, other):
        out = {}
        for x in own:
            subset = draw(st.lists(st.sampled_from(other), unique=True, max_size=len(other)))
            out[x] = subset
        return out

    return lists(a_ids, b_ids), lists(b_ids, a_ids)


def _is_matching(m, pa, pb):
    assert len(set(m.values())) == len(m)
    for a, b in m.items():
        assert b in pa[a] and a in pb[b], "matched pair must be mutually acceptable"


@settings(max_examples=300, deadline=None)
@given(markets())
def test_no_blocking_pairs_either_side_proposing(market):
    pa, pb = market
    m = gale_shapley(pa, pb)
    _is_matching(m, pa, pb)
    assert blocking_pairs(m, pa, pb) == []
    m2 = gale_shapley(pb, pa)
    _is_matching(m2, pb, pa)
    assert blocking_pairs(m2, pb, pa) == []


@settings(max_examples=300, deadline=None)
@given(markets(max_size=12))
def test_proposer_optimal_against_brute_force(market):
    pa, pb = market
    m = gale_shapley(pa, pb)
    stable = all_stable_matchings(pa, pb)
    assert m in stable
    rank = {a: {b: i for i, b in enumerate(lst)} for a, lst in pa.items()}
    for other in stable:
        for a in pa:
            mine, theirs = m.get(a), other.get(a)
            if theirs is None:
                continue
            assert mine is not None, "proposer-optimal: never unmatched when matched in some stable matching"
            assert rank[a][mine] <= rank[a][theirs]


def test_filter_lists_keeps_order_and_requires_mutual_pool_unmet():
    lists = {
        "a1": ["b3", "b1", "b2"],
        "a2": ["b1"],
        "b1": ["a2", "a1"],
        "b2": ["a2"],  # does not accept a1
        "b3": ["a1"],
    }
    fa, fb = filter_lists(["a1", "a2"], ["b1", "b2"], lists, met={("a2", "b1")})
    assert fa == {"a1": ["b1"], "a2": []}  # b3 not in pool, b2 doesn't accept a1, a2-b1 met
    assert fb == {"b1": ["a1"], "b2": []}


def test_gale_shapley_simple():
    pa = {"a1": ["b1", "b2"], "a2": ["b1", "b2"]}
    pb = {"b1": ["a2", "a1"], "b2": ["a1", "a2"]}
    assert gale_shapley(pa, pb) == {"a2": "b1", "a1": "b2"}
