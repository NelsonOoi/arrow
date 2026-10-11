// Local stand-in for Vercel's routing, used by `vercel dev` (devCommand in ../vercel.json): serves public/
// with the same page rewrites, and sends /api/* to server.js. Not deployed.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import server from "./server.js";

const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".svg": "image/svg+xml", ".js": "text/javascript" };
const page = (path) => (path === "/" ? "/host.html" : path.startsWith("/m/") ? "/m.html" : path);

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname.startsWith("/api/")) {
    const body = ["GET", "HEAD"].includes(req.method) ? undefined : await new Response(req).arrayBuffer();
    const out = await server.fetch(new Request(url, { method: req.method, headers: req.headers, body }));
    res.writeHead(out.status, Object.fromEntries(out.headers));
    return res.end(Buffer.from(await out.arrayBuffer()));
  }
  const file = normalize(join("public", page(url.pathname)));
  if (!file.startsWith("public")) return res.writeHead(400).end();
  try {
    const data = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" }).end(data);
  } catch {
    res.writeHead(404).end("not found");
  }
}).listen(Number(process.env.PORT ?? 3000), () => console.log(`web dev server on :${process.env.PORT ?? 3000}`));
