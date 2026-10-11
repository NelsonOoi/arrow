"""Stable roommates property tests on random, incomplete preference lists, checked against brute force."""

from hypothesis import given, settings
from hypothesis import strategies as st

from matchmaker.matching import all_stable_pairings, blocking_pairs, filter_lists, max_weight_pairs, stable_roommates


@st.composite
def groups(draw, max_size=10):
    n = draw(st.integers(1, max_size))
    ids = [f"p{i}" for i in range(n)]
    return {x: draw(st.lists(st.sampled_from([y for y in ids if y != x] or [x]), unique=True)) for x in ids}


def _is_pairing(m, prefs):
    for x, y in m.items():
        assert x != y and m[y] == x, "pairing must be symmetric"
        assert y in prefs[x] and x in prefs[y], "paired people must accept each other"


@settings(max_examples=500, deadline=None)
@given(groups(max_size=9))
def test_irving_agrees_with_brute_force(prefs):
    prefs = {x: [y for y in lst if y != x] for x, lst in prefs.items()}
    stable = all_stable_pairings(prefs)
    m = stable_roommates(prefs)
    if not stable:
        assert m is None, "returned a pairing although none is stable"
        return
    assert m is not None, "missed an existing stable pairing"
    _is_pairing(m, prefs)
    assert m in stable
    # Everyone stable pairing pairs the same people.
    assert set(m) == set(stable[0])


@settings(max_examples=300, deadline=None)
@given(groups(max_size=16))
def test_irving_result_is_stable_on_larger_groups(prefs):
    prefs = {x: [y for y in lst if y != x] for x, lst in prefs.items()}
    m = stable_roommates(prefs)
    if m is not None:
        _is_pairing(m, prefs)
        assert blocking_pairs(m, prefs) == []


@settings(max_examples=300, deadline=None)
@given(groups(max_size=16))
def test_max_weight_pairs_as_many_as_possible(prefs):
    prefs = {x: [y for y in lst if y != x] for x, lst in prefs.items()}
    m = max_weight_pairs(prefs)
    _is_pairing(m, prefs)
    stable = stable_roommates(prefs)
    if stable is not None:
        assert len(m) >= len(stable)


def test_no_stable_pairing_falls_through_to_none():
    # The classic instance: p0, p1, p2 each rank the next one first and all rank p3 last.
    prefs = {
        "p0": ["p1", "p2", "p3"],
        "p1": ["p2", "p0", "p3"],
        "p2": ["p0", "p1", "p3"],
        "p3": ["p0", "p1", "p2"],
    }
    assert stable_roommates(prefs) is None
    assert all_stable_pairings(prefs) == []
    assert len(max_weight_pairs(prefs)) == 4


def test_simple_stable_pairing():
    prefs = {"p0": ["p1", "p2", "p3"], "p1": ["p0", "p2", "p3"], "p2": ["p3", "p0", "p1"], "p3": ["p2", "p0", "p1"]}
    assert stable_roommates(prefs) == {"p0": "p1", "p1": "p0", "p2": "p3", "p3": "p2"}


def test_filter_lists_keeps_order_and_requires_mutual_pool_unmet():
    lists = {
        "p1": ["p5", "p2", "p3", "p4"],
        "p2": ["p1", "p4"],
        "p3": ["p4"],  # does not accept p1
        "p4": ["p2", "p1"],
        "p5": ["p1"],
    }
    f = filter_lists(["p1", "p2", "p3", "p4"], lists, met={("p2", "p4")})
    # p5 not in pool, p3 doesn't accept p1, p2-p4 already met.
    assert f == {"p1": ["p2", "p4"], "p2": ["p1"], "p3": [], "p4": ["p1"]}
