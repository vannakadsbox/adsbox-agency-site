import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import worker from "../src/worker.js";
import { makeSession } from "../src/auth.js";
import { ROLES, access } from "../src/perms.js";
import { FakeGitHub, FakeKV, fakeGoogle } from "./fake.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ORIGIN = "https://admin.example.test";
const OWNER = "owner@example.com";
const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4c80000000049454e44ae426082", "hex");

let env, gh, kv;
const EMAIL = r => (r === "owner" ? OWNER : `${r}@example.com`);

beforeEach(async () => {
  gh = FakeGitHub.fromRepo(ROOT);
  kv = new FakeKV();
  env = { OWNER_EMAIL: OWNER, SESSION_SECRET: "test-secret-0123456789", GITHUB_TOKEN: "t", REPO: "o/r", BRANCH: "main", GOOGLE_CLIENT_ID: "cid", GOOGLE_CLIENT_SECRET: "cs", TEAM: kv };
  await kv.put("team", JSON.stringify({ members: ROLES.filter(r => r !== "owner").map(r => ({ email: EMAIL(r), role: r })) }));
});

async function call(role, method, path, body, { origin = ORIGIN, cookie } = {}) {
  const headers = new Headers();
  if (role) headers.set("Cookie", (cookie || await makeSession(env, EMAIL(role), "Dara")).split(";")[0]);
  if (body !== undefined) headers.set("Content-Type", "application/json");
  if (origin) headers.set("Origin", origin);
  const req = new Request(ORIGIN + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const res = await worker.fetch(req, env, {}, gh.fetch);
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null, res };
}

describe("sign-in and sessions", () => {
  test("no cookie -> 401", async () => {
    assert.equal((await call(null, "GET", "/api/me")).status, 401);
  });
  test("tampered cookie -> 401", async () => {
    const good = (await makeSession(env, EMAIL("viewer"), "")).split(";")[0];
    const bad = good.replace(/^adm_s=./, "adm_s=X");
    assert.equal((await call("viewer", "GET", "/api/me", undefined, { cookie: bad })).status, 401);
  });
  test("cookie signed with another secret -> 401", async () => {
    const other = (await makeSession({ SESSION_SECRET: "other" }, OWNER, "")).split(";")[0];
    assert.equal((await call("owner", "GET", "/api/me", undefined, { cookie: other })).status, 401);
  });
  test("removed member loses access at once", async () => {
    const cookie = (await makeSession(env, EMAIL("sales"), "")).split(";")[0];
    await kv.put("team", JSON.stringify({ members: [] }));
    const r = await call("sales", "GET", "/api/me", undefined, { cookie });
    assert.equal(r.status, 401); assert.equal(r.body.removed, true);
  });
  test("Google login: member gets a session, stranger is refused", async () => {
    let state;
    const login = await worker.fetch(new Request(ORIGIN + "/auth/login"), env, {});
    assert.equal(login.status, 302);
    const loc = new URL(login.headers.get("Location"));
    assert.equal(loc.host, "accounts.google.com");
    assert.equal(loc.searchParams.get("redirect_uri"), ORIGIN + "/auth/callback");
    state = loc.searchParams.get("state");
    const stCookie = login.headers.get("Set-Cookie").split(";")[0];
    const cb = email => worker.fetch(new Request(`${ORIGIN}/auth/callback?code=abc&state=${state}`, { headers: { Cookie: stCookie } }), env, {}, fakeGoogle(env, email, { nonceFrom: () => state }));
    const ok = await cb("Writer@Example.com");
    assert.equal(ok.status, 302); assert.equal(ok.headers.get("Location"), "/");
    assert.match(ok.headers.get("Set-Cookie"), /adm_s=[^;]+; Path=\/; Max-Age=604800; HttpOnly; Secure; SameSite=Lax/);
    const no = await cb("stranger@example.com");
    assert.match(no.headers.get("Location"), /error=not_member/);
    assert.doesNotMatch(no.headers.get("Set-Cookie") || "", /adm_s=[^;]/);
  });
  test("Google login: wrong state is refused", async () => {
    const r = await worker.fetch(new Request(`${ORIGIN}/auth/callback?code=abc&state=zzz`, { headers: { Cookie: "adm_st=yyy" } }), env, {}, fakeGoogle(env, OWNER, { nonceFrom: () => "zzz" }));
    assert.match(r.headers.get("Location"), /error=bad_state/);
  });
  test("Google login: unverified email is refused", async () => {
    const r = await worker.fetch(new Request(`${ORIGIN}/auth/callback?code=abc&state=s1`, { headers: { Cookie: "adm_st=s1" } }), env, {}, fakeGoogle(env, OWNER, { verified: false, nonceFrom: () => "s1" }));
    assert.match(r.headers.get("Location"), /error=email_not_verified/);
  });
  test("writes from another site are refused", async () => {
    const { data, sha } = (await call("owner", "GET", "/api/data/services")).body;
    const r = await call("owner", "PUT", "/api/data/services", { data, sha }, { origin: "https://evil.example" });
    assert.equal(r.status, 403);
    assert.equal(gh.commits.length, 0);
  });
});

