// ADS BOX admin panel server (Cloudflare Worker).
// Serves the panel, signs people in with Google, checks their role for every request,
// and saves changes as commits to the website repository (the site then rebuilds itself).

import { GitHub, Conflict, b64decode } from "./github.js";
import { ROLES, ROLE_INFO, canView, canEdit, permsFor } from "./perms.js";
import {
  readSession, makeSession, clearSession, loginRedirect, finishLogin, clearState,
  loadTeam, saveTeam, roleOf, normEmail,
} from "./auth.js";
import {
  FILES, ACCOUNT_CACHE, ARTICLES_DIR, ARTICLE_TAGS, CLEAN, Invalid,
  parseArticle, serializeArticle, cleanArticle, articleMeta, checkImage, uploadPath, fillUploads,
} from "./content.js";

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers } });
const err = (status, message, extra = {}) => json({ error: message, ...extra }, status);

const SECTION_KM = { services: "សេវាកម្ម", accounts: "ផេកលក់", promos: "Pop-up", clients: "Logo អតិថិជន", autopost: "ការកំណត់បោះពុម្ពស្វ័យប្រវត្តិ", articles: "អត្ថបទ" };
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MAX_UPLOADS = 8;
const META_BATCH = 30;

function gh(env, fetchFn) {
  return new GitHub({ token: env.GITHUB_TOKEN, repo: env.REPO, branch: env.BRANCH || "main", fetch: fetchFn });
}

// Commit messages name the role and first name, never the email (the repository is public).
function commitInfo(user, what) {
  const r = ROLE_INFO[user.role];
  const who = `${r.en}${user.name ? " · " + user.name.replace(/[\r\n]/g, " ").slice(0, 30) : ""}`;
  return { message: `Admin (${who}): ${what}`, author: { name: `ADS BOX Admin (${who})`, email: "admin@adsbox.agency" } };
}

async function handleUploads(section, uploads) {
  if (!uploads) return { files: [], paths: {} };
  if (!Array.isArray(uploads) || uploads.length > MAX_UPLOADS) throw new Invalid(`រូបភាពច្រើនពេក (អតិបរមា ${MAX_UPLOADS})`);
  const files = [], paths = {};
  uploads.forEach((u, i) => {
    let bytes;
    try { bytes = b64decode(String(u.b64 || "")); } catch { throw new Invalid("រូបភាពខូច"); }
    const ext = checkImage(u.name, bytes);
    const path = uploadPath(section, u.name, ext);
    files.push({ path, bytes });
    paths[String(u.key ?? i)] = "/" + path;
  });
  return { files, paths };
}

async function readJSON(g, path) {
  const f = await g.readFile(path);
  if (!f) return { data: null, sha: null };
  return { data: JSON.parse(f.text), sha: f.sha };
}

