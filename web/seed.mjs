// Loads one demo hackathon with 20 guests who already "answered" into Supabase.
//   node seed.mjs        (reads the service key from ~/.config/arrow/supabase.key or $SUPABASE_SERVICE_KEY)
// then press "Run matching" on the dashboard (or POST /api/events/evt_demo/match).
import fs from "node:fs";
import os from "node:os";

const URL_ = process.env.SUPABASE_URL ?? "https://euzqbkrabyxlbqdcsddj.supabase.co";
const KEY = process.env.SUPABASE_SERVICE_KEY ?? fs.readFileSync(`${os.homedir()}/.config/arrow/supabase.key`, "utf8").trim();

const EVENT = {
  id: "evt_demo",
  name: "Montreal AI Hackathon",
  description: "A 24-hour hackathon for builders working on AI agents. Teams form on site; sponsors are hiring.",
  type: "networking",
  host: "Arrow team",
};
const QUESTIONS = [
  ["position", "What's your role or position?"],
  ["company", "Where do you work?"],
  ["interest", "What are you interested in or working on lately?"],
  ["goal", "What are you looking for at this event — who would be the perfect person to meet?"],
];

// [name, position, company, interest, goal]
const GUESTS = [
  ["Sun Ha", "Founder", "Fade Radar", "voice agents that answer phones for barbershops", "a frontend engineer to team up with and investors who back voice AI"],
  ["Maya Chen", "Frontend engineer", "Shopify", "design systems and React animation", "a team building a voice or agent product that needs a frontend engineer"],
  ["Daniel Okafor", "Partner", "Inovia Capital", "early-stage AI infrastructure and voice AI", "founders building voice agents or AI infrastructure"],
  ["Priya Raman", "ML engineer", "Mila", "speech recognition and LLM evaluation", "a startup that's hiring ML engineers for speech"],
  ["Lucas Tremblay", "Recruiter", "Cohere", "hiring ML engineers and applied researchers", "ML engineers who know LLM evaluation or speech"],
  ["Aisha Diallo", "Product designer", "Freelance", "UX for conversational interfaces", "founders who need a product designer for an agent app"],
  ["Ethan Brooks", "Backend engineer", "Stripe", "payments infrastructure and Rust", "a hackathon team that needs a backend engineer"],
  ["Sofia Rossi", "Founder", "LegalLens", "AI agents for contract review", "a backend engineer cofounder and lawyers to test with"],
  ["Kenji Watanabe", "Student", "McGill", "robotics and computer vision", "mentors in robotics and a team that does computer vision"],
  ["Hannah Levi", "Engineering manager", "Ubisoft La Forge", "AI for game characters and computer vision", "students and engineers to mentor in robotics or game AI"],
  ["Omar Haddad", "Developer advocate", "ElevenLabs", "voice cloning and text to speech APIs", "teams building voice agents to try our API"],
  ["Chloé Gagnon", "Lawyer", "Fasken", "tech law and AI regulation", "founders building legal AI tools"],
  ["Ravi Patel", "Data scientist", "Desjardins", "fraud detection and payments data", "people working on payments or fintech AI"],
  ["Emma Wilson", "Founder", "Nestly", "AI for property managers", "a designer and early customers in real estate"],
  ["Jonas Müller", "Angel investor", "Ex-Element AI", "pre-seed AI startups", "founders raising pre-seed for AI agents"],
  ["Léa Bouchard", "Full-stack developer", "Lightspeed", "Next.js and Supabase side projects", "a team with a fun AI idea that needs a full-stack developer"],
  ["Marcus Johnson", "Sales lead", "Dialpad", "phone systems for small businesses", "founders building voice agents for small businesses"],
  ["Nadia Karim", "PhD student", "Mila", "LLM evaluation and alignment", "researchers and recruiters hiring for LLM evaluation"],
  ["Tom Nguyen", "iOS engineer", "Busbud", "Swift, UWB and Nearby Interaction", "a team building something native on iPhone"],
  ["Grace Kim", "Real estate broker", "Royal LePage", "property management software", "founders building AI tools for real estate"],
];

async function sb(method, path, body) {
  const res = await fetch(`${URL_}/rest/v1/${path}`, {
    method,
    headers: { apikey: KEY, authorization: `Bearer ${KEY}`, "content-type": "application/json", prefer: "return=minimal" },
    body: body && JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
}

// deleting the event cascades to its people, matches, beacons and logs
await sb("DELETE", `events?id=eq.${EVENT.id}`);
await sb("POST", "events", EVENT);
await sb(
  "POST",
  "people",
  GUESTS.map(([name, ...answers], i) => ({
    uid: `u_demo${i + 1}`,
    event_id: EVENT.id,
    name,
    // fake 555 numbers; demo tokens keep links stable: /m/demo is Sun, /m/demo-2 is Maya
    phone: `+1555010${String(i).padStart(4, "0")}`,
    status: "answered",
    source: "seed",
    answers: QUESTIONS.map(([key, question], j) => ({ key, question, answer: answers[j] })),
    token: i === 0 ? "demo" : `demo-${i + 1}`,
    created_at: new Date(Date.UTC(2026, 9, 11, 16, i)).toISOString(),
  })),
);
console.log(`Seeded ${EVENT.id} with ${GUESTS.length} guests`);
