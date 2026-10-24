// In-memory stand-ins for GitHub, Google and Cloudflare KV, used by the tests and by local preview.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const blobSha = bytes => createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");

export class FakeGitHub {
  constructor(files = {}) {
    this.files = new Map();        // path -> Buffer
    for (const [p, v] of Object.entries(files)) this.files.set(p, Buffer.from(v));
    this.commits = [];             // { message, author, paths }
    this.blobs = new Map(); this.trees = new Map(); this.pending = new Map();
    this.head = "c0"; this.raceOnce = false;
  }
  static fromRepo(root) {
    const files = {};
    const walk = dir => {
      for (const e of readdirSync(join(root, dir), { withFileTypes: true })) {
        const p = `${dir}/${e.name}`;
        if (e.isDirectory()) walk(p); else files[p] = readFileSync(join(root, p));
      }
    };
    walk("content");
    return new FakeGitHub(files);
  }
  get fetch() {
    return async (url, init = {}) => this.handle(new URL(url), init.method || "GET", init.body ? JSON.parse(init.body) : null);
  }
  res(status, data) { return new Response(data === undefined ? null : JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } }); }
  handle(u, method, body) {
    const p = decodeURI(u.pathname).replace(/^\/repos\/[^/]+\/[^/]+/, "");
    const ref = u.searchParams.get("ref");
    if (ref !== null && !/^(main|c\d+|raced|[0-9a-f]{6,})$/.test(ref)) return this.res(404, { message: `fake: unknown ref ${ref}` });
    let m;
    if ((m = /^\/contents\/(.+)$/.exec(p)) && method === "GET") {
      const path = m[1];
      if (this.files.has(path)) {
        const b = this.files.get(path);
        return this.res(200, { type: "file", path, sha: blobSha(b), content: b.toString("base64") });
      }
      const kids = [...this.files.keys()].filter(k => k.startsWith(path + "/") && !k.slice(path.length + 1).includes("/"));
      if (kids.length) return this.res(200, kids.map(k => ({ name: k.split("/").pop(), path: k, sha: blobSha(this.files.get(k)), type: "file" })));
      return this.res(404, { message: "Not Found" });
    }
    if (p === "/commits" && method === "GET") return this.res(200, this.commits.slice().reverse().map((c, i) => ({ sha: "s" + i, commit: { message: c.message, author: { date: "2026-10-24T10:00:00Z" } } })));
    if ((m = /^\/git\/ref\/heads\/(.+)$/.exec(p))) return this.res(200, { object: { sha: this.head } });
    if ((m = /^\/git\/commits\/(.+)$/.exec(p)) && method === "GET") return this.res(200, { tree: { sha: "t-" + m[1] } });
    if (p === "/git/blobs" && method === "POST") {
      const bytes = Buffer.from(body.content, "base64"); const sha = blobSha(bytes);
      this.blobs.set(sha, bytes); return this.res(201, { sha });
    }
    if (p === "/git/trees" && method === "POST") {
      const sha = "tree" + this.trees.size; this.trees.set(sha, body.tree); return this.res(201, { sha });
    }
    if (p === "/git/commits" && method === "POST") {
      const sha = "c" + (this.commits.length + this.pending.size + 1);
      this.pending.set(sha, { ...body }); return this.res(201, { sha });
    }
    if ((m = /^\/git\/refs\/heads\/(.+)$/.exec(p)) && method === "PATCH") {
      if (body.force) return this.res(422, { message: "no force" });
      const c = this.pending.get(body.sha);
      if (this.raceOnce) { this.raceOnce = false; this.head = "raced"; return this.res(422, { message: "Update is not a fast forward" }); }
      if (!c || c.parents[0] !== this.head) return this.res(422, { message: "Update is not a fast forward" });
      for (const e of this.trees.get(c.tree)) this.files.set(e.path, this.blobs.get(e.sha));
      this.commits.push({ message: c.message, author: c.author, paths: this.trees.get(c.tree).map(e => e.path) });
      this.pending.delete(body.sha); this.head = body.sha;
      return this.res(200, { object: { sha: body.sha } });
    }
    return this.res(404, { message: `fake: ${method} ${p}` });
  }
  text(path) { return this.files.get(path)?.toString("utf8"); }
  json(path) { return JSON.parse(this.text(path)); }
  sha(path) { return blobSha(this.files.get(path)); }
}

export class FakeKV {
  constructor() { this.m = new Map(); }
  async get(k, type) { const v = this.m.get(k); return v == null ? null : type === "json" ? JSON.parse(v) : v; }
  async put(k, v) { this.m.set(k, v); }
}

// Google token endpoint that answers with an ID token for `email`.
export function fakeGoogle(env, email, { verified = true, nonceFrom } = {}) {
  return async (url, init) => {
    if (String(url).startsWith("https://oauth2.googleapis.com/token")) {
      const claims = { iss: "https://accounts.google.com", aud: env.GOOGLE_CLIENT_ID, exp: Math.floor(Date.now() / 1000) + 600, email, email_verified: verified, given_name: "Test", nonce: nonceFrom() };
      const part = o => Buffer.from(JSON.stringify(o)).toString("base64url");
      return new Response(JSON.stringify({ id_token: `${part({ alg: "RS256" })}.${part(claims)}.sig` }), { status: 200 });
    }
    throw new Error("unexpected fetch " + url);
  };
}
