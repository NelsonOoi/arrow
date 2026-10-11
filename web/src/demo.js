// Demo mode: when DIAL_API_KEY isn't set, calls and texts are simulated so the
// whole flow can be shown end to end. Every simulated action is logged as such.

export const isDemo = (env) => !env.DIAL_API_KEY;
const CALL_SECONDS = 12; // a simulated call "rings and talks" for this long

// Mock guests' answers: [position, company, interest, goal] (social events use interest as hobby).
export const PERSONAS = [
  ["Founder", "Loop Labs", "AI agents for customer support", "a technical cofounder who's shipped LLM products"],
  ["ML engineer", "Shopify", "retrieval and evals for agents", "an early-stage team that needs someone to own the model layer"],
  ["Partner", "Real Ventures", "pre-seed AI infrastructure", "founders building agent tooling who are raising this year"],
  ["Product designer", "Freelance", "voice and chat interfaces", "a startup that needs its first designer"],
  ["Backend engineer", "Stripe", "payments and Rust", "a hackathon team that needs a backend engineer"],
  ["Founder", "Clinicly", "AI scribes for clinics", "a clinician advisor and an ML engineer"],
  ["Student", "McGill", "computer vision and robotics", "a mentor and a team doing hardware"],
  ["Developer advocate", "ElevenLabs", "voice APIs", "teams building voice agents to try our API"],
  ["Recruiter", "Cohere", "hiring applied ML engineers", "ML engineers open to new roles"],
  ["Angel investor", "Ex-Element AI", "pre-seed vertical AI", "founders with a working demo and early users"],
  ["Full-stack developer", "Lightspeed", "Next.js and Supabase side projects", "a team with a fun idea that needs a full-stack dev"],
  ["Data scientist", "Desjardins", "fraud detection", "people building fintech AI"],
];
const hash = (s) => [...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
export const personaFor = (uid) => PERSONAS[hash(uid) % PERSONAS.length];

export function answersFor(questions, uid) {
  const [position, company, interest, goal] = personaFor(uid);
  const byKey = { position, company, interest, hobby: interest, goal };
  return questions.map((q) => ({ key: q.key, question: q.question, answer: byKey[q.key] ?? null }));
}

export function transcriptFor(event, person, answers) {
  const name = (person.name ?? "there").split(" ")[0];
  const lines = [`Agent: Hi ${name}, this is the AI assistant for ${event.name}. Got 60 seconds for ${answers.length} quick questions?`, `${name}: Sure, go ahead.`];
  for (const a of answers) lines.push(`Agent: ${a.question}`, `${name}: ${a.answer ?? "Not sure yet."}`);
  lines.push(`Agent: Great, thanks ${name}! You'll get a text with the person you should meet.`);
  return lines.join("\n");
}

export const smsReplyFor = (answers) => answers.map((a, i) => `${i + 1}) ${a.answer ?? "-"}`).join("\n");

// ---- simulated Dial ----
export const demoCall = (uid) => ({ id: `demo_${uid}_${Date.now()}` });

export function demoCallStatus(callId) {
  const started = Number(callId.split("_").pop());
  const secs = (Date.now() - started) / 1000;
  if (secs < CALL_SECONDS) return { status: { state: secs < 3 ? "Ringing" : "In-Progress" } };
  return { status: { state: "Terminated", terminationType: "completed" }, duration: 74, demo: true };
}
