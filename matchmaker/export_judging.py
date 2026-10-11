"""Blind judging sheets for the demo, and the scripts that unblind them.

    python -m matchmaker.export_judging pairs        --event E   # check 2: 40 directed pairs, scores hidden
    python -m matchmaker.export_judging pairs-reveal             #          after you fill in your_rating (1-5)
    python -m matchmaker.export_judging ranking      --event E   # check 3: top 5 / bottom 3 for 8 people + planted-case tallies
    python -m matchmaker.export_judging stability    --event E   # check 3: re-score 30 rows x3, paraphrase twins
    python -m matchmaker.export_judging convs        --event E   # check 4: 20 sim conversations per policy, shuffled, unlabeled
    python -m matchmaker.export_judging convs-reveal             #          after you fill in your_rating (good/okay/bad)

Sheets are CSV in --out (default demo/out). Hidden keys sit next to them in *_key.json; don't open those
until you have rated.
"""

import argparse
import asyncio
import csv
import json
import random
import statistics
import uuid
from pathlib import Path
from typing import Any

from sqlalchemy import select

from matchmaker.cards import candidate_half, render_card, seeker_half
from matchmaker.config import get_settings
from matchmaker.db import get_engine, make_sessionmaker
from matchmaker.models import Attendee, Event, PairScore
from matchmaker.precompute.aggregate import aggregate
from matchmaker.precompute.worker import to_profile


def _load(sf, event_id):
    with sf() as s:
        event = s.get(Event, event_id)
        people = {a.external_ref: a for a in s.scalars(select(Attendee).where(Attendee.event_id == event_id))}
        by_id = {a.id: a for a in people.values()}
        rows = s.scalars(select(PairScore).where(PairScore.event_id == event_id)).all()
    pairs = {(by_id[r.from_attendee_id].external_ref, by_id[r.to_attendee_id].external_ref): r for r in rows}
    return event, people, pairs


def _key(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text())


def _planted(key) -> list[tuple[str, str, str]]:
    out = [(t["seeker"], t["candidate"], "dealbreaker_trap") for t in key["dealbreaker_traps"]]
    out += [(d["seeker"], d["candidate"], "keyword_decoy") for d in key["keyword_decoys"]]
    # Pad to 10 with the rejecting direction of one-sided pairs (B clearly doesn't want A).
    out += [(o["wanted"], o["wants"], "one_sided_reverse") for o in key["one_sided"]]
    return out[:10]


def _spearman(x: list[float], y: list[float]) -> float:
    def ranks(v):
        order = sorted(range(len(v)), key=lambda i: v[i])
        r = [0.0] * len(v)
        i = 0
        while i < len(v):
            j = i
            while j + 1 < len(v) and v[order[j + 1]] == v[order[i]]:
                j += 1
            for k in range(i, j + 1):
                r[order[k]] = (i + j) / 2 + 1
            i = j + 1
        return r

    rx, ry = ranks(x), ranks(y)
    mx, my = statistics.mean(rx), statistics.mean(ry)
    num = sum((a - mx) * (b - my) for a, b in zip(rx, ry))
    den = (sum((a - mx) ** 2 for a in rx) * sum((b - my) ** 2 for b in ry)) ** 0.5
    return num / den if den else 0.0


# ------------------------------------------------------------------------------------------------ check 2


def cmd_pairs(sf, args) -> None:
    _, people, pairs = _load(sf, args.event)
    key = _key(args.answer_key)
    rng = random.Random(args.seed)
    planted = _planted(key)
    planted_set = {(a, b) for a, b, _ in planted}
    done = sorted((p for p, r in pairs.items() if r.status == "done" and p not in planted_set), key=lambda p: -pairs[p].aggregate)
    third = len(done) // 3
    top = rng.sample(done[:third], 10)
    mid = rng.sample(done[third : 2 * third], 10)
    bottom = rng.sample(done[2 * third :], 10)
    items = [(a, b, "top") for a, b in top] + [(a, b, "middle") for a, b in mid] + [(a, b, "bottom") for a, b in bottom] + planted
    rng.shuffle(items)
    sheet = args.out / "pair_sheet.csv"
    hidden = []
    with sheet.open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["item", "seeker", "candidate", "your_rating_1_to_5"])
        for n, (a, b, bucket) in enumerate(items, 1):
            w.writerow([n, seeker_half(to_profile(people[a])), candidate_half(to_profile(people[b])), ""])
            r = pairs[(a, b)]
            hidden.append({"item": n, "from": a, "to": b, "bucket": bucket, "aggregate": r.aggregate,
                           "acceptable": r.acceptable, "rank": r.rank, "dealbreaker_prob": r.dealbreaker_prob})
    (args.out / "pair_sheet_key.json").write_text(json.dumps(hidden, indent=2))
    print(f"wrote {sheet} ({len(items)} pairs). Rate each 1-5, then run pairs-reveal.")


