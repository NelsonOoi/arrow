// Arrow's JSON API under /api, run on Vercel by server.js (events live at /api/gatherings: ad blockers
// block anything under /api/events as analytics). The pages in public/ (host dashboard at /, guest page at
// /m/<token>) are served statically. Data in Supabase, calls and texts through Dial, matching by the Python
// matchmaker (or Jev directly in match.js).
import { generateText, Output } from "ai";
import { z } from "zod";
import { placeCall, getCall, sendSms, listMessages } from "./dial.js";
import { computeMatches, profile } from "./match.js";
import { select, first as firstRow, insert, update, remove, v, inList } from "./db.js";
import { isDemo, demoCall, demoCallStatus, answersFor, transcriptFor, smsReplyFor } from "./demo.js";

const BEACON_COLORS = ["#FF5A36", "#2EE59D", "#3D7BFF", "#FFC531", "#E040FB", "#00D4FF"];
const BEACON_TTL_MIN = 10;
const MAX_CALL_SECONDS = 240; // phone screening can eat a minute

const QUESTIONS = {
  networking: [
    { key: "position", question: "What's your role or position?" },
    { key: "company", question: "Where do you work?" },
    { key: "interest", question: "What are you interested in or working on lately?" },
    { key: "goal", question: "What are you looking for at this event — who would be the perfect person to meet?" },
  ],
  social: [
    { key: "hobby", question: "What do you like to do for fun?" },
    { key: "goal", question: "What are you looking for tonight — who would be the perfect person to meet?" },
  ],
};
const questionsFor = (event) => QUESTIONS[event.type] ?? QUESTIONS.networking;
const first = (name) => (name ? ` ${name.split(" ")[0]}` : "");

// ---------- helpers ----------
class HttpError extends Error {
  constructor(status, msg) { super(msg); this.status = status; }
}
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const rand = (bytes) => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(bytes)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const newId = (prefix) => `${prefix}_${[...crypto.getRandomValues(new Uint8Array(5))].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
const minutesAgo = (m) => new Date(Date.now() - m * 60000).toISOString();

export function normalizePhone(p) {
  const d = String(p ?? "").replace(/[^\d+]/g, "");
  if (d.startsWith("+")) return d;
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  return d;
}

const log = (env, eventId) => async (msg) => {
  console.log(`[${eventId}] ${msg}`);
  await insert(env, "logs", { event_id: eventId, msg });
};
const getEvent = async (env, id) => {
  const e = await firstRow(env, `events?id=eq.${v(id)}`);
  if (!e) throw new HttpError(404, "No such event");
  return e;
};
const setPerson = (env, uid, fields) => update(env, `people?uid=eq.${v(uid)}`, fields);

// ---------- prompts ----------
function callInstruction(event, person) {
  const qs = questionsFor(event);
  return `You are a friendly, upbeat assistant calling on behalf of the organizers of "${event.name}".
Event: ${event.description}

You are calling ${person.name || "a guest"} who registered for the event. Goal: ask a few quick questions so we can introduce them to the best person to meet there.

Open with: "Hi${first(person.name)}, this is the AI assistant for ${event.name} — we find you the person you should meet. Got 60 seconds for ${qs.length} quick questions?"
If they say no or it's a bad time, thank them, say they'll get a text instead, and end the call.

Then ask these, one at a time, in order. Keep it conversational, accept short answers, ask at most one short follow-up only if an answer is vague:
${qs.map((q, i) => `${i + 1}. ${q.question}`).join("\n")}

