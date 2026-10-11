// Dial REST API: AI voice calls and SMS. https://docs.getdial.ai
const BASE = "https://api.getdial.ai/api/v1";

async function req(env, method, path, body, headers = {}) {
  if (!env.DIAL_API_KEY) throw new Error("DIAL_API_KEY not set (wrangler secret put DIAL_API_KEY)");
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { authorization: `Bearer ${env.DIAL_API_KEY}`, "content-type": "application/json", ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = typeof json.error === "string" ? json.error : json.error?.message ?? JSON.stringify(json.error ?? json);
    throw new Error(`Dial ${res.status}: ${err}`);
  }
  return json;
}

// Calls and messages need a from-number; use DIAL_FROM_NUMBER or the first number on the account.
let cachedFrom = null;
async function fromNumber(env) {
  if (env.DIAL_FROM_NUMBER) return env.DIAL_FROM_NUMBER;
  if (cachedFrom) return cachedFrom;
  const { numbers = [] } = await req(env, "GET", "/numbers");
  const usable = numbers.find((n) => !n.replacedBy) ?? numbers[0];
  if (!usable) throw new Error("No Dial phone number on this account");
  return (cachedFrom = usable.id);
}

export async function placeCall(env, { to, instruction, idempotencyKey, maxSeconds = 150 }) {
  const { call } = await req(
    env,
    "POST",
    "/calls",
    { to, outboundInstruction: instruction, fromNumber: await fromNumber(env), maxCallDurationSeconds: maxSeconds },
    idempotencyKey ? { "idempotency-key": idempotencyKey } : {},
  );
  return call;
}

export async function getCall(env, id) {
  return (await req(env, "GET", `/calls/${encodeURIComponent(id)}`)).call;
}

export async function sendSms(env, to, body) {
  return (await req(env, "POST", "/messages", { to, body, fromNumber: await fromNumber(env) })).message;
}

export async function listMessages(env, contact, since) {
  const q = new URLSearchParams({ contact, direction: "inbound", ...(since ? { since } : {}) });
  return (await req(env, "GET", `/messages?${q}`)).messages ?? [];
}