describe("permissions for every role and section", () => {
  const SECTIONS = ["services", "accounts", "promos", "clients", "autopost", "history"];
  for (const role of ROLES) {
    for (const s of SECTIONS) {
      test(`${role} · ${s}`, async () => {
        const a = access(role, s);
        const r = await call(role, "GET", `/api/data/${s}`);
        assert.equal(r.status, a === "N" ? 403 : 200);
        if (a === "N") return;
        assert.equal(r.body.canEdit, a === "E");
        const w = await call(role, "PUT", `/api/data/${s}`, { data: r.body.data, sha: r.body.sha });
        assert.equal(w.status, a === "E" && s !== "history" ? 200 : 403, JSON.stringify(w.body));
      });
    }
    test(`${role} · articles`, async () => {
      const a = access(role, "articles");
      const list = await call(role, "GET", "/api/articles");
      assert.equal(list.status, 200);
      const one = await call(role, "GET", "/api/articles/sell-more-on-live");
      const w = await call(role, "PUT", "/api/articles/sell-more-on-live", { data: one.body.data, body: one.body.body, sha: one.body.sha });
      assert.equal(w.status, a === "E" ? 200 : 403);
    });
    test(`${role} · team`, async () => {
      const r = await call(role, "GET", "/api/team");
      assert.equal(r.status, role === "owner" ? 200 : 403);
      const w = await call(role, "PUT", "/api/team", { members: [{ email: "x@example.com", role: "admin" }] });
      assert.equal(w.status, role === "owner" ? 200 : 403);
    });
  }
});