Finish by briefly repeating back what you heard in one sentence, say they'll get a text with a link to the person they should meet, thank them, and end the call.
Keep the whole call under 2 minutes. Never ask for email, address, or anything not listed.`;
}

const smsQuestions = (event, person) =>
  `Hi${first(person.name)}! We tried calling for ${event.name} — we find you the person you should meet there. Reply with quick answers:\n${questionsFor(event).map((q, i) => `${i + 1}) ${q.question}`).join("\n")}`;

// A small model on Vercel AI Gateway pulls short answers out of a call transcript or SMS reply.
// Auth: Vercel OIDC on deployments, AI_GATEWAY_API_KEY elsewhere. Without either, only parseAnswers runs.
const EXTRACT_MODEL = "anthropic/claude-haiku-5.5"; // override with AI_GATEWAY_MODEL
const hasGateway = (env) => !!(env.VERCEL || env.AI_GATEWAY_API_KEY || env.VERCEL_OIDC_TOKEN);

// Which agent question a transcript line is asking, by keyword.
const CUES = {
  position: /role|position/i,
  company: /where do you (work|study)|work or study|company/i,
  interest: /interested in|working on/i,
  hobby: /for fun|hobb/i,
  goal: /looking for|perfect person|want to meet/i,
};

// No-AI fallback: read the guest's reply after each question straight from the text.
function parseAnswers(qs, text) {
  const out = Object.fromEntries(qs.map((q) => [q.key, null]));
  const lines = String(text ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  const turns = [];
  for (const l of lines) {
    const m = l.match(/^(Agent|User|Guest|Caller)\s*:\s*(.*)$/i);
    if (m) turns.push({ agent: /^agent$/i.test(m[1]), text: m[2] });
    else if (turns.length) turns[turns.length - 1].text += " " + l;
  }
  if (!turns.length) {
    // an SMS reply: "1) ...", "2) ..." or one answer per line
    const numbered = lines.map((l) => l.match(/^\s*(\d)\s*[).:-]\s*(.+)$/)).filter(Boolean);
    if (numbered.length) for (const [, n, a] of numbered) { const q = qs[Number(n) - 1]; if (q) out[q.key] = a.trim(); }
    else if (lines.length === qs.length) qs.forEach((q, i) => (out[q.key] = lines[i]));
    return out;
  }
  let from = 0;
  for (const q of qs) {
    const cue = CUES[q.key];
    const ask = turns.findIndex((t, i) => i >= from && t.agent && cue?.test(t.text));
    if (ask < 0) continue;
    const reply = [];
    for (let i = ask + 1; i < turns.length && !turns[i].agent; i++) reply.push(turns[i].text);
    const answer = reply.join(" ").replace(/\(unintelligible audio\)/gi, "").trim();
    if (answer) out[q.key] = answer;
    from = ask + 1;
  }
  return out;
}

// Pull short answers out of a call transcript or SMS reply: the AI Gateway model first,
// with any gaps filled by parseAnswers.
async function extractAnswers(env, event, text) {
  const qs = questionsFor(event);
  const parsed = parseAnswers(qs, text);
  let ai = {};
  if (text && hasGateway(env)) {
    try {
      const { output } = await generateText({
        model: env.AI_GATEWAY_MODEL || EXTRACT_MODEL,
        instructions: "You extract a guest's answers from an event intake phone call or text reply. Use the guest's own words, shortened to a phrase. Use null if they never answered that question.",
        prompt: `Questions:\n${qs.map((q) => `- ${q.key}: ${q.question}`).join("\n")}\n\nConversation:\n"""\n${text.slice(0, 8000)}\n"""`,
        output: Output.object({ schema: z.object(Object.fromEntries(qs.map((q) => [q.key, z.string().nullable()]))) }),
        maxOutputTokens: 400,
      });
      ai = output ?? {};
    } catch (e) {
      console.warn("AI extraction failed, using parser", e.message);
    }
  }
  const clean = (v) => (typeof v === "string" && v.trim() && !/^(null|none|n\/a)$/i.test(v.trim()) ? v.trim() : null);
  return qs.map((q) => ({ key: q.key, question: q.question, answer: clean(ai[q.key]) ?? clean(parsed[q.key]) }));
}
const noAnswers = (answers) => answers.every((a) => !a.answer);

// ---------- call queue ----------
// Dial numbers carry one call at a time, so calls run one by one. Each dashboard
// poll calls tick(): finish the call in progress, then start the next one. Several
// pollers can tick at once, so every state change is a conditional update and only
// the poller whose update lands acts on it.
async function tick(env, event) {
  const say = log(env, event.id);
  const calling = await firstRow(env, `people?event_id=eq.${v(event.id)}&status=eq.calling`);
  if (calling) {
    // claimed but not dialed yet (or a stale claim from a crashed poll)
    if (!calling.call_id || calling.call_id.startsWith("claim_")) {
      const age = calling.call_id ? Date.now() - Number(calling.call_id.split("_")[1]) : Infinity;
      if (age > 60000) await update(env, `people?uid=eq.${v(calling.uid)}&status=eq.calling`, { status: "pending", call_id: null });
      return;
    }
    let outcome; // { transcript, answers, secs } or { miss }
    if (calling.call_id.startsWith("demo_")) {
      const sim = demoCallStatus(calling.call_id);
      if (sim.status.state !== "Terminated") return;
      const answers = answersFor(questionsFor(event), calling.uid);
      outcome = { transcript: transcriptFor(event, calling, answers), answers, secs: sim.duration, demo: true };
    } else {
      const call = await getCall(env, calling.call_id);
      if (call.status?.state !== "Terminated") return;
      const term = call.status?.terminationType;
      // roughly when the call ended: placed + ring time + talk time
      const endedSecsAgo = (Date.now() - Date.parse(call.createdAt)) / 1000 - (call.duration ?? 0) - 30;
      if (term === "completed" && !call.transcript && endedSecsAgo < 180) return; // transcript usually lands seconds after hang-up
      if (term === "completed" && call.transcript) {
        const answers = await extractAnswers(env, event, call.transcript);
        outcome = noAnswers(answers) ? { miss: "picked up but no answers (voicemail?)", transcript: call.transcript } : { transcript: call.transcript, answers, secs: call.duration };
      } else outcome = { miss: term ?? "no answer" };
    }
    const fields = outcome.answers
      ? { status: "answered", source: "call", transcript: outcome.transcript, answers: outcome.answers }
      : { status: "sms_sent", source: "sms", sms_sent_at: new Date().toISOString(), ...(outcome.transcript ? { transcript: outcome.transcript } : {}) };
    const won = await update(env, `people?uid=eq.${v(calling.uid)}&status=eq.calling&call_id=eq.${v(calling.call_id)}`, fields);
    if (!won.length) return; // another poll already handled this call
    if (outcome.answers) await say(`✓ ${calling.name} answered (${outcome.secs}s${outcome.demo ? ", demo call" : ""})`);
    else await sendQuestionsText(env, event, calling, outcome.miss);
  }
  if (!event.calls_on) return;
  const next = await firstRow(env, `people?event_id=eq.${v(event.id)}&status=eq.pending&order=created_at`);
  if (!next) {
    const off = await update(env, `events?id=eq.${v(event.id)}&calls_on=eq.true`, { calls_on: false });
    if (off.length) await say("Calls finished");
    return;
  }
  // claim the guest, then make sure we're the only claim: the earliest claim wins
  const claim = `claim_${Date.now()}_${next.uid}`;
  const claimed = await update(env, `people?uid=eq.${v(next.uid)}&status=eq.pending`, { status: "calling", call_id: claim });
  if (!claimed.length) return;
  const active = await select(env, `people?event_id=eq.${v(event.id)}&status=eq.calling&select=uid,call_id`);
  const winner = active.some((a) => a.call_id && !a.call_id.startsWith("claim_")) ? null : active.map((a) => a.call_id).sort()[0];
  if (winner !== claim) {
    await update(env, `people?uid=eq.${v(next.uid)}&call_id=eq.${v(claim)}`, { status: "pending", call_id: null });
    return;
  }
  await say(`Calling ${next.name} (${next.phone})${isDemo(env) ? " · demo mode, no Dial key: simulated call" : ""}`);
  try {
    const call = isDemo(env) ? demoCall(next.uid) : await placeCall(env, { to: next.phone, instruction: callInstruction(event, next), idempotencyKey: claim, maxSeconds: MAX_CALL_SECONDS });
    await setPerson(env, next.uid, { call_id: call.id });
  } catch (e) {
    await update(env, `people?uid=eq.${v(next.uid)}`, { status: "sms_sent", source: "sms", sms_sent_at: new Date().toISOString() });
    await sendQuestionsText(env, event, next, `call failed: ${e.message}`);
  }
}

// The guest is already marked as texted; send the questions (or mark them unreachable).
async function sendQuestionsText(env, event, person, why) {
  try {
    if (!isDemo(env)) await sendSms(env, person.phone, smsQuestions(event, person));
    await log(env, event.id)(`${person.name}: ${why} → texted the questions`);
  } catch (e) {
    await setPerson(env, person.uid, { status: "failed" });
    await log(env, event.id)(`✗ ${person.name}: ${why}; text failed too (${e.message})`);
  }
}


// ---------- routes ----------
const routes = [];
const route = (method, pattern, fn) => {
  const keys = [];
  const re = new RegExp(`^${pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), "([^/]+)"))}$`);
  routes.push({ method, re, keys, fn });
};

route("GET", "/api/gatherings", async (req, env) => {
  const [events, people, matched] = await Promise.all([
    select(env, "events?order=created_at.desc"),
    select(env, "people?select=event_id,status"),
    select(env, "matches?select=event_id"),
  ]);
  const tally = (rows, id, pred = () => true) => rows.filter((r) => r.event_id === id && pred(r)).length;
  return events.map((e) => ({
    ...e,
    guests: tally(people, e.id),
    answered: tally(people, e.id, (p) => p.status === "answered"),
    matched: tally(matched, e.id),
  }));
});

route("POST", "/api/gatherings", async (req, env) => {
  const b = await req.json();
  if (!b.name) throw new HttpError(400, "name required");
  const [ev] = await insert(env, "events", {
    id: newId("evt"), name: b.name, description: b.description ?? "", type: b.type === "social" ? "social" : "networking", host: b.host ?? "",
  });
  return ev;
});

route("GET", "/api/gatherings/:id", async (req, env, { id }, ctx) => {
  let event = await getEvent(env, id);
  try {
    await tick(env, event);
  } catch (e) {
    await log(env, id)(`Call queue error: ${e.message}`);
  }
  event = await getEvent(env, id);
  // A matchmaker run that stopped at its deadline or died goes quiet: this poll restarts it.
  if (["requested", "running"].includes(event.mm_status) && (!event.mm_heartbeat_at || Date.now() - Date.parse(event.mm_heartbeat_at) > MM_STALE_MS))
    kickMatchmaker(env, ctx, id);
  const [list, matched, logs] = await Promise.all([
    select(env, `people?event_id=eq.${v(id)}&order=created_at,uid`),
    select(env, `matches?event_id=eq.${v(id)}&select=uid`),
    select(env, `logs?event_id=eq.${v(id)}&select=at,msg&order=id.desc&limit=50`),
  ]);
  const matchedSet = new Set(matched.map((r) => r.uid));
  const count = (s) => list.filter((p) => p.status === s).length;
  return {
    event,
    questions: questionsFor(event),
    people: list.map((p) => ({
      ...profile(p), phone: p.phone, status: p.status, source: p.source, token: p.token, answers: p.answers, transcript: p.transcript,
      matched: matchedSet.has(p.uid), linkSent: !!p.link_sent_at, createdAt: p.created_at,
    })),
    stats: {
      total: list.length, answered: count("answered"), sms: count("sms_sent"),
      pending: count("pending") + count("calling"), calling: count("calling"), failed: count("failed"),
      matched: matchedSet.size, linksSent: list.filter((p) => p.link_sent_at).length,
    },
    callsRunning: !!event.calls_on || count("calling") > 0,
    log: logs.reverse(),
  };
});

route("POST", "/api/gatherings/:id/people", async (req, env, { id }) => {
  const { csv } = await req.json();
  const lines = (csv ?? "").trim().split(/\r?\n/).filter(Boolean);
  if (lines[0]?.toLowerCase().includes("phone")) lines.shift();
  const rows = [];
  for (const line of lines) {
    const parts = line.split(",").map((s) => s.trim());
    const phoneIdx = parts.findIndex((s) => /\d{7,}/.test(s.replace(/\D/g, "")));
    if (phoneIdx < 0) continue;
    // stagger timestamps by 1ms so the list keeps the pasted order
    const created_at = new Date(Date.now() + rows.length).toISOString();
    rows.push({ uid: newId("u"), event_id: id, name: parts.filter((_, i) => i !== phoneIdx).join(" ").trim(), phone: normalizePhone(parts[phoneIdx]), token: rand(9), created_at });
  }
  if (rows.length) await insert(env, "people", rows);
  await log(env, id)(`Added ${rows.length} guests`);
  return { added: rows.length };
});

route("DELETE", "/api/people/:uid", async (req, env, { uid }) => {
  await remove(env, `matches?or=(uid.eq.${v(uid)},match_uid.eq.${v(uid)})`);
  await remove(env, `people?uid=eq.${v(uid)}`);
  return { ok: true };
});

route("POST", "/api/gatherings/:id/call", async (req, env, { id }) => {
  const event = await getEvent(env, id);
  await update(env, `people?event_id=eq.${v(id)}&status=eq.failed`, { status: "pending" });
  const pending = await select(env, `people?event_id=eq.${v(id)}&status=eq.pending&select=uid`);
  await update(env, `events?id=eq.${v(id)}`, { calls_on: true });
  await log(env, id)(`Calling ${pending.length} guests, one at a time`);
  await tick(env, { ...event, calls_on: true });
  return { queued: pending.length };
});

route("POST", "/api/gatherings/:id/stop", async (req, env, { id }) => {
  await update(env, `events?id=eq.${v(id)}`, { calls_on: false });
  await log(env, id)("Calls paused after the current one");
  return { ok: true };
});

route("POST", "/api/gatherings/:id/collect", async (req, env, { id }) => {
  const event = await getEvent(env, id);
  const waiting = await select(env, `people?event_id=eq.${v(id)}&status=eq.sms_sent`);
  let got = 0;
  for (const p of waiting) {
    if (isDemo(env)) {
      const answers = answersFor(questionsFor(event), p.uid);
      await setPerson(env, p.uid, { status: "answered", transcript: smsReplyFor(answers), answers });
      got++;
      continue;
    }
    const replies = (await listMessages(env, p.phone, p.sms_sent_at))
      .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
      .map((m) => m.body ?? "")
      .join("\n")
      .trim();
    if (!replies) continue;
    await setPerson(env, p.uid, { status: "answered", transcript: replies, answers: await extractAnswers(env, event, replies) });
    got++;
  }
  await log(env, id)(`Text replies collected: ${got}/${waiting.length}${isDemo(env) ? " · demo mode: simulated replies" : ""}`);
  return { collected: got };
});

route("POST", "/api/gatherings/:id/reextract", async (req, env, { id }) => {
  const event = await getEvent(env, id);
  const people = await select(env, `people?event_id=eq.${v(id)}&transcript=not.is.null`);
  let filled = 0;
  for (const p of people) {
    const answers = await extractAnswers(env, event, p.transcript);
    if (noAnswers(answers)) continue;
    await setPerson(env, p.uid, { status: "answered", answers });
    filled++;
  }
  await log(env, id)(`Re-read ${people.length} transcripts: answers found for ${filled}`);
  return { transcripts: people.length, filled };
});

route("POST", "/api/gatherings/:id/match", async (req, env, { id }, ctx) => {
  const event = await getEvent(env, id);
  const people = await select(env, `people?event_id=eq.${v(id)}&status=eq.answered`);
  // MATCHER=matchmaker hands off to the Python matchmaker; on Vercel, MATCHMAKER_URL (set by server.js) implies it.
  if ((env.MATCHER ?? (env.MATCHMAKER_URL ? "matchmaker" : "local")) === "matchmaker") {
    // Hand off to the Python matchmaker (matchmaker/web_bridge.py), which runs Jev precompute and writes
    // `matches` itself. The dashboard shows its progress from mm_done / mm_total.
    if (people.length < 2) throw new HttpError(400, "Need at least 2 people who answered");
    if (["requested", "running"].includes(event.mm_status)) throw new HttpError(409, "Matching is already running");
    await update(env, `events?id=eq.${v(id)}`, {
      mm_status: "requested", mm_event_id: null, mm_error: null, mm_done: 0, mm_total: people.length * (people.length - 1),
      mm_requested_at: new Date().toISOString(),
    });
    await log(env, id)(`Sent ${people.length} guests to the matchmaker`);
    kickMatchmaker(env, ctx, id);
    return { queued: people.length };
  }
  const rows = await computeMatches(env, event, people, log(env, id));
  await remove(env, `matches?event_id=eq.${v(id)}`);
  await insert(env, "matches", rows.map((r) => ({ event_id: id, rank: 1, ...r, must_meet: !!r.must_meet })));
  return { people: rows.length, mutual: rows.filter((r) => r.must_meet).length };
});

route("POST", "/api/gatherings/:id/send-links", async (req, env, { id }) => {
  const event = await getEvent(env, id);
  const origin = new URL(req.url).origin;
  const uids = [...new Set((await select(env, `matches?event_id=eq.${v(id)}&select=uid`)).map((r) => r.uid))];
  const people = uids.length ? await select(env, `people?uid=in.${encodeURIComponent(inList(uids))}`) : [];
  let sent = 0;
  for (const p of people) {
    try {
      if (!isDemo(env)) await sendSms(env, p.phone, `${event.name}: here's the person you should meet 👉 ${origin}/m/${p.token}`);
      await setPerson(env, p.uid, { link_sent_at: new Date().toISOString() });
      sent++;
    } catch (e) {
      await log(env, id)(`✗ link to ${p.name} failed (${e.message})`);
    }
  }
  await log(env, id)(`Links sent: ${sent}/${people.length}${isDemo(env) ? " · demo mode: not actually texted" : ""}`);
  return { sent };
});