export async function api(req, env, url, user, fetchFn) {
  const g = gh(env, fetchFn);
  const parts = url.pathname.split("/").filter(Boolean).slice(1);  // drop "api"
  const [kind, name] = parts;
  const method = req.method;

  if (kind === "me" && method === "GET") {
    return json({ email: user.email, name: user.name, role: user.role, roleInfo: ROLE_INFO[user.role], perms: permsFor(user.role), roles: ROLES.map(r => ({ id: r, ...ROLE_INFO[r] })), matrix: Object.fromEntries(ROLES.map(r => [r, permsFor(r)])), tags: ARTICLE_TAGS, repo: env.REPO, site: env.SITE_URL || "https://adsbox.agency" });
  }

  if (kind === "activity" && method === "GET") {
    return json({ commits: await g.recentCommits("content", 12) });
  }

  // ----- single-file sections -----
  if (kind === "data" && FILES[name]) {
    if (!canView(user.role, name)) return err(403, "អ្នកមិនមានសិទ្ធិមើលផ្នែកនេះទេ");
    if (method === "GET") {
      const { data, sha } = await readJSON(g, FILES[name]);
      const out = { data, sha, canEdit: canEdit(user.role, name) };
      if (name === "accounts") out.cache = (await readJSON(g, ACCOUNT_CACHE)).data || {};
      return json(out);
    }
    if (method === "PUT") {
      if (!canEdit(user.role, name) || !CLEAN[name]) return err(403, "អ្នកមិនមានសិទ្ធិកែផ្នែកនេះទេ");
      const body = await req.json();
      const { files, paths } = await handleUploads(name, body.uploads);
      const cur = await g.readFile(FILES[name]);
      const before = cur ? JSON.parse(cur.text) : null;
      const data = CLEAN[name](fillUploads(body.data, paths), before);
      // Same layout as the file already has (2-space indent; final newline only if it had one).
      const text = JSON.stringify(data, null, 2) + (!cur || cur.text.endsWith("\n") ? "\n" : "");
      const info = commitInfo(user, `update ${name}`);
      const res = await g.commit([{ path: FILES[name], text }, ...files], info.message, { [FILES[name]]: body.sha || null }, info.author);
      return json({ ok: true, sha: res.blobs[FILES[name]], data, commit: res.commit });
    }
    return err(405, "method");
  }

  // ----- articles -----
  if (kind === "articles") {
    if (!canView(user.role, "articles")) return err(403, "អ្នកមិនមានសិទ្ធិមើលផ្នែកនេះទេ");
    if (!name && method === "GET") {
      // List: titles come from a cache keyed by file version, filled a few files at a time.
      const files = (await g.listDir(ARTICLES_DIR)).filter(f => f.type === "file" && f.name.endsWith(".md"));
      const items = []; let pending = 0; let fetched = 0;
      for (const f of files) {
        const key = `meta:${f.sha}`;
        let meta = env.TEAM ? await env.TEAM.get(key, "json") : null;
        if (!meta && fetched < META_BATCH) {
          const file = await g.readFile(f.path);
          meta = articleMeta(parseArticle(file.text).data);
          fetched++;
          if (env.TEAM) await env.TEAM.put(key, JSON.stringify(meta), { expirationTtl: 60 * 60 * 24 * 120 });
        }
        if (!meta) { pending++; meta = { title: "…", date: "", tag: "", draft: false, loading: true }; }
        items.push({ slug: f.name.slice(0, -3), sha: f.sha, ...meta });
      }
      items.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
      return json({ items, pending, canEdit: canEdit(user.role, "articles") });
    }
    if (!SLUG.test(name || "")) return err(400, "តំណភ្ជាប់មិនត្រឹមត្រូវ");
    const path = `${ARTICLES_DIR}/${name}.md`;
    if (method === "GET") {
      const f = await g.readFile(path);
      if (!f) return err(404, "រកមិនឃើញអត្ថបទ");
      const { data, body } = parseArticle(f.text);
      return json({ slug: name, data, body, sha: f.sha, canEdit: canEdit(user.role, "articles") });
    }
    if (method === "PUT") {
      if (!canEdit(user.role, "articles")) return err(403, "អ្នកមិនមានសិទ្ធិកែអត្ថបទទេ");
      const body = await req.json();
      const { files, paths } = await handleUploads("articles", body.uploads);
      let before = null;
      if (body.sha) {
        const cur = await g.readFile(path);
        if (cur) before = parseArticle(cur.text).data;
      }
      const { data, body: text } = cleanArticle(fillUploads(body.data, paths), body.body ?? "", before, name);
      const info = commitInfo(user, `${body.sha ? "edit" : "new"} article ${name}`);
      const res = await g.commit([{ path, text: serializeArticle(data, text) }, ...files], info.message, { [path]: body.sha || null }, info.author);
      return json({ ok: true, sha: res.blobs[path], data, commit: res.commit });
    }
    return err(405, "method");
  }

  // ----- team -----
  if (kind === "team") {
    if (!canView(user.role, "team")) return err(403, "មានតែម្ចាស់ប៉ុណ្ណោះ");
    const team = await loadTeam(env);
    const owner = { email: normEmail(env.OWNER_EMAIL), role: "owner", name: "", fixed: true };
    if (method === "GET") return json({ members: [owner, ...team.members.filter(m => normEmail(m.email) !== owner.email)] });
    if (method === "PUT") {
      const body = await req.json();
      if (!Array.isArray(body.members) || body.members.length > 100) return err(400, "បញ្ជីមិនត្រឹមត្រូវ");
      const seen = new Set([owner.email]);
      const members = [];
      for (const m of body.members) {
        const email = normEmail(m && m.email);
        if (email === owner.email) continue;   // the owner cannot be changed here
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return err(400, `អ៊ីមែលមិនត្រឹមត្រូវ: ${email || "(ទទេ)"}`);
        if (!ROLES.includes(m.role) || m.role === "owner") return err(400, `តួនាទីមិនត្រឹមត្រូវ: ${email}`);
        if (seen.has(email)) return err(400, `អ៊ីមែលស្ទួន: ${email}`);
        seen.add(email);
        members.push({ email, role: m.role, name: String(m.name || "").slice(0, 60), added: m.added || new Date().toISOString().slice(0, 10) });
      }
      await saveTeam(env, { members });
      return json({ ok: true, members: [owner, ...members] });
    }
    return err(405, "method");
  }

  return err(404, "not found");
}