def cmd_pairs_reveal(sf, args) -> None:
    hidden = {h["item"]: h for h in json.loads((args.out / "pair_sheet_key.json").read_text())}
    mine, jev, rows = [], [], []
    with (args.out / "pair_sheet.csv").open() as f:
        for row in csv.DictReader(f):
            if not row["your_rating_1_to_5"].strip():
                continue
            h = hidden[int(row["item"])]
            you = float(row["your_rating_1_to_5"])
            j = 1 + 4 * h["aggregate"]
            mine.append(you)
            jev.append(j)
            rows.append({**h, "you": you, "jev_1_to_5": round(j, 2)})
    if not rows:
        raise SystemExit("no ratings filled in yet")
    within = sum(abs(a - b) <= 1 for a, b in zip(mine, jev)) / len(rows)
    traps = [r for r in rows if r["bucket"] == "dealbreaker_trap"]
    print(f"rated {len(rows)} pairs")
    print(f"rank correlation (Spearman): {_spearman(mine, jev):.2f}   pass bar >= 0.6")
    print(f"within one point:            {within:.0%}   pass bar >= 75%")
    print(f"dealbreaker traps blocked:   {sum(not r['acceptable'] for r in traps)} of {len(traps)}   pass bar 4 of 4")
    for r in sorted(rows, key=lambda r: -abs(r["you"] - r["jev_1_to_5"]))[:8]:
        print(f"  biggest gaps: item {r['item']:2d} {r['from']}->{r['to']} ({r['bucket']}) you={r['you']:.0f} jev={r['jev_1_to_5']}")
    (args.out / "pair_sheet_revealed.json").write_text(json.dumps(rows, indent=2))


# ------------------------------------------------------------------------------------------------ check 3


def _ranked(pairs, frm: str) -> list[str]:
    lst = [(to, r) for (f, to), r in pairs.items() if f == frm and r.rank is not None]
    return [to for to, r in sorted(lst, key=lambda x: x[1].rank)]


def cmd_ranking(sf, args) -> None:
    _, people, pairs = _load(sf, args.event)
    key = _key(args.answer_key)
    planted_partner = {a: b for a, b in key["obvious_pairs"]}
    decoy_of = {d["seeker"]: d["candidate"] for d in key["keyword_decoys"]}
    chosen = [a for a, _ in key["obvious_pairs"]] + list(decoy_of)[:2]
    lines = []
    for ref in chosen:
        ranked = _ranked(pairs, ref)
        lines.append(f"\n## {ref} {people[ref].display_name}\n{seeker_half(to_profile(people[ref]))}\n")
        for i, to in enumerate(ranked[:5], 1):
            r = pairs[(ref, to)]
            lines.append(f"  #{i} {to} {people[to].display_name}: agg={r.aggregate:.2f} conf={r.min_confidence:.2f} | {people[to].offering_text[:90]}")
        lines.append("  ...")
        for to in ranked[-3:]:
            r = pairs[(ref, to)]
            lines.append(f"  #{r.rank} {to} {people[to].display_name}: agg={r.aggregate:.2f} | {people[to].offering_text[:90]}")
        lines.append("  Would you accept their #1? ____")
    obvious_top3 = sum(b in _ranked(pairs, a)[:3] for a, b in key["obvious_pairs"])
    decoys_out = sum(d["candidate"] not in _ranked(pairs, d["seeker"])[:3] for d in key["keyword_decoys"])
    traps = sum(not pairs[(t["seeker"], t["candidate"])].acceptable for t in key["dealbreaker_traps"])
    summary = (
        f"planted partner in top 3: {obvious_top3} of {len(key['obvious_pairs'])}   pass bar >= 5 of 6\n"
        f"decoys kept out of top 3: {decoys_out} of {len(key['keyword_decoys'])}   pass bar >= 3 of 4\n"
        f"dealbreaker traps blocked: {traps} of {len(key['dealbreaker_traps'])}   pass bar 4 of 4"
    )
    out = args.out / "ranking_check.md"
    out.write_text("# Ranking check\n\n" + summary + "\n" + "\n".join(lines) + "\n")
    print(summary)
    print(f"wrote {out}")


