// Vercel entrypoint for the web service: /api/* goes to the router in src/worker.js with the project's
// environment variables as `env` and Vercel's waitUntil as `ctx`. Files in public/ are served statically.
import { waitUntil } from "@vercel/functions";
import worker from "./src/worker.js";

const ctx = { waitUntil };

export default {
  fetch: (req) => worker.fetch(req, process.env, ctx),
};
