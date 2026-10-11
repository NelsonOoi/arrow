// Matching: score every pair, then give each guest ONE person to meet.
//
// Scoring uses Jev (TypeSafe's decision model) when TYPESAFE_API_KEY is set:
// one request per guest, with one Score question per other guest, all
// evaluated in parallel by Jev. Scores are averaged both ways so they're
// symmetric. Without a key it falls back to keyword overlap.
//
// Pairing: with symmetric scores, greedily pairing the highest-scoring free
// pair is a stable matching (Gale-Shapley's guarantee for a single pool).
// Anyone left unpaired gets their best-scoring person instead.

const JEV_URL = "https://api.typesafe.ai/v1/systemone";
const MIN_PAIR_SCORE = 3; // below this, don't force a mutual pair
const JEV_LEVELS = [
  "Not worth meeting: nothing in common and neither can help the other",
  "Some overlap: a shared interest, but neither has what the other is looking for",
  "Good match: one of them clearly has what the other is looking for",
  "Exactly who they're looking for, and it goes both ways",
];

export function profile(p) {
  const a = Object.fromEntries((p.answers ?? []).map((q) => [q.key, q.answer]));
  return { uid: p.uid, name: p.name, position: a.position ?? null, company: a.company ?? null, interest: a.interest ?? null, hobby: a.hobby ?? null, goal: a.goal ?? null };
}

function describe(p) {
  const pr = profile(p);
  const bits = [
    pr.name,
    pr.position && `role: ${pr.position}`,
    pr.company && `works at: ${pr.company}`,
    pr.interest && `into: ${pr.interest}`,
    pr.hobby && `for fun: ${pr.hobby}`,
    pr.goal && `looking for: ${pr.goal}`,
  ].filter(Boolean);
  // no extracted answers yet: let Jev read the call transcript directly
  if (bits.length <= 1 && p.transcript) bits.push(`intake call transcript: ${p.transcript.slice(0, 1500)}`);
  return bits.join("; ");
}

// ---------- keyword fallback ----------
const STOP = new Set(
  "a an and are as at be but by for from has have i im i'm in is it its looking meet me my of on or people person someone that the their them they this to want with who would you your we our like love lot really just into".split(" "),
);
const words = (t) =>
  (t ?? "").toLowerCase().replace(/[^a-z0-9+ ]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)).map((w) => w.slice(0, 5));

function overlap(a, b) {
  const pa = profile(a), pb = profile(b);
  const offersA = new Set(words([pa.position, pa.company, pa.interest, pa.hobby].join(" ")));
  const offersB = new Set(words([pb.position, pb.company, pb.interest, pb.hobby].join(" ")));
  const aGets = words(pa.goal).filter((w) => offersB.has(w));
  const bGets = words(pb.goal).filter((w) => offersA.has(w));
  const shared = [...offersA].filter((w) => offersB.has(w));
  return { score: Math.min(10, aGets.length * 3 + bGets.length * 3 + shared.length), aGets, bGets, shared };
}

// Reason written to `viewer` about `other`, from what their answers overlap on.
function reason(viewer, other) {
  const h = overlap(viewer, other);
  const po = profile(other);
  const name = (po.name ?? "They").split(" ")[0];
  const role = po.position
    ? `${/^([aeiou]|ML|LLM)/i.test(po.position) ? "an" : "a"} ${po.position.replace(/^[A-Z](?![A-Z])/, (c) => c.toLowerCase())}${po.company ? ` at ${po.company}` : ""}`
    : null;
  if (h.aGets.length && h.bGets.length) return `Two-way match: ${name} is ${role ?? "who you're after"}, and is looking for ${po.goal} — that's you.`;
  if (h.aGets.length) return `${name} is ${role ?? "into " + po.interest} — who you said you wanted to meet.`;
  if (h.bGets.length) return `${name} is looking for ${po.goal} — that's you.`;
  if (h.shared.length) return `You're both into this: ${name} works on ${po.interest ?? po.hobby}.`;
  if (po.goal) return `${name}${role ? ` is ${role} and` : ""} is looking for ${po.goal}.`;
  return `${name} is the best match for what you told us.`;
}