// On Vercel the matchmaker is the api/mm.py function on the same deployment; server.js points MATCHMAKER_URL at
// its /mm/ path. waitUntil keeps this function alive while it works. Without MATCHMAKER_URL (matchmaker on a
// laptop under uvicorn), the matchmaker polls the events table for requests instead.
const MM_STALE_MS = 45000; // matches web_bridge.STALE_SECONDS
function kickMatchmaker(env, ctx, id) {
  if (!env.MATCHMAKER_URL) return;
  const url = new URL(`bridge/${encodeURIComponent(id)}`, env.MATCHMAKER_URL.replace(/\/?$/, "/"));
  const headers = env.HOST_KEY ? { authorization: `Bearer ${env.HOST_KEY}` } : {};
  ctx.waitUntil(
    fetch(url, { method: "POST", headers })
      .then(async (r) => r.ok || console.warn(`matchmaker /bridge ${r.status}: ${(await r.text()).slice(0, 200)}`))
      .catch((e) => console.warn(`matchmaker /bridge failed: ${e.message}`)),
  );
}

// ---------- guest API ----------
async function guestByToken(env, token) {
  const me = await firstRow(env, `people?token=eq.${v(token)}`);
  if (!me) throw new HttpError(404, "This link isn't valid");
  return me;
}
const activeBeacon = (env, filter) =>
  firstRow(env, `beacons?${filter}&found_at=is.null&created_at=gt.${encodeURIComponent(minutesAgo(BEACON_TTL_MIN))}&order=id.desc`);