export default {
  async fetch(req, env, ctx, fetchFn) {
    const url = new URL(req.url);
    const path = url.pathname;
    const headers = { "X-Frame-Options": "DENY", "Referrer-Policy": "same-origin", "X-Content-Type-Options": "nosniff" };

    try {
      if (path === "/auth/login") return loginRedirect(env, url);
      if (path === "/auth/callback") {
        let who;
        try { who = await finishLogin(env, req, url, fetchFn); }
        catch (e) { return redirect(`/?error=${encodeURIComponent(e.message)}`, [clearState()]); }
        const role = await roleOf(env, who.email);
        if (!role) return redirect(`/?error=not_member&email=${encodeURIComponent(who.email)}`, [clearState()]);
        return redirect("/", [clearState(), await makeSession(env, who.email, who.name)]);
      }
      if (path === "/auth/logout") {
        if (req.method !== "POST") return err(405, "method");
        if (req.headers.get("Origin") !== url.origin) return err(403, "bad origin");
        return json({ ok: true }, 200, { "Set-Cookie": clearSession() });
      }

      if (path.startsWith("/api/")) {
        if (req.method !== "GET") {
          // Writes must come from this panel's own pages.
          const origin = req.headers.get("Origin");
          if (origin !== url.origin) return err(403, "bad origin");
          if (!(req.headers.get("Content-Type") || "").startsWith("application/json")) return err(415, "json only");
        }
        const s = await readSession(env, req);
        if (!s) return err(401, "សូមចូលគណនីម្តងទៀត");
        const role = await roleOf(env, s.email);   // looked up every time, so removing someone works at once
        if (!role) return err(401, "គណនីនេះមិនមែនជាសមាជិកទៀតទេ", { removed: true }, );
        const res = await api(req, env, url, { ...s, role }, fetchFn);
        for (const [k, v] of Object.entries(headers)) res.headers.set(k, v);
        return res;
      }

      // Everything else: the panel's files.
      if (env.ASSETS) return env.ASSETS.fetch(req);
      return new Response("Not found", { status: 404 });
    } catch (e) {
      if (e instanceof Invalid) return err(400, e.message);
      if (e instanceof Conflict) return err(409, "មានអ្នកផ្សេងបានកែផ្នែកនេះ មុនពេលអ្នក Save។ សូមផ្ទុកឡើងវិញ ហើយកែម្តងទៀត។");
      if (e instanceof SyntaxError) return err(400, "ទិន្នន័យមិនត្រឹមត្រូវ");
      console.error(e && e.stack || e);
      return err(500, "មានបញ្ហា សូមព្យាយាមម្តងទៀត");
    }
  },
};

function redirect(location, cookies = []) {
  const h = new Headers({ Location: location });
  for (const c of cookies) h.append("Set-Cookie", c);
  return new Response(null, { status: 302, headers: h });
}