describe("saving content", () => {
  test("saving unchanged services keeps the file identical", async () => {
    const before = gh.text("content/services.json");
    const { data, sha } = (await call("sales", "GET", "/api/data/services")).body;
    const r = await call("sales", "PUT", "/api/data/services", { data, sha });
    assert.equal(r.status, 200);
    assert.equal(gh.text("content/services.json"), before);
    assert.match(gh.commits[0].message, /^Admin \(Sales · Dara\): update services$/);
    assert.doesNotMatch(JSON.stringify(gh.commits[0]), /@example\.com/);  // no emails in the public history
  });
  test("every section round-trips unchanged", async () => {
    for (const s of ["accounts", "promos", "clients", "autopost"]) {
      const path = { accounts: "content/accounts.json", promos: "content/promos.json", clients: "content/clients.json", autopost: "content/autopost/settings.json" }[s];
      const before = gh.text(path);
      const { data, sha } = (await call("owner", "GET", `/api/data/${s}`)).body;
      assert.equal((await call("owner", "PUT", `/api/data/${s}`, { data, sha })).status, 200, s);
      assert.equal(gh.text(path), before, s);
    }
  });
  test("price change is saved", async () => {
    const { data, sha } = (await call("sales", "GET", "/api/data/services")).body;
    data.groups[0].services[0].price = "$89 / ខែ";
    assert.equal((await call("sales", "PUT", "/api/data/services", { data, sha })).status, 200);
    assert.equal(gh.json("content/services.json").groups[0].services[0].price, "$89 / ខែ");
  });
  test("stale save is refused with 409", async () => {
    const a = (await call("sales", "GET", "/api/data/services")).body;
    const b = (await call("admin", "GET", "/api/data/services")).body;
    a.data.groups[0].name = "A";
    assert.equal((await call("sales", "PUT", "/api/data/services", a)).status, 200);
    b.data.groups[0].name = "B";
    const r = await call("admin", "PUT", "/api/data/services", b);
    assert.equal(r.status, 409);
    assert.equal(gh.json("content/services.json").groups[0].name, "A");
  });
  test("survives someone pushing at the same moment (no force push)", async () => {
    const { data, sha } = (await call("sales", "GET", "/api/data/services")).body;
    gh.raceOnce = true;
    assert.equal((await call("sales", "PUT", "/api/data/services", { data, sha })).status, 200);
  });
  test("bad values are refused", async () => {
    const { data, sha } = (await call("sales", "GET", "/api/data/services")).body;
    data.groups[0].services[0].id = "Bad ID";
    const r = await call("sales", "PUT", "/api/data/services", { data, sha });
    assert.equal(r.status, 400); assert.match(r.body.error, /លេខកូដ/);
    data.groups[0].services[0].id = data.groups[0].services[1].id;
    assert.equal((await call("sales", "PUT", "/api/data/services", { data, sha })).status, 400);
  });
  test("Facebook link must be a Facebook link", async () => {
    const { data, sha } = (await call("sales", "GET", "/api/data/accounts")).body;
    data.facebook.items.push({ url: "https://evil.example/x", type: "ផេកខ្មែរ", status: "available" });
    assert.equal((await call("sales", "PUT", "/api/data/accounts", { data, sha })).status, 400);
    data.facebook.items[data.facebook.items.length - 1].url = "https://www.facebook.com/profile.php?id=1";
    assert.equal((await call("sales", "PUT", "/api/data/accounts", { data, sha })).status, 200);
  });
  test("image upload goes into the same commit", async () => {
    const { data, sha } = (await call("designer", "GET", "/api/data/clients")).body;
    data.clients.push({ name: "New Shop", logo: "upload:0" });
    const r = await call("designer", "PUT", "/api/data/clients", { data, sha, uploads: [{ key: 0, name: "New Shop.PNG", b64: PNG.toString("base64") }] });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const logo = gh.json("content/clients.json").clients.at(-1).logo;
    assert.match(logo, /^\/assets\/uploads\/clients\/new-shop-[0-9a-f]{6}\.png$/);
    assert.ok(gh.files.has(logo.slice(1)));
    assert.equal(gh.commits.length, 1);
    assert.deepEqual(gh.commits[0].paths.sort(), ["content/clients.json", logo.slice(1)].sort());
  });
  test("fake images and wrong types are refused", async () => {
    const { data, sha } = (await call("designer", "GET", "/api/data/clients")).body;
    data.clients.push({ name: "x", logo: "upload:0" });
    const html = Buffer.from("<script>alert(1)</script>").toString("base64");
    assert.equal((await call("designer", "PUT", "/api/data/clients", { data, sha, uploads: [{ key: 0, name: "x.png", b64: html }] })).status, 400);
    assert.equal((await call("designer", "PUT", "/api/data/clients", { data, sha, uploads: [{ key: 0, name: "x.svg", b64: html }] })).status, 400);
    assert.equal(gh.commits.length, 0);
  });
  test("image paths cannot point outside /assets", async () => {
    const { data, sha } = (await call("sales", "GET", "/api/data/promos")).body;
    data[0].image = "javascript:alert(1)";
    assert.equal((await call("sales", "PUT", "/api/data/promos", { data, sha })).status, 400);
  });
});

