// Minimal GitHub client: read files and make one commit with several files.

const API = "https://api.github.com";

export class Conflict extends Error {
  constructor(path) { super(`changed by someone else: ${path}`); this.path = path; }
}

export function b64encode(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function b64decode(b64) {
  const bin = atob(b64.replace(/\s/g, ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export class GitHub {
  constructor({ token, repo, branch, fetch: f }) {
    this.token = token; this.repo = repo; this.branch = branch || "main";
    this.fetch = f || ((...a) => fetch(...a));
  }

  async call(method, path, body) {
    const r = await this.fetch(API + path, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "adsbox-admin",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (r.status === 404) return null;
    const data = r.status === 204 ? null : await r.json();
    if (!r.ok) {
      const e = new Error(`GitHub ${method} ${path}: ${r.status} ${data && data.message}`);
      e.status = r.status; throw e;
    }
    return data;
  }

  // -> { text, sha } or null when the file does not exist
  async readFile(path, ref) {
    const d = await this.call("GET", `/repos/${this.repo}/contents/${encodeURI(path)}?ref=${ref || this.branch}`);
    if (!d || Array.isArray(d)) return null;
    let bytes;
    if (d.content) bytes = b64decode(d.content);
    else {  // files over 1 MB: fetch the blob
      const blob = await this.call("GET", `/repos/${this.repo}/git/blobs/${d.sha}`);
      bytes = b64decode(blob.content);
    }
    return { text: new TextDecoder().decode(bytes), sha: d.sha };
  }

  // -> [{ name, path, sha, type }]
  async listDir(path) {
    const d = await this.call("GET", `/repos/${this.repo}/contents/${encodeURI(path)}?ref=${this.branch}`);
    return Array.isArray(d) ? d.map(({ name, path, sha, type }) => ({ name, path, sha, type })) : [];
  }

  async recentCommits(path, n = 10) {
    const d = await this.call("GET", `/repos/${this.repo}/commits?sha=${this.branch}&path=${encodeURIComponent(path)}&per_page=${n}`);
    return (d || []).map(c => ({ sha: c.sha, message: c.commit.message.split("\n")[0], date: c.commit.author.date }));
  }

  // files: [{ path, text } | { path, bytes }]
  // expect: { path: blobSha | null }  (null = the file must not exist yet)
  // Fails with Conflict if a file changed since it was loaded. Never force-pushes.
  async commit(files, message, expect = {}, author) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const ref = await this.call("GET", `/repos/${this.repo}/git/ref/heads/${this.branch}`);
      const head = ref.object.sha;
      for (const [path, sha] of Object.entries(expect)) {
        const cur = await this.call("GET", `/repos/${this.repo}/contents/${encodeURI(path)}?ref=${head}`);
        const curSha = cur && !Array.isArray(cur) ? cur.sha : null;
        if (curSha !== (sha || null)) throw new Conflict(path);
      }
      const base = await this.call("GET", `/repos/${this.repo}/git/commits/${head}`);
      const tree = [];
      for (const f of files) {
        const bytes = f.bytes || new TextEncoder().encode(f.text);
        const blob = await this.call("POST", `/repos/${this.repo}/git/blobs`, { content: b64encode(bytes), encoding: "base64" });
        tree.push({ path: f.path, mode: "100644", type: "blob", sha: blob.sha });
      }
      const t = await this.call("POST", `/repos/${this.repo}/git/trees`, { base_tree: base.tree.sha, tree });
      const c = await this.call("POST", `/repos/${this.repo}/git/commits`, {
        message, tree: t.sha, parents: [head],
        ...(author ? { author: { ...author, date: new Date().toISOString() } } : {}),
      });
      try {
        await this.call("PATCH", `/repos/${this.repo}/git/refs/heads/${this.branch}`, { sha: c.sha, force: false });
      } catch (e) {
        if (e.status === 422) continue;   // someone pushed in between: rebuild on the new head
        throw e;
      }
      const blobs = {};
      for (const e of tree) blobs[e.path] = e.sha;
      return { commit: c.sha, blobs };
    }
    throw new Error("GitHub is busy, please try again");
  }
}