const nameOf = async (env, uid) => (await firstRow(env, `people?uid=eq.${v(uid)}&select=name`))?.name;

route("GET", "/api/m/:token", async (req, env, { token }) => {
  const me = await guestByToken(env, token);
  const [event, rows, incoming, outgoing] = await Promise.all([
    firstRow(env, `events?id=eq.${v(me.event_id)}&select=id,name,description,type`),
    select(env, `matches?uid=eq.${v(me.uid)}&order=rank`),
    activeBeacon(env, `to_uid=eq.${v(me.uid)}`),
    activeBeacon(env, `from_uid=eq.${v(me.uid)}`),
  ]);
  const others = rows.length ? await select(env, `people?uid=in.${encodeURIComponent(inList(rows.map((r) => r.match_uid)))}`) : [];
  const byUid = Object.fromEntries(others.map((p) => [p.uid, p]));
  const matches = rows.filter((r) => byUid[r.match_uid]).map((r) => ({ rank: r.rank, score: r.score, reason: r.reason, mustMeet: !!r.must_meet, ...profile(byUid[r.match_uid]) }));
  return {
    me: profile(me),
    event,
    matches,
    incoming: incoming && { id: incoming.id, color: incoming.color, from: { uid: incoming.from_uid, name: await nameOf(env, incoming.from_uid) } },
    outgoing: outgoing && { id: outgoing.id, color: outgoing.color, to: { uid: outgoing.to_uid, name: await nameOf(env, outgoing.to_uid) } },
  };
});