// ---------- Jev ----------
async function jevScores(env, event, me, others) {
  const questions = Object.fromEntries(
    others.map((o) => [
      `p_${o.uid}`,
      {
        type: "score",
        instructions: `How valuable would it be for this guest to meet this other person at the event? Weigh most whether the other person has what this guest is looking for. Other person: ${describe(o)}`,
        criteria: JEV_LEVELS,
      },
    ]),
  );
  const res = await fetch(JEV_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${env.TYPESAFE_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: "jev-latest",
      state: `Event: ${event.name} (${event.type}). ${event.description ?? ""}\nThis guest: ${describe(me)}`,
      questions,
    }),
  });
  if (!res.ok) throw new Error(`Jev ${res.status}: ${await res.text()}`);
  const { answers = {} } = await res.json();
  const out = {};
  for (const o of others) {
    const a = answers[`p_${o.uid}`];
    if (!a) continue;
    // expected level from Jev's probabilities, scaled to 0–10
    const probs = a.probabilities ?? {};
    const expected = Object.keys(probs).length
      ? Object.entries(probs).reduce((s, [lvl, p]) => s + Number(lvl) * p, 0)
      : Number(a.score ?? 0);
    out[o.uid] = (expected / (JEV_LEVELS.length - 1)) * 10;
  }
  return out;
}

async function inBatches(items, size, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  return out;
}

// people: answered guests with parsed answers. Returns one match row per guest.
export async function computeMatches(env, event, people, log) {
  if (people.length < 2) throw new Error("Need at least 2 people who answered");
  const key = (x, y) => (x < y ? `${x}|${y}` : `${y}|${x}`);
  const pairs = new Map(); // key → [scores]
  const add = (a, b, s) => pairs.set(key(a, b), [...(pairs.get(key(a, b)) ?? []), s]);

  if (env.TYPESAFE_API_KEY) {
    log(`Scoring ${people.length} guests with Jev`);
    await inBatches(people, 5, async (me) => {
      const scores = await jevScores(env, event, me, people.filter((p) => p.uid !== me.uid));
      for (const [uid, s] of Object.entries(scores)) add(me.uid, uid, s);
    });
  } else {
    log(`Scoring ${people.length} guests with keyword overlap (no TYPESAFE_API_KEY)`);
    for (let i = 0; i < people.length; i++)
      for (let j = i + 1; j < people.length; j++) add(people[i].uid, people[j].uid, overlap(people[i], people[j]).score);
  }
  const score = (a, b) => {
    const s = pairs.get(key(a, b));
    return s ? s.reduce((x, y) => x + y, 0) / s.length : 0;
  };

  const partner = new Map();
  const sorted = [...pairs.keys()].map((k) => [k, score(...k.split("|"))]).sort((x, y) => y[1] - x[1]);
  for (const [k, s] of sorted) {
    if (s < MIN_PAIR_SCORE) break;
    const [a, b] = k.split("|");
    if (!partner.has(a) && !partner.has(b)) partner.set(a, b).set(b, a);
  }

  const byUid = Object.fromEntries(people.map((p) => [p.uid, p]));
  const rows = people.map((me) => {
    let to = partner.get(me.uid);
    if (!to) to = people.filter((p) => p.uid !== me.uid).sort((x, y) => score(me.uid, y.uid) - score(me.uid, x.uid))[0].uid;
    return {
      uid: me.uid,
      match_uid: to,
      score: Math.round(score(me.uid, to) * 10) / 10,
      reason: reason(me, byUid[to]),
      must_meet: partner.get(me.uid) === to ? 1 : 0,
    };
  });
  const mutual = rows.filter((r) => r.must_meet).length;
  log(`Matched ${rows.length} guests (${mutual} mutual)`);
  return rows;
}
