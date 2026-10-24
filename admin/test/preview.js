// Local preview: runs the real server code with a fake GitHub (a copy of content/) and fake KV.
// Nothing is sent to GitHub, Google or Cloudflare.   node test/preview.js [port]
import http from "node:http";
import { readFile } from "node:fs/promises";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import worker from "../src/worker.js";
import { FakeGitHub, FakeKV } from "./fake.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(HERE, "..", "public");
const port = +process.argv[2] || 8799;
const gh = FakeGitHub.fromRepo(join(HERE, "..", ".."));
const kv = new FakeKV();
await kv.put("team", JSON.stringify({ members: ["admin", "sales", "writer", "designer", "viewer"].map(r => ({ email: `${r}@example.com`, role: r, added: "2026-10-24" })) }));
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".png": "image/png" };
const env = {
  OWNER_EMAIL: "owner@example.com", SESSION_SECRET: "preview-secret", GITHUB_TOKEN: "x", REPO: "vannakadsbox/adsbox-agency-site",
  BRANCH: "main", GOOGLE_CLIENT_ID: "cid", GOOGLE_CLIENT_SECRET: "cs", TEAM: kv,
  ASSETS: { async fetch(req) {
    let p = new URL(req.url).pathname; if (p === "/") p = "/index.html";
    try { return new Response(await readFile(join(PUBLIC, p.replace(/\.\./g, ""))), { headers: { "Content-Type": TYPES[extname(p)] || "application/octet-stream" } }); }
    catch { return new Response("Not found", { status: 404 }); }
  } },
};
export const state = { gh, kv };

http.createServer(async (req, res) => {
  const chunks = []; for await (const c of req) chunks.push(c);
  const r = new Request(`http://localhost:${port}${req.url}`, { method: req.method, headers: req.headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : Buffer.concat(chunks) });
  const out = await worker.fetch(r, env, {}, gh.fetch);
  const headers = {}; out.headers.forEach((v, k) => { headers[k] = k === "set-cookie" ? out.headers.getSetCookie() : v; });
  res.writeHead(out.status, headers);
  res.end(Buffer.from(await out.arrayBuffer()));
}).listen(port, () => console.log(`preview on http://localhost:${port} · commits are kept in memory`));

// Let the test script read what would have been committed.
process.on("message", m => { if (m === "commits") process.send(gh.commits.map(c => ({ message: c.message, paths: c.paths }))); });
