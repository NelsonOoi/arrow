// Supabase (PostgREST) with the service key. Tables are defined in schema.sql.
// Each helper takes a PostgREST query string, e.g. "people?event_id=eq.evt_1&order=created_at".
const PROJECT_URL = "https://euzqbkrabyxlbqdcsddj.supabase.co";

async function sb(env, method, path, { body, prefer } = {}) {
  if (!env.SUPABASE_SERVICE_KEY) throw new Error("SUPABASE_SERVICE_KEY not set (vercel env add SUPABASE_SERVICE_KEY)");
  const res = await fetch(`${env.SUPABASE_URL ?? PROJECT_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      "content-type": "application/json",
      ...(prefer ? { prefer } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

export const select = (env, q) => sb(env, "GET", q);
export const first = async (env, q) => (await sb(env, "GET", `${q}${q.includes("?") ? "&" : "?"}limit=1`))[0] ?? null;
export const insert = (env, table, rows) => sb(env, "POST", table, { body: rows, prefer: "return=representation" });
export const update = (env, q, fields) => sb(env, "PATCH", q, { body: fields, prefer: "return=representation" });
export const remove = (env, q) => sb(env, "DELETE", q, { prefer: "return=minimal" });

// Values inside eq./or() filters. Ids and tokens are URL-safe ([A-Za-z0-9_-]), so just
// encode; PostgREST would treat surrounding quotes as part of an eq. value.
export const v = (x) => encodeURIComponent(String(x));
export const inList = (xs) => `(${xs.map((x) => `"${String(x).replace(/"/g, '\\"')}"`).join(",")})`;