route("POST", "/api/m/:token/find", async (req, env, { token }) => {
  const me = await guestByToken(env, token);
  const { uid } = await req.json();
  const target = await firstRow(env, `people?uid=eq.${v(uid)}&event_id=eq.${v(me.event_id)}&select=uid`);
  if (!target) throw new HttpError(404, "Not at this event");
  const mutual = await activeBeacon(env, `from_uid=eq.${v(uid)}&to_uid=eq.${v(me.uid)}`);
  if (mutual) return { id: mutual.id, color: mutual.color };
  await update(env, `beacons?from_uid=eq.${v(me.uid)}&found_at=is.null`, { found_at: new Date().toISOString() });
  const live = await select(env, `beacons?event_id=eq.${v(me.event_id)}&found_at=is.null&created_at=gt.${encodeURIComponent(minutesAgo(BEACON_TTL_MIN))}&select=color`);
  const inUse = new Set(live.map((b) => b.color));
  const color = BEACON_COLORS.find((c) => !inUse.has(c)) ?? BEACON_COLORS[Math.floor(Math.random() * BEACON_COLORS.length)];
  const [b] = await insert(env, "beacons", { event_id: me.event_id, from_uid: me.uid, to_uid: uid, color });
  return { id: b.id, color };
});

route("POST", "/api/m/:token/found", async (req, env, { token }) => {
  const me = await guestByToken(env, token);
  const { id } = await req.json();
  await update(env, `beacons?id=eq.${Number(id)}&or=(from_uid.eq.${v(me.uid)},to_uid.eq.${v(me.uid)})`, { found_at: new Date().toISOString() });
  return { ok: true };
});

// ---------- entry ----------
export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/api/")) {
      try {
        for (const r of routes) {
          const m = r.method === req.method && url.pathname.match(r.re);
          if (!m) continue;
          const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
          return json(await r.fn(req, env, params, ctx));
        }
        return json({ error: "no route" }, 404);
      } catch (e) {
        return json({ error: e.message }, e.status ?? 500);
      }
    }
    return json({ error: "not found" }, 404); // pages are static files, served before this function runs
  },
};
