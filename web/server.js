// Vercel entrypoint for the web API (re-exported by ../api/web.mjs): /api/* goes to the router in src/worker.js
// with the project's environment variables as `env` and Vercel's waitUntil as `ctx`. Files in public/ are static.
import { waitUntil } from "@vercel/functions";
import worker from "./src/worker.js";

const ctx = { waitUntil };

// The matchmaker is served from the same deployment under /mm/, unless MATCHMAKER_URL points elsewhere.
const envFor = (req) =>
  process.env.VERCEL && !process.env.MATCHMAKER_URL
    ? { ...process.env, MATCHMAKER_URL: new URL("/mm/", req.url).href }
    : process.env;

export default {
  fetch: (req) => worker.fetch(req, envFor(req), ctx),
};