def cmd_stability(sf, args) -> None:
    event, people, pairs = _load(sf, args.event)
    key = _key(args.answer_key)
    rng = random.Random(args.seed)
    sample = rng.sample(sorted(p for p, r in pairs.items() if r.status == "done"), args.rows)
    settings = get_settings()
    if settings.scorer == "jev":
        from matchmaker.precompute.jev import JevScorer

        scorer = JevScorer(model=settings.jev_model, api_key=settings.typesafe_api_key)
    else:
        from matchmaker.precompute.fake import FakeScorer

        scorer = FakeScorer()

    async def rescore():
        sem = asyncio.Semaphore(settings.precompute_concurrency)

        async def one(a, b):
            async with sem:
                res = await scorer.score(to_profile(people[a]), to_profile(people[b]), event.rubric)
                return aggregate(res.dimensions, event.rubric)[0]

        try:
            return {p: [pairs[p].aggregate] + list(await asyncio.gather(*(one(*p) for _ in range(args.repeats)))) for p in sample}
        finally:
            if hasattr(scorer, "aclose"):
                await scorer.aclose()

    runs = asyncio.run(rescore())
    stable = sum(max(v) - min(v) <= 0.05 for v in runs.values())
    print(f"re-scored aggregates within 0.05: {stable} of {len(runs)}   pass bar >= 27 of 30")
    for p, v in sorted(runs.items(), key=lambda kv: -(max(kv[1]) - min(kv[1])))[:5]:
        print(f"  widest: {p[0]}->{p[1]} {['%.2f' % x for x in v]}")
    for a, b in key["paraphrase_twins"]:
        ta, tb = _ranked(pairs, a)[:3], _ranked(pairs, b)[:3]
        print(f"twins {a}/{b}: top 3 {ta} vs {tb}, shared {len(set(ta) & set(tb))}   pass bar >= 2")
    (args.out / "stability.json").write_text(json.dumps({f"{a}->{b}": v for (a, b), v in runs.items()}, indent=2))


# ------------------------------------------------------------------------------------------------ check 4


def cmd_convs(sf, args) -> None:
    _, people, _ = _load(sf, args.event)
    rng = random.Random(args.seed)
    items = []
    for policy in ("design", "instant_greedy", "random"):
        convs = json.loads((args.out / f"sim_{policy}_conversations.json").read_text())
        for c in rng.sample(convs, min(args.per_policy, len(convs))):
            items.append((policy, c["a_ref"], c["b_ref"]))
    rng.shuffle(items)
    hidden = []
    with (args.out / "conversation_sheet.csv").open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["item", "person_a", "person_b", "your_rating_good_okay_bad"])
        for n, (policy, a, b) in enumerate(items, 1):
            w.writerow([n, render_card(to_profile(people[a])), render_card(to_profile(people[b])), ""])
            hidden.append({"item": n, "policy": policy, "a": a, "b": b})
    (args.out / "conversation_sheet_key.json").write_text(json.dumps(hidden, indent=2))
    print(f"wrote {args.out / 'conversation_sheet.csv'} ({len(items)} conversations, policies hidden)")


def cmd_convs_reveal(sf, args) -> None:
    hidden = {h["item"]: h for h in json.loads((args.out / "conversation_sheet_key.json").read_text())}
    tally: dict[str, dict[str, int]] = {}
    with (args.out / "conversation_sheet.csv").open() as f:
        for row in csv.DictReader(f):
            rating = row["your_rating_good_okay_bad"].strip().lower()
            if rating not in ("good", "okay", "bad"):
                continue
            t = tally.setdefault(hidden[int(row["item"])]["policy"], {"good": 0, "okay": 0, "bad": 0})
            t[rating] += 1
    share = {p: t["good"] / max(1, sum(t.values())) for p, t in tally.items()}
    for p, t in tally.items():
        print(f"{p:15s} good={t['good']:2d} okay={t['okay']:2d} bad={t['bad']:2d}  rated good {share[p]:.0%}")
    if {"design", "random", "instant_greedy"} <= share.keys():
        ok = share["design"] >= 0.7 and share["design"] - share["random"] >= 0.3 and share["design"] >= share["instant_greedy"]
        print(f"design pass bar (>=70%, >=30 pts above random, not below greedy): {'PASS' if ok else 'FAIL'}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("command", choices=["pairs", "pairs-reveal", "ranking", "stability", "convs", "convs-reveal"])
    ap.add_argument("--event", type=uuid.UUID)
    ap.add_argument("--answer-key", type=Path, default=Path("demo/answer_key.json"))
    ap.add_argument("--out", type=Path, default=Path("demo/out"))
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--rows", type=int, default=30)
    ap.add_argument("--repeats", type=int, default=3)
    ap.add_argument("--per-policy", type=int, default=20)
    args = ap.parse_args()
    if args.command in ("pairs", "ranking", "stability", "convs") and args.event is None:
        ap.error(f"{args.command} needs --event")
    args.out.mkdir(parents=True, exist_ok=True)
    sf = make_sessionmaker(get_engine())
    {
        "pairs": cmd_pairs,
        "pairs-reveal": cmd_pairs_reveal,
        "ranking": cmd_ranking,
        "stability": cmd_stability,
        "convs": cmd_convs,
        "convs-reveal": cmd_convs_reveal,
    }[args.command](sf, args)


if __name__ == "__main__":
    main()