describe("articles", () => {
  test("unchanged article stays byte-identical", async () => {
    for (const slug of ["sell-more-on-live", "boost-budget-new-page", "caption-that-gets-messages", "page-restricted-what-to-do"]) {
      const path = `content/articles/${slug}.md`;
      const before = gh.text(path);
      const a = (await call("writer", "GET", `/api/articles/${slug}`)).body;
      assert.equal((await call("writer", "PUT", `/api/articles/${slug}`, { data: a.data, body: a.body, sha: a.sha })).status, 200);
      // Files written by the panel keep their exact bytes; ones written in another YAML style keep the same content.
      if (before.includes('title: "')) assert.equal(gh.text(path), before, slug);
      else {
        const { parseArticle } = await import("../src/content.js");
        assert.deepEqual(parseArticle(gh.text(path)), parseArticle(before), slug);
      }
    }
  });
  test("new article, then a second create with the same slug is refused", async () => {
    const data = { title: "តេស្ត", summary: "សង្ខេប", tag: "Boost Post", date: "2026-10-25", emoji: "📣", draft: true };
    const r = await call("writer", "PUT", "/api/articles/test-article", { data, body: "## ចំណងជើង\n\nអត្ថបទ", sha: null });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const text = gh.text("content/articles/test-article.md");
    assert.match(text, /^---\ntitle: "តេស្ត"\nslug: "test-article"\n/);
    assert.match(text, /\ndate: 2026-10-25\n/);
    assert.match(text, /\ndraft: true\n---\n## ចំណងជើង/);
    assert.equal((await call("writer", "PUT", "/api/articles/test-article", { data, body: "x", sha: null })).status, 409);
  });
  test("auto-publisher's hidden fields are kept on edit", async () => {
    const path = "content/articles/auto-one.md";
    gh.files.set(path, Buffer.from('---\ntitle: "A"\nslug: "auto-one"\nsummary: "S"\ntag: "Boost Post"\ndate: 2026-10-25\nemoji: "📣"\ncover: ""\ncategory: "facebook-ads"\nimage_prompt: "line1\\nline2"\nsource: "autopost"\ngenerated_at: "2026-10-25T07:01:00+07:00"\n---\nBody\n'));
    const a = (await call("writer", "GET", "/api/articles/auto-one")).body;
    a.data.title = "B";
    assert.equal((await call("writer", "PUT", "/api/articles/auto-one", { data: a.data, body: a.body, sha: a.sha })).status, 200);
    const t = gh.text(path);
    assert.match(t, /title: "B"/); assert.match(t, /category: "facebook-ads"/); assert.match(t, /image_prompt: "line1\\nline2"/); assert.match(t, /source: "autopost"/);
  });
  test("slug with path tricks is refused", async () => {
    assert.equal((await call("writer", "GET", "/api/articles/..%2Fservices")).status, 400);
    assert.equal((await call("writer", "PUT", "/api/articles/Bad_Slug", { data: {}, body: "", sha: null })).status, 400);
  });
  test("list shows titles and newest first", async () => {
    const r = (await call("viewer", "GET", "/api/articles")).body;
    assert.equal(r.pending, 0);
    assert.ok(r.items.length >= 4);
    assert.ok(r.items.every(i => i.title && i.date));
    assert.ok(r.items[0].date >= r.items.at(-1).date);
  });
});

describe("team", () => {
  test("owner cannot be removed or demoted, bad input refused", async () => {
    const r = await call("owner", "PUT", "/api/team", { members: [{ email: OWNER, role: "viewer" }, { email: "a@b.co", role: "sales" }] });
    assert.equal(r.status, 200);
    assert.equal(r.body.members[0].email, OWNER); assert.equal(r.body.members[0].role, "owner");
    assert.equal((await call("owner", "PUT", "/api/team", { members: [{ email: "c@d.co", role: "owner" }] })).status, 400);
    assert.equal((await call("owner", "PUT", "/api/team", { members: [{ email: "not-an-email", role: "sales" }] })).status, 400);
    assert.equal((await call("owner", "PUT", "/api/team", { members: [{ email: "a@b.co", role: "sales" }, { email: "A@B.co", role: "admin" }] })).status, 400);
  });
  test("a member added by the owner can sign in with their role", async () => {
    await call("owner", "PUT", "/api/team", { members: [{ email: "new@x.co", role: "writer" }] });
    const cookie = (await makeSession(env, "new@x.co", "")).split(";")[0];
    const me = await call("writer", "GET", "/api/me", undefined, { cookie });
    assert.equal(me.body.role, "writer");
  });
  test("only the owner may switch Live / Dry run", async () => {
    await kv.put("team", JSON.stringify({ members: [{ email: EMAIL("admin"), role: "admin" }] }));
    const { data, sha } = (await call("admin", "GET", "/api/data/autopost")).body;
    data.mode = "dry_run";
    assert.equal((await call("admin", "PUT", "/api/data/autopost", { data, sha })).status, 403);
    assert.equal((await call("owner", "PUT", "/api/data/autopost", { data, sha })).status, 200);
    assert.equal(gh.json("content/autopost/settings.json").mode, "dry_run");
  });
});

describe("security fixes", () => {
  test("image paths with .. are refused", async () => {
    const { data, sha } = (await call("sales", "GET", "/api/data/promos")).body;
    data[0].image = "/assets/../../etc/x.png";
    assert.equal((await call("sales", "PUT", "/api/data/promos", { data, sha })).status, 400);
  });
  test("logout from another site is refused", async () => {
    const r = await worker.fetch(new Request(ORIGIN + "/auth/logout", { method: "POST", headers: { Origin: "https://evil.example" } }), env, {});
    assert.equal(r.status, 403);
    const ok = await worker.fetch(new Request(ORIGIN + "/auth/logout", { method: "POST", headers: { Origin: ORIGIN } }), env, {});
    assert.equal(ok.status, 200);
  });
});
