/* ADS BOX admin panel (browser side). Plain JS, no build step.
   Everything a person can see or change is checked again on the server. */
"use strict";

const RAW = "https://raw.githubusercontent.com/vannakadsbox/adsbox-agency-site/main";
const S = { me: null, dirty: false, uploads: [], urls: {}, page: null, state: {} };

// ---------- tiny helpers ----------
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "class") el.className = v;
    else if (k === "style") el.style.cssText = v;
    else if (k === "value") el.value = v;
    else if (k === "checked") el.checked = !!v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat(Infinity)) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
}
const $ = s => document.querySelector(s);
// replaceChildren() would print "null" for empty slots; skip them.
const put = (el, ...kids) => el.replaceChildren(...kids.flat(Infinity).filter(k => k != null && k !== false));
const clone = o => JSON.parse(JSON.stringify(o));
const fmtNum = n => String(Math.round(+n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const shortNum = n => { n = +n || 0; if (n >= 1e6) return (Math.round(n / 1e5) / 10 + "M").replace(".0M", "M"); if (n >= 1e3) return (Math.round(n / 100) / 10 + "K").replace(".0K", "K"); return String(n); };
const parseCount = s => { const m = /^([\d.,]+)\s*([KkMm]?)$/.exec(String(s || "").trim()); if (!m) return 0; const n = parseFloat(m[1].replace(/,/g, "")); return Math.round(n * ({ k: 1e3, m: 1e6 }[m[2].toLowerCase()] || 1)); };
const slugify = s => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function toast(msg, bad) {
  const t = $("#toast"); t.textContent = msg; t.className = "show" + (bad ? " bad" : "");
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.className = ""), bad ? 6000 : 2800);
}

async function api(method, path, body) {
  const r = await fetch(path, { method, credentials: "same-origin", headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await r.json(); } catch {}
  if (r.status === 401 && path !== "/api/me") { S.me = null; renderLogin(data && data.removed ? "removed" : "expired"); throw new Error("signed out"); }
  if (!r.ok) { const e = new Error((data && data.error) || `Error ${r.status}`); e.status = r.status; throw e; }
  return data;
}

const imgSrc = v => !v ? "" : v.startsWith("upload:") ? S.urls[v] : /^https?:/.test(v) ? v : RAW + (v.startsWith("/") ? v : "/" + v);

// ---------- unsaved changes ----------
function setDirty(d = true) {
  S.dirty = d;
  const bar = $(".savebar"); if (bar) bar.classList.toggle("show", d);
}
window.addEventListener("beforeunload", e => { if (S.dirty) { e.preventDefault(); e.returnValue = ""; } });

function saveBar(onSave, onUndo) {
  return h("div", { class: "savebar", role: "region", "aria-label": "Save" },
    h("span", { class: "msg" }, "✏️ មានការកែប្រែមិនទាន់ Save"),
    h("button", { class: "btn", type: "button", onclick: onUndo }, "↩️ បោះបង់"),
    h("button", { class: "btn green", type: "button", onclick: async e => {
      const b = e.currentTarget; b.disabled = true; b.textContent = "⏳ កំពុង Save…";
      try { await onSave(); setDirty(false); toast("✅ បាន Save · វេបសាយនឹងធ្វើបច្ចុប្បន្នភាពក្នុង ~2 នាទី"); }
      catch (err) { if (err.message !== "signed out") toast("⚠️ " + err.message, true); }
      finally { b.disabled = false; b.textContent = "💾 រក្សាទុក"; }
    } }, "💾 រក្សាទុក"));
}

// ---------- image uploads ----------
function readFile(file) {
  return new Promise((ok, bad) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(",")[1]); r.onerror = bad; r.readAsDataURL(file); });
}
async function addUpload(file) {
  if (!/\.(jpe?g|png|webp|gif)$/i.test(file.name)) { toast("⚠️ ប្រើតែរូប JPG, PNG, WEBP ឬ GIF", true); return null; }
  if (file.size > 5 * 1024 * 1024) { toast("⚠️ រូបធំពេក (អតិបរមា 5 MB)", true); return null; }
  const key = S.uploads.length;
  S.uploads.push({ key, name: file.name, b64: await readFile(file) });
  const ref = `upload:${key}`;
  S.urls[ref] = URL.createObjectURL(file);
  return ref;
}
function imagePicker({ label, value, onChange, square, disabled, hint }) {
  const id = "f" + Math.random().toString(36).slice(2);
  const wrap = h("div", { class: "field" });
  const draw = v => {
    put(wrap, 
      h("span", { class: "lbl" }, label),
      h("div", { class: "pick" + (square ? " square" : "") },
        v ? h("img", { src: imgSrc(v), alt: "", loading: "lazy" }) : h("span", { class: "ph", "aria-hidden": "true" }, "🖼️"),
        h("div", { class: "acts" },
          disabled ? h("span", { class: "muted" }, v ? "" : "គ្មានរូប") : [
            h("label", { class: "btn small", for: id }, v ? "🔄 ប្តូររូប" : "⬆️ ដាក់រូប"),
            h("input", { id, type: "file", accept: "image/jpeg,image/png,image/webp,image/gif", class: "sr", onchange: async e => { const f = e.target.files[0]; if (!f) return; const ref = await addUpload(f); if (ref) { onChange(ref); draw(ref); setDirty(); } } }),
            v ? h("button", { class: "btn small danger", type: "button", onclick: () => { onChange(""); draw(""); setDirty(); } }, "✖ ដកចេញ") : null,
          ])),
      hint ? h("span", { class: "hint" }, hint) : null);
  };
  draw(value);
  return wrap;
}

// ---------- form fields bound to an object ----------
function field(obj, key, label, { type = "text", hint, disabled, placeholder, rows, options, onInput, required, pattern } = {}) {
  const id = "f" + Math.random().toString(36).slice(2);
  let input;
  const set = v => { obj[key] = v; setDirty(); onInput && onInput(v); };
  if (type === "textarea") input = h("textarea", { id, class: "input", rows: rows || 3, disabled, placeholder, oninput: e => set(e.target.value) }, obj[key] ?? "");
  else if (type === "select") input = h("select", { id, class: "input", disabled, onchange: e => set(e.target.value) }, options.map(o => h("option", { value: o.value ?? o, selected: (o.value ?? o) === obj[key] }, o.label ?? o)));
  else if (type === "number") input = h("input", { id, class: "input num", type: "number", inputmode: "decimal", value: obj[key] ?? "", disabled, oninput: e => set(e.target.value === "" ? "" : Number(e.target.value)) });
  else input = h("input", { id, class: "input", type, value: obj[key] ?? "", disabled, placeholder, required, pattern, oninput: e => set(e.target.value) });
  return h("div", { class: "field" }, h("label", { for: id }, label), input, hint ? h("span", { class: "hint" }, hint) : null);
}
function check(obj, key, label, { disabled, onInput } = {}) {
  return h("label", { class: "check" }, h("input", { type: "checkbox", checked: !!obj[key], disabled, onchange: e => { obj[key] = e.target.checked; setDirty(); onInput && onInput(e.target.checked); } }), label);
}
function sw(checked, label, onChange, disabled) {
  return h("label", { class: "check" }, h("span", { class: "switch" }, h("input", { type: "checkbox", role: "switch", checked, disabled, onchange: e => onChange(e.target.checked) }), h("span")), label);
}
function move(arr, i, d) { const j = i + d; if (j < 0 || j >= arr.length) return false; [arr[i], arr[j]] = [arr[j], arr[i]]; setDirty(); return true; }

// ---------- navigation ----------
const NAV = [
  { title: "ទូទៅ", items: [{ id: "dashboard", e: "🏠", km: "ផ្ទាំងគ្រប់គ្រង", tint: "rgba(63,125,255,.25)" }] },
  { title: "🛒 លក់ និងតម្លៃ", items: [
    { id: "services", e: "🛍️", km: "សេវាកម្ម និងតម្លៃ", tint: "rgba(0,89,224,.3)", desc: "ឈ្មោះ តម្លៃ រូប និងប៉ូស្ទ័រ" },
    { id: "accounts", e: "📘", km: "លក់ផេក & TikTok", tint: "rgba(108,92,255,.32)", desc: "ដាក់ Link · Follower និងតម្លៃស្វ័យប្រវត្តិ" },
    { id: "promos", e: "🎁", km: "ការផ្តល់ជូនពិសេស", tint: "rgba(200,53,94,.32)", desc: "Pop-up ពេលបើកវេបសាយ" }] },
  { title: "🏡 ទំព័រដើម", items: [{ id: "clients", e: "⭐", km: "ផេកអតិថិជន", tint: "rgba(60,207,142,.28)", desc: "ដាក់ Link ផេក · ឈ្មោះ និង Follower ស្វ័យប្រវត្តិ" }] },
  { title: "📚 ចំណេះដឹង", items: [
    { id: "articles", e: "📝", km: "អត្ថបទ", tint: "rgba(245,158,11,.3)", desc: "សរសេរ កែ ឬលាក់អត្ថបទ" },
    { id: "autopost", e: "🤖", km: "បោះពុម្ពស្វ័យប្រវត្តិ", tint: "rgba(108,92,255,.32)", desc: "ម៉ោង Live/Dry run និងប្រវត្តិ" }] },
  { title: "⚙️ ការកំណត់", items: [{ id: "team", e: "👥", km: "ក្រុមការងារ និងតួនាទី", tint: "rgba(245,158,11,.3)", desc: "អញ្ជើញ និងផ្តល់សិទ្ធិ" }] },
];
const ALL = NAV.flatMap(g => g.items);
const perm = id => id === "dashboard" ? "E" : id === "autopost" ? (S.me.perms.autopost !== "N" ? S.me.perms.autopost : S.me.perms.history) : S.me.perms[id] || "N";

function routeInfo() {
  const [page, sub] = location.hash.replace(/^#\/?/, "").split("/");
  return { page: page || "dashboard", sub: sub ? decodeURIComponent(sub) : "" };
}
let lastHash = location.hash;
window.addEventListener("hashchange", () => {
  if (S.dirty && !confirm("មានការកែប្រែមិនទាន់ Save។ ចាកចេញដោយមិន Save?")) { history.replaceState(null, "", lastHash || "#/"); return; }
  lastHash = location.hash; setDirty(false); S.uploads = []; render();
});

function sidebar(active) {
  const nav = h("nav", { class: "nav", "aria-label": "Admin" }, NAV.map(g => {
    const items = g.items.filter(i => perm(i.id) !== "N");
    if (!items.length) return null;
    return h("div", { class: "nav-group" }, h("div", { class: "nav-title" }, g.title), items.map(i =>
      h("a", { href: `#/${i.id}`, "aria-current": active === i.id ? "page" : null, onclick: () => $(".side").classList.remove("open") },
        h("span", { class: "ico", style: `background:${i.tint}` }, i.e), i.km, perm(i.id) === "V" ? h("span", { class: "lock", title: "មើលបាន មិនអាចកែ" }, "👀") : null)));
  }));
  const r = S.me.roleInfo;
  return h("aside", { class: "side" },
    h("div", { class: "brand" }, h("img", { src: "/logo-word-white.png", alt: "ADS BOX", width: 129, height: 24 }), h("span", { class: "badge-admin" }, "Admin")),
    nav,
    h("div", { class: "me" }, h("span", { class: "avatar", "aria-hidden": "true" }, (S.me.name || S.me.email).charAt(0).toUpperCase()),
      h("div", { class: "who" }, h("b", {}, S.me.name || S.me.email), h("span", {}, `${r.emoji} ${r.km}`)),
      h("button", { type: "button", onclick: logout }, "ចេញ")));
}

async function logout() {
  if (S.dirty && !confirm("មានការកែប្រែមិនទាន់ Save។ ចេញដោយមិន Save?")) return;
  setDirty(false);
  await fetch("/auth/logout", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin" });
  location.href = "/";
}

function header(item, extra) {
  const ro = perm(item.id) === "V";
  return h("header", { class: "head" },
    h("div", { class: "grow" },
      h("div", { class: "crumb" }, h("a", { href: "#/" }, "🏠 ផ្ទាំងគ្រប់គ្រង"), item.id !== "dashboard" ? ` › ${item.e} ${item.km}` : ""),
      h("h1", {}, `${item.e} ${item.km}`)),
    ro ? h("span", { class: "ro-note" }, "👀 មើលបានប៉ុណ្ណោះ") : null,
    extra || null);
}

async function render() {
  const { page, sub } = routeInfo();
  const item = ALL.find(i => i.id === page) || ALL[0];
  const app = $("#app");
  const main = h("main", { class: "page", id: "main" }, h("div", { class: "boot", style: "min-height:40vh" }, "⏳ កំពុងផ្ទុក…"));
  put(app, 
    h("a", { href: "#main", class: "sr" }, "Skip to content"),
    h("div", { class: "shell" },
      h("div", { class: "topbar" }, h("button", { type: "button", "aria-label": "Menu", onclick: () => $(".side").classList.toggle("open") }, "☰"), h("img", { src: "/logo-word-white.png", alt: "ADS BOX", width: 108, height: 20 })),
      sidebar(item.id), main));
  document.title = `${item.km} · ADS BOX Admin`;
  if (perm(item.id) === "N") { put(main, header(item), h("div", { class: "empty" }, "🔒 តួនាទីរបស់អ្នកមិនអាចបើកផ្នែកនេះទេ។")); return; }
  try {
    const body = await PAGES[item.id](item, sub);
    put(main, ...[].concat(body));
  } catch (e) {
    if (e.message === "signed out") return;
    put(main, header(item), h("div", { class: "alert" }, "⚠️ " + e.message), h("button", { class: "btn", type: "button", onclick: render }, "🔄 ព្យាយាមម្តងទៀត"));
    // Owner sees the GitHub connection check right here, to help fix setup problems.
    if (S.me.role === "owner" && e.status === 502) {
      try { const d = await api("GET", "/api/diag"); main.append(h("details", { class: "card", open: true }, h("summary", { style: "font-weight:700;cursor:pointer" }, "🔧 ការពិនិត្យ GitHub (សម្រាប់ម្ចាស់)"), h("pre", { style: "white-space:pre-wrap;font-size:13px;margin:10px 0 0" }, JSON.stringify(d, null, 2)))); } catch {}
    }
  }
}

// ---------- login ----------
const LOGIN_ERRORS = {
  not_member: "អ៊ីមែលនេះមិនទាន់ជាសមាជិកទេ។ សូមស្នើម្ចាស់ឲ្យបន្ថែមអ្នកនៅក្នុង «ក្រុមការងារ និងតួនាទី»។",
  bad_state: "ការចូលអស់ពេល។ សូមចុចម្តងទៀត។",
  email_not_verified: "អ៊ីមែល Google នេះមិនទាន់បានផ្ទៀងផ្ទាត់។",
  google_refused: "Google មិនអនុញ្ញាត។ សូមព្យាយាមម្តងទៀត។",
  bad_token: "ការចូលមិនត្រឹមត្រូវ។ សូមព្យាយាមម្តងទៀត។",
  removed: "គណនីរបស់អ្នកត្រូវបានដកចេញពីក្រុម។",
  expired: "សូមចូលគណនីម្តងទៀត។",
};
function renderLogin(reason) {
  const q = new URLSearchParams(location.search);
  const err = reason || q.get("error");
  const email = q.get("email");
  document.title = "ចូល · ADS BOX Admin";
  put($("#app"), h("main", { class: "login" }, h("div", { class: "box" },
    h("img", { src: "/logo-mark.png", alt: "ADS BOX", width: 64, height: 66 }),
    h("h1", {}, "ADS BOX Admin"),
    h("p", { class: "muted", style: "margin:0" }, "គ្រប់គ្រងវេបសាយ adsbox.agency"),
    err ? h("div", { class: "alert" + (err === "expired" ? " info" : "") }, "⚠️ ", LOGIN_ERRORS[err] || "មានបញ្ហា សូមព្យាយាមម្តងទៀត។", email ? h("div", { class: "num", style: "margin-top:4px;font-size:13px" }, email) : null) : null,
    h("a", { class: "gbtn", href: "/auth/login" },
      h("span", { class: "g", "aria-hidden": "true", style: "display:inline-flex" }),
      "ចូលដោយ Google"),
    h("p", { class: "muted", style: "margin:0;font-size:13px" }, "🔒 មានតែសមាជិកដែលម្ចាស់បានអញ្ជើញប៉ុណ្ណោះ"))));
  $(".gbtn .g").innerHTML = '<svg width="20" height="20" viewBox="0 0 48 48">' + '<path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.3-.4-3.5z"/></svg>';
  if (q.has("error")) history.replaceState(null, "", "/" + location.hash);
}

// ================= PAGES =================
const PAGES = {};

// ---------- dashboard ----------
PAGES.dashboard = async item => {
  const p = S.me.perms;
  const want = { services: p.services !== "N", accounts: p.accounts !== "N", articles: true, autopost: p.autopost !== "N" };
  const [sv, ac, ar, au, act] = await Promise.all([
    want.services ? api("GET", "/api/data/services").catch(() => null) : null,
    want.accounts ? api("GET", "/api/data/accounts").catch(() => null) : null,
    api("GET", "/api/articles").catch(() => null),
    want.autopost ? api("GET", "/api/data/autopost").catch(() => null) : null,
    api("GET", "/api/activity").catch(() => ({ commits: [] })),
  ]);
  const tiles = [];
  if (sv) tiles.push(h("a", { class: "tile t1", href: "#/services" }, h("span", { class: "e" }, "🛍️"), h("b", { class: "num" }, sv.data.groups.reduce((n, g) => n + g.services.length, 0)), h("span", {}, `សេវាកម្ម · ${sv.data.groups.length} ក្រុម`)));
  if (ac) {
    const items = [...ac.data.facebook.items, ...ac.data.tiktok.items];
    const cache = Object.values(ac.cache || {});
    const fol = items.reduce((n, it) => n + (parseCount(it.followers) || (cache.find(c => c.url === it.url) || {}).followers || 0), 0);
    tiles.push(h("a", { class: "tile t2", href: "#/accounts" }, h("span", { class: "e" }, "📘"), h("b", { class: "num" }, items.filter(i => i.status !== "sold").length), h("span", {}, `ផេក/អាខោនកំពុងលក់ · ${shortNum(fol)} Follower`)));
  }
  if (ar) tiles.push(h("a", { class: "tile t3", href: "#/articles" }, h("span", { class: "e" }, "📝"), h("b", { class: "num" }, ar.items.filter(a => !a.draft).length), h("span", {}, `អត្ថបទលើវេបសាយ${ar.items.some(a => a.draft) ? ` · ${ar.items.filter(a => a.draft).length} ព្រាង` : ""}`)));
  if (au) tiles.push(h("a", { class: "tile t4", href: "#/autopost" }, h("span", { class: "e" }, "🤖"), h("b", {}, !au.data.enabled ? "⏸️ ផ្អាក" : au.data.mode === "live" ? "🚀 Live" : "🧪 Dry run"), h("span", {}, `ម៉ោង ${au.data.morning.time} និង ${au.data.evening.time}`)));
  const mods = ALL.filter(i => i.id !== "dashboard" && perm(i.id) !== "N").map(i =>
    h("a", { class: "mod", href: `#/${i.id}` }, h("span", { class: "ico", style: `background:${i.tint.replace(/[\d.]+\)$/, ".18)")}` }, i.e), h("div", {}, h("b", {}, i.km), h("span", {}, perm(i.id) === "E" ? i.desc : "👀 មើលបានប៉ុណ្ណោះ"))));
  const r = S.me.roleInfo;
  return [
    header(item, h("a", { class: "btn", href: S.me.site, target: "_blank", rel: "noopener" }, "🌐 មើលវេបសាយ")),
    h("p", { style: "margin:-6px 0 0" }, `សួស្តី ${S.me.name || ""} 👋 · តួនាទី `, h("span", { class: "pill violet" }, `${r.emoji} ${r.km}`)),
    tiles.length ? h("div", { class: "tiles" }, tiles) : null,
    h("section", { class: "card" }, h("h2", {}, "🧩 អ្វីដែលអ្នកអាចគ្រប់គ្រង"), h("div", { class: "mods" }, mods)),
    h("section", { class: "card" }, h("h2", {}, "🕘 ការកែប្រែចុងក្រោយ"),
      act.commits.length ? h("div", { class: "list" }, act.commits.slice(0, 8).map(c => h("div", { class: "item" },
        h("span", { "aria-hidden": "true" }, /autopost|article/i.test(c.message) ? "📝" : /^Admin/.test(c.message) ? "✏️" : "⚙️"),
        h("div", { class: "txt" }, h("b", {}, c.message.replace(/^Admin \(([^)]*)\): /, "")), h("span", {}, (c.message.match(/^Admin \(([^)]*)\)/) || [, "ប្រព័ន្ធ"])[1] + " · " + new Date(c.date).toLocaleString("km-KH", { dateStyle: "medium", timeStyle: "short" })))))) : h("p", { class: "muted" }, "មិនទាន់មាន")),
  ];
};

// ---------- services ----------
PAGES.services = async item => {
  const res = await api("GET", "/api/data/services");
  const edit = perm("services") === "E";
  let data = clone(res.data), sha = res.sha;
  const st = S.state.services || (S.state.services = { g: 0, s: 0 });
  const wrap = h("div", { class: "stack" });
  const GE = ["🚀", "🎨", "🛡️", "🎥", "📦", "💡", "🧰", "📣"];

  function draw() {
    st.g = Math.min(st.g, Math.max(0, data.groups.length - 1));
    const g = data.groups[st.g];
    if (g) st.s = Math.min(st.s, Math.max(0, g.services.length - 1));
    const tabs = h("div", { class: "tabs", role: "group", "aria-label": "ក្រុម" }, data.groups.map((gr, i) =>
      h("button", { class: "tab", type: "button", "aria-pressed": String(i === st.g), onclick: () => { st.g = i; st.s = 0; draw(); } }, `${GE[i % GE.length]} ${gr.name} · ${gr.services.length}`)),
      edit ? h("button", { class: "tab", type: "button", onclick: () => { data.groups.push({ id: "group-" + (data.groups.length + 1), name: "ក្រុមថ្មី", services: [] }); st.g = data.groups.length - 1; setDirty(); draw(); } }, "➕ ក្រុមថ្មី") : null);
    if (!g) { put(wrap, tabs, h("div", { class: "empty" }, "មិនទាន់មានក្រុម")); return; }
    const s = g.services[st.s];

    const list = h("section", { class: "card main", "aria-label": "សេវាកម្ម" },
      h("div", { class: "head", style: "margin-bottom:8px" },
        h("h2", { class: "grow", style: "margin:0" }, `${GE[st.g % GE.length]} ${g.name}`),
        edit ? h("button", { class: "btn small primary", type: "button", onclick: () => { g.services.push({ id: slugify(g.id + "-new-" + (g.services.length + 1)), name: "សេវាកម្មថ្មី", desc: "", emoji: "📣 💬 📈", price: "", popular: false }); st.s = g.services.length - 1; setDirty(); draw(); } }, "➕ បន្ថែមសេវាកម្ម") : null),
      g.services.length ? h("div", { class: "list" }, g.services.map((sv, i) => h("div", { class: "item" + (i === st.s ? " sel" : "") },
        h("span", { class: "thumb" }, sv.thumb ? h("img", { src: imgSrc(sv.thumb), alt: "" }) : (sv.emoji || "📣").split(" ")[0]),
        h("div", { class: "txt" }, h("b", {}, sv.name), h("span", {}, sv.price || "សួរតម្លៃ")),
        sv.popular ? h("span", { class: "pill hot" }, "🔥 ពេញនិយម") : null,
        h("div", { class: "ctl" },
          edit ? h("button", { class: "btn small icon mv", type: "button", "aria-label": "ឡើងលើ", disabled: i === 0, onclick: () => { if (move(g.services, i, -1)) { st.s = i - 1; draw(); } } }, "↑") : null,
          edit ? h("button", { class: "btn small icon mv", type: "button", "aria-label": "ចុះក្រោម", disabled: i === g.services.length - 1, onclick: () => { if (move(g.services, i, 1)) { st.s = i + 1; draw(); } } }, "↓") : null,
          h("button", { class: "btn small", type: "button", "aria-label": `${edit ? "កែ" : "មើល"} ${sv.name}`, onclick: () => { st.s = i; draw(); } }, edit ? "✏️ កែ" : "👀")))))
        : h("div", { class: "empty" }, "ក្រុមនេះមិនទាន់មានសេវាកម្ម"),
      h("p", { class: "hint muted", style: "margin:10px 4px 0;font-size:13px" }, "💡 វេបសាយបង្ហាញ ៤ ដំបូង ហើយនៅសល់នៅក្រោមប៊ូតុង «មើលបន្ថែម»។"),
      edit ? h("details", { style: "margin-top:12px" }, h("summary", { style: "cursor:pointer;font-weight:600" }, "⚙️ ការកំណត់ក្រុម"),
        h("div", { class: "stack", style: "margin-top:10px" },
          field(g, "name", "ឈ្មោះក្រុម", { onInput: () => (tabs.querySelector('[aria-pressed="true"]').textContent = `${GE[st.g % GE.length]} ${g.name} · ${g.services.length}`) }),
          h("div", { class: "row" },
            h("button", { class: "btn small", type: "button", disabled: st.g === 0, onclick: () => { if (move(data.groups, st.g, -1)) { st.g--; draw(); } } }, "← ផ្លាស់ក្រុមទៅមុខ"),
            h("button", { class: "btn small", type: "button", disabled: st.g === data.groups.length - 1, onclick: () => { if (move(data.groups, st.g, 1)) { st.g++; draw(); } } }, "ផ្លាស់ក្រុមទៅក្រោយ →"),
            h("button", { class: "btn small danger", type: "button", disabled: g.services.length > 0, title: g.services.length ? "ដកសេវាកម្មចេញសិន" : "", onclick: () => { data.groups.splice(st.g, 1); st.g = 0; setDirty(); draw(); } }, "🗑️ លុបក្រុម (ទទេ)")))) : null);

    const panel = s ? h("section", { class: "card aside stack", "aria-label": "កែសេវាកម្ម", style: "box-shadow:0 16px 40px rgba(10,30,80,.08)" },
      h("h2", { style: "margin:0" }, edit ? "✏️ កែសេវាកម្ម" : "👀 សេវាកម្ម"),
      field(s, "name", "ឈ្មោះសេវាកម្ម", { disabled: !edit, onInput: () => draw.soon() }),
      field(s, "desc", "ការពិពណ៌នា", { type: "textarea", disabled: !edit }),
      h("div", { class: "grid2" },
        field(s, "price", "💲 តម្លៃ", { disabled: !edit, placeholder: "$79 / ខែ", hint: "ទុកទទេ = «សួរតម្លៃ»", onInput: () => draw.soon() }),
        field(s, "emoji", "😀 Emoji លើរូបកាត", { disabled: !edit, hint: "Emoji ៣ ដកឃ្លា" })),
      h("div", { class: "grid2" },
        imagePicker({ label: "🖼️ រូបលើកាត", value: s.thumb, disabled: !edit, onChange: v => { s.thumb = v; draw.soon(); }, hint: "16:9 · 1280×720 · ទុកទទេ = រូបស្វ័យប្រវត្តិ" }),
        imagePicker({ label: "🪧 ប៉ូស្ទ័រ «លម្អិត»", value: s.poster, disabled: !edit, onChange: v => (s.poster = v) })),
      check(s, "popular", "🔥 បង្ហាញស្លាក «ពេញនិយម»", { disabled: !edit, onInput: () => draw.soon() }),
      edit ? h("details", {}, h("summary", { style: "cursor:pointer;font-weight:600" }, "⚙️ កម្រិតខ្ពស់"),
        h("div", { class: "stack", style: "margin-top:10px" },
          field(s, "id", "លេខកូដ (អក្សរឡាតាំង)", { hint: "ឧ. boost-post · ប្រើអក្សរតូច លេខ និង - ប៉ុណ្ណោះ" }),
          data.groups.length > 1 ? h("div", { class: "field" }, h("label", { for: "mvg" }, "📂 ផ្លាស់ទៅក្រុម"),
            h("select", { id: "mvg", class: "input", onchange: e => { const to = +e.target.value; if (to === st.g) return; g.services.splice(st.s, 1); data.groups[to].services.push(s); st.g = to; st.s = data.groups[to].services.length - 1; setDirty(); draw(); } },
              data.groups.map((gr, i) => h("option", { value: i, selected: i === st.g }, gr.name)))) : null)) : null,
      edit ? h("button", { class: "btn danger", type: "button", onclick: () => { if (!confirm(`លុប «${s.name}»?`)) return; g.services.splice(st.s, 1); st.s = Math.max(0, st.s - 1); setDirty(); draw(); } }, "🗑️ លុបសេវាកម្មនេះ") : null)
      : h("section", { class: "card aside" }, h("p", { class: "muted" }, "ជ្រើសសេវាកម្មមួយ"));
    put(wrap, tabs, h("div", { class: "row" }, list, panel));
  }
  // Redrawing while typing would steal focus; only refresh the list rows instead.
  draw.soon = () => { const g = data.groups[st.g]; const rows = wrap.querySelectorAll(".list .item"); const sv = g && g.services[st.s]; const row = rows[st.s]; if (!row || !sv) return;
    row.querySelector(".txt b").textContent = sv.name; row.querySelector(".txt span").textContent = sv.price || "សួរតម្លៃ";
    const th = row.querySelector(".thumb"); put(th, sv.thumb ? h("img", { src: imgSrc(sv.thumb), alt: "" }) : (sv.emoji || "📣").split(" ")[0]);
    const pop = row.querySelector(".pill.hot"); if (sv.popular && !pop) row.querySelector(".ctl").before(h("span", { class: "pill hot" }, "🔥 ពេញនិយម")); else if (!sv.popular && pop) pop.remove(); };
  draw();
  const save = async () => { const r = await api("PUT", "/api/data/services", { data, sha, uploads: S.uploads }); sha = r.sha; data = r.data; S.uploads = []; draw(); };
  return [header(item), wrap, edit ? saveBar(save, () => { data = clone(res.data); S.uploads = []; setDirty(false); draw(); }) : null];
};

// ---------- accounts for sale ----------
PAGES.accounts = async item => {
  const res = await api("GET", "/api/data/accounts");
  const edit = perm("accounts") === "E";
  let data = clone(res.data), sha = res.sha;
  const cache = Object.values(res.cache || {});
  const st = S.state.accounts || (S.state.accounts = { p: "facebook" });
  const wrap = h("div", { class: "stack" });
  const RE = { facebook: /^https:\/\/(www\.|m\.)?facebook\.com\/.+/, tiktok: /^https:\/\/(www\.)?tiktok\.com\/@.+/ };

  function draw() {
    const side = data[st.p];
    const rate = +side.price_per_1k || 0;
    const tabs = h("div", { class: "tabs", role: "group", "aria-label": "Platform" },
      [["facebook", "📘 Facebook"], ["tiktok", "🎵 TikTok"]].map(([k, l]) => h("button", { class: "tab", type: "button", "aria-pressed": String(st.p === k), onclick: () => { st.p = k; draw(); } }, `${l} · ${data[k].items.length}`)));
    const linkIn = h("input", { class: "input", type: "url", id: "newlink", placeholder: st.p === "facebook" ? "https://www.facebook.com/…" : "https://www.tiktok.com/@…", style: "flex:1 1 280px" });
    const add = h("form", { class: "hero-add", onsubmit: e => {
      e.preventDefault();
      const url = linkIn.value.trim();
      if (!RE[st.p].test(url)) { toast(st.p === "facebook" ? "⚠️ Link ត្រូវចាប់ផ្តើមដោយ https://www.facebook.com/" : "⚠️ Link ត្រូវចាប់ផ្តើមដោយ https://www.tiktok.com/@", true); linkIn.focus(); return; }
      if (side.items.some(i => i.url === url)) { toast("⚠️ Link នេះមានរួចហើយ", true); return; }
      side.items.unshift(st.p === "facebook" ? { url, type: "ផេកខ្មែរ", status: "available", cover: "", name: "", followers: "" } : { url, status: "available", cover: "", name: "", followers: "" });
      setDirty(); draw(); toast("➕ បានបន្ថែម · ចុច «រក្សាទុក»");
    } },
      h("h2", {}, "🔗 បិទភ្ជាប់ Link — ប្រព័ន្ធអានព័ត៌មានដោយស្វ័យប្រវត្តិ"),
      h("div", { class: "row", style: "gap:8px" }, h("label", { class: "sr", for: "newlink" }, "Link"), linkIn, h("button", { class: "btn green", type: "submit" }, "✨ បន្ថែម")),
      h("span", { class: "hint" }, "ក្រោយ Save ប្រហែល 2 នាទី រូប ឈ្មោះ និង Follower នឹងបង្ហាញ ហើយធ្វើបច្ចុប្បន្នភាពរៀងរាល់ថ្ងៃ។"));

    const cards = side.items.map((it, i) => {
      const c = cache.find(x => x.url === it.url) || {};
      const name = it.name || c.name || "(កំពុងអាន…)";
      const fol = parseCount(it.followers) || c.followers || 0;
      const pic = c.picture ? imgSrc(c.picture) : "";
      const cover = it.cover ? imgSrc(it.cover) : c.cover ? imgSrc(c.cover) : "";
      return h("article", { class: "acc" },
        h("div", { class: "cv" }, cover ? h("img", { src: cover, alt: "", loading: "lazy" }) : null),
        h("div", { class: "bd" },
          h("div", { style: "display:flex;align-items:flex-end;gap:8px" },
            h("span", { class: "pic" }, pic ? h("img", { src: pic, alt: "", loading: "lazy" }) : name.charAt(0)),
            h("span", { class: "pill " + (it.status === "sold" ? "hot" : "ok"), style: "margin-left:auto" }, it.status === "sold" ? "🔴 លក់រួច" : "🟢 នៅលក់")),
          h("b", { style: "font-size:15.5px" }, name),
          h("a", { href: it.url, target: "_blank", rel: "noopener", style: "font-size:12.5px;word-break:break-all" }, it.url.replace(/^https:\/\/(www\.)?/, "")),
          h("div", { class: "stat2" },
            h("div", { style: "background:#f1f5ff" }, h("small", {}, "👥 Follower"), h("b", {}, fol ? shortNum(fol) : "—")),
            h("div", { style: "background:#eafaf2" }, h("small", {}, "💰 តម្លៃ"), h("b", { style: "color:var(--ok)" }, rate && fol ? "$" + fmtNum(Math.round(fol / 1000 * rate)) : "សួរ"))),
          edit ? h("details", {}, h("summary", { style: "cursor:pointer;font-weight:600;font-size:14px" }, "✏️ កែ"),
            h("div", { class: "stack", style: "margin-top:8px" },
              field(it, "status", "ស្ថានភាព", { type: "select", options: [{ value: "available", label: "🟢 នៅលក់" }, { value: "sold", label: "🔴 លក់រួច" }], onInput: draw }),
              st.p === "facebook" ? field(it, "type", "ប្រភេទ", { type: "select", options: ["ផេកខ្មែរ", "ផេកប៊ូសឡាយ"] }) : null,
              field(it, "name", "ឈ្មោះ (ស្រេចចិត្ត)", { hint: c.name ? `ទុកទទេ = «${c.name}»` : "ទុកទទេ = ឈ្មោះស្វ័យប្រវត្តិ" }),
              field(it, "followers", "Follower (ស្រេចចិត្ត)", { hint: c.followers ? `ទុកទទេ = ${fmtNum(c.followers)}` : "ឧ. 10.4K" }),
              imagePicker({ label: "Cover (ស្រេចចិត្ត)", value: it.cover, onChange: v => (it.cover = v) }),
              h("div", { class: "row", style: "gap:6px" },
                h("button", { class: "btn small", type: "button", disabled: i === 0, onclick: () => { move(side.items, i, -1); draw(); } }, "← មុន"),
                h("button", { class: "btn small", type: "button", disabled: i === side.items.length - 1, onclick: () => { move(side.items, i, 1); draw(); } }, "ក្រោយ →"),
                h("button", { class: "btn small danger", type: "button", onclick: () => { if (!confirm(`ដក «${name}» ចេញ?`)) return; side.items.splice(i, 1); setDirty(); draw(); } }, "🗑️ ដកចេញ")))) : h("span", { class: "pill" + (it.type === "ផេកប៊ូសឡាយ" ? " violet" : "") }, it.type || "TikTok")));
    });

    const settings = h("section", { class: "card stack" },
      h("h2", { style: "margin:0" }, "🧮 តម្លៃ និងឈ្មោះផ្ទាំង"),
      field(side, "price_per_1k", "តម្លៃក្នុង 1,000 Follower ($)", { type: "number", disabled: !edit, hint: "ដាក់ 0 = «សូមទាក់ទងសម្រាប់តម្លៃ»", onInput: () => draw.soon() }),
      field(side, "title", "ឈ្មោះផ្ទាំងលើវេបសាយ", { disabled: !edit }),
      h("p", { class: "muted", style: "margin:0;font-size:13.5px" }, "ឧ. 10.4K Follower × $", h("span", { class: "rate num" }, rate || 0), " = ", h("b", { class: "ex num", style: "color:var(--ok)" }, "$" + fmtNum(Math.round(10.4 * rate)))));

    put(wrap, tabs, edit ? add : null, h("div", { class: "row" },
      h("section", { class: "main" }, side.items.length ? h("div", { class: "grid" }, cards) : h("div", { class: "empty" }, "មិនទាន់មាន។ បិទភ្ជាប់ Link ខាងលើ ដើម្បីចាប់ផ្តើម។")),
      h("div", { class: "aside stack" }, settings)));
  }
  draw.soon = () => { const r = +data[st.p].price_per_1k || 0; const a = wrap.querySelector(".rate"), b = wrap.querySelector(".ex"); if (a) a.textContent = r; if (b) b.textContent = "$" + fmtNum(Math.round(10.4 * r)); };
  draw();
  const save = async () => { const r = await api("PUT", "/api/data/accounts", { data, sha, uploads: S.uploads }); sha = r.sha; data = r.data; S.uploads = []; draw(); };
  return [header(item), wrap, edit ? saveBar(save, () => { data = clone(res.data); S.uploads = []; setDirty(false); draw(); }) : null];
};

// ---------- promos ----------
PAGES.promos = async item => {
  const res = await api("GET", "/api/data/promos");
  const edit = perm("promos") === "E";
  let data = clone(res.data), sha = res.sha;
  const st = S.state.promos || (S.state.promos = { i: 0 });
  const wrap = h("div", { class: "row" });
  function draw() {
    st.i = Math.min(st.i, Math.max(0, data.length - 1));
    const p = data[st.i];
    const list = h("section", { class: "card main" },
      h("div", { class: "head", style: "margin-bottom:8px" }, h("h2", { class: "grow", style: "margin:0" }, "🎁 Pop-up"),
        edit ? h("button", { class: "btn small primary", type: "button", onclick: () => { data.push({ id: "promo-" + (data.length + 1), title: "ការផ្តល់ជូនថ្មី", price: "", badge: "ថ្មី", points: [], image: "", popup: true }); st.i = data.length - 1; setDirty(); draw(); } }, "➕ បន្ថែម") : null),
      data.length ? h("div", { class: "list" }, data.map((x, i) => h("div", { class: "item" + (i === st.i ? " sel" : "") },
        h("span", { class: "thumb", style: "width:48px;height:48px" }, x.image ? h("img", { src: imgSrc(x.image), alt: "" }) : "🎁"),
        h("div", { class: "txt" }, h("b", {}, x.title), h("span", {}, [x.price, x.badge].filter(Boolean).join(" · "))),
        h("span", { class: "pill " + (x.popup !== false ? "ok" : "grey") }, x.popup !== false ? "● បង្ហាញ" : "○ លាក់"),
        h("div", { class: "ctl" },
          edit ? h("button", { class: "btn small icon mv", type: "button", "aria-label": "ឡើងលើ", disabled: i === 0, onclick: () => { move(data, i, -1); st.i = i - 1; draw(); } }, "↑") : null,
          edit ? h("button", { class: "btn small icon mv", type: "button", "aria-label": "ចុះក្រោម", disabled: i === data.length - 1, onclick: () => { move(data, i, 1); st.i = i + 1; draw(); } }, "↓") : null,
          h("button", { class: "btn small", type: "button", onclick: () => { st.i = i; draw(); } }, edit ? "✏️ កែ" : "👀"))))) : h("div", { class: "empty" }, "មិនទាន់មាន Pop-up"));
    const panel = p ? h("section", { class: "card aside stack" },
      h("h2", { style: "margin:0" }, edit ? "✏️ កែ Pop-up" : "👀 Pop-up"),
      field(p, "title", "ចំណងជើង", { disabled: !edit }),
      h("div", { class: "grid2" }, field(p, "price", "💲 តម្លៃ", { disabled: !edit }), field(p, "badge", "🏷️ ស្លាក", { disabled: !edit, placeholder: "ថ្មី" })),
      (() => { const o = { v: (p.points || []).join("\n") }; return field(o, "v", "✅ ចំណុចពិសេស (មួយបន្ទាត់ មួយចំណុច)", { type: "textarea", rows: 6, disabled: !edit, onInput: v => (p.points = v.split("\n").map(s => s.trim()).filter(Boolean)) }); })(),
      imagePicker({ label: "🖼️ ប៉ូស្ទ័រ (រាងការ៉េ)", value: p.image, square: true, disabled: !edit, onChange: v => (p.image = v) }),
      check(p, "popup", "👁️ បង្ហាញក្នុង Pop-up", { disabled: !edit, onInput: () => draw() }),
      edit ? h("details", {}, h("summary", { style: "cursor:pointer;font-weight:600" }, "⚙️ កម្រិតខ្ពស់"), h("div", { style: "margin-top:10px" }, field(p, "id", "លេខកូដ (អក្សរឡាតាំង)"))) : null,
      edit ? h("button", { class: "btn danger", type: "button", onclick: () => { if (!confirm(`លុប «${p.title}»?`)) return; data.splice(st.i, 1); st.i = 0; setDirty(); draw(); } }, "🗑️ លុប") : null) : null;
    put(wrap, list, panel || h("div"));
  }
  draw();
  const save = async () => { const r = await api("PUT", "/api/data/promos", { data, sha, uploads: S.uploads }); sha = r.sha; data = r.data; S.uploads = []; draw(); };
  return [header(item), wrap, edit ? saveBar(save, () => { data = clone(res.data); S.uploads = []; setDirty(false); draw(); }) : null];
};

// ---------- client logos ----------
PAGES.clients = async item => {
  const res = await api("GET", "/api/data/clients");
  const edit = perm("clients") === "E";
  let data = clone(res.data), sha = res.sha;
  const cache = Object.values(res.cache || {});
  const cats = res.categories || [];
  const RE = /^https:\/\/(www\.|m\.|web\.)?facebook\.com\/.+/;
  const wrap = h("div", { class: "stack" });
  const catList = h("datalist", { id: "cp-cats" }, cats.map(c => h("option", { value: c })));
  function draw() {
    const list = data.clients;
    const linkIn = h("input", { class: "input", type: "url", id: "cp-link", placeholder: "https://web.facebook.com/…", style: "flex:3 1 280px" });
    const catIn = h("input", { class: "input", id: "cp-cat", list: "cp-cats", placeholder: "ប្រភេទ (ជ្រើស ឬវាយ)", style: "flex:1 1 180px" });
    put(wrap,
      catList,
      edit ? h("form", { class: "hero-add", onsubmit: e => {
        e.preventDefault();
        const url = linkIn.value.trim();
        if (!RE.test(url)) { toast("⚠️ Link ត្រូវចាប់ផ្តើមដោយ https://web.facebook.com/ ឬ https://www.facebook.com/", true); linkIn.focus(); return; }
        if (list.some(c => c.url === url)) { toast("⚠️ Link នេះមានរួចហើយ", true); return; }
        list.unshift({ url, category: catIn.value.trim(), name: "", followers: "" });
        setDirty(); draw(); toast("➕ បានបន្ថែម · ចុច «រក្សាទុក»");
      } },
        h("h2", {}, "🔗 បិទភ្ជាប់ Link ផេក Facebook — រូប ឈ្មោះ និង Follower យកដោយស្វ័យប្រវត្តិ"),
        h("div", { class: "row", style: "gap:8px" }, h("label", { class: "sr", for: "cp-link" }, "Link"), linkIn, h("label", { class: "sr", for: "cp-cat" }, "ប្រភេទ"), catIn, h("button", { class: "btn green", type: "submit" }, "✨ បន្ថែម")),
        h("span", { class: "hint" }, "ក្រោយ Save ប្រហែល 2 នាទី ឈ្មោះ Follower និងរូបនឹងបង្ហាញលើវេបសាយ ហើយធ្វើបច្ចុប្បន្នភាពរៀងរាល់ថ្ងៃ។")) : null,
      h("section", { class: "card" }, h("h2", {}, `⭐ ផេកអតិថិជន · ${list.length}`),
        list.length ? h("div", { class: "list" }, list.map((c, i) => {
          const got = cache.find(x => x.url === c.url) || {};
          const name = c.name || got.name || "";
          const fol = parseCount(c.followers) || got.followers || 0;
          return h("div", { class: "item", style: "flex-wrap:wrap" },
            h("span", { class: "avatar", style: "width:44px;height:44px;overflow:hidden;background:#1c4b9b" }, got.picture ? h("img", { src: imgSrc(got.picture), alt: "", style: "width:100%;height:100%;object-fit:cover" }) : (name || "?").charAt(0).toUpperCase()),
            h("div", { class: "txt", style: "flex:1 1 220px" }, h("b", {}, name || "⏳ កំពុងអាន… (ក្រោយ Save)"), h("a", { href: c.url, target: "_blank", rel: "noopener", style: "font-size:12.5px" }, c.url.replace(/^https:\/\/(www\.|web\.|m\.)?/, ""))),
            fol ? h("span", { class: "pill", style: "border:2px solid var(--navy);background:#fff" }, shortNum(fol) + " Follower") : null,
            edit ? [h("label", { class: "sr", for: "cpc" + i }, "ប្រភេទ"), h("input", { id: "cpc" + i, class: "input", list: "cp-cats", value: c.category || "", placeholder: "ប្រភេទ", style: "width:170px;min-height:38px", oninput: e => { c.category = e.target.value; setDirty(); } })]
              : (c.category ? h("span", { class: "pill" }, c.category) : null),
            edit ? h("div", { class: "ctl" },
              h("button", { class: "btn small icon", type: "button", "aria-label": "ឡើងលើ", disabled: i === 0, onclick: () => { move(list, i, -1); draw(); } }, "↑"),
              h("button", { class: "btn small icon", type: "button", "aria-label": "ចុះក្រោម", disabled: i === list.length - 1, onclick: () => { move(list, i, 1); draw(); } }, "↓"),
              h("button", { class: "btn small icon danger", type: "button", "aria-label": `ដក ${name || c.url}`, onclick: () => { if (!confirm(`ដក «${name || c.url}» ចេញ?`)) return; list.splice(i, 1); setDirty(); draw(); } }, "🗑️")) : null);
        })) : h("div", { class: "empty" }, "មិនទាន់មាន។ បិទភ្ជាប់ Link ខាងលើ ដើម្បីចាប់ផ្តើម។")));
  }
  draw();
  const save = async () => { const r = await api("PUT", "/api/data/clients", { data, sha }); sha = r.sha; data = r.data; draw(); };
  return [header(item), wrap, edit ? saveBar(save, () => { data = clone(res.data); setDirty(false); draw(); }) : null];
};

// ---------- articles ----------
function mdToHtml(md) {
  const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|\/[^)\s]*)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  const out = []; let list = null;
  for (const line of String(md).split("\n")) {
    let m;
    if ((m = /^(#{2,4})\s+(.*)$/.exec(line))) { list = null; out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`); }
    else if ((m = /^\s*[-*]\s+(.*)$/.exec(line)) || (m = /^\s*\d+[.)]\s+(.*)$/.exec(line))) { if (!list) { list = []; out.push(list); } list.push(`<li>${inline(m[1])}</li>`); }
    else if (line.trim() === "") list = null;
    else { list = null; out.push(`<p>${inline(line)}</p>`); }
  }
  return out.map(x => Array.isArray(x) ? `<ul>${x.join("")}</ul>` : x).join("");
}

PAGES.articles = async (item, sub) => {
  if (sub) return articleEditor(item, sub);
  let res = await api("GET", "/api/articles");
  for (let i = 0; res.pending && i < 20; i++) res = await api("GET", "/api/articles");
  const edit = perm("articles") === "E";
  const st = S.state.articles || (S.state.articles = { q: "", tag: "" });
  const wrap = h("section", { class: "card" });
  function draw() {
    const q = st.q.toLowerCase();
    const items = res.items.filter(a => (!q || (a.title + " " + a.slug).toLowerCase().includes(q)) && (!st.tag || a.tag === st.tag));
    put(wrap, 
      h("div", { class: "row", style: "gap:10px;margin-bottom:10px" },
        h("label", { class: "sr", for: "aq" }, "ស្វែងរក"),
        h("input", { id: "aq", class: "input", type: "search", placeholder: "🔎 ស្វែងរកអត្ថបទ…", value: st.q, style: "flex:2 1 240px", oninput: e => { st.q = e.target.value; drawList(); } }),
        h("label", { class: "sr", for: "atag" }, "ប្រធានបទ"),
        h("select", { id: "atag", class: "input", style: "flex:1 1 180px", onchange: e => { st.tag = e.target.value; drawList(); } }, h("option", { value: "" }, "ប្រធានបទទាំងអស់"), S.me.tags.map(t => h("option", { value: t, selected: t === st.tag }, t)))),
      h("div", { class: "list", id: "alist" }));
    drawList();
  }
  function drawList() {
    const q = st.q.toLowerCase();
    const items = res.items.filter(a => (!q || (a.title + " " + a.slug).toLowerCase().includes(q)) && (!st.tag || a.tag === st.tag));
    put(wrap.querySelector("#alist"), ...(items.length ? items.map(a => h("a", { class: "item", href: `#/articles/${a.slug}`, style: "text-decoration:none;color:inherit" },
      h("span", { class: "thumb", style: "width:44px;height:44px;background:linear-gradient(135deg,#f5b544,#ff8a3c)" }, a.source === "autopost" ? "🤖" : "📝"),
      h("div", { class: "txt" }, h("b", {}, a.title), h("span", {}, `${a.date} · ${a.tag}`)),
      a.draft ? h("span", { class: "pill warn" }, "📝 ព្រាង") : h("span", { class: "pill ok" }, "● លើវេបសាយ"),
      h("span", { class: "btn small", "aria-hidden": "true" }, edit ? "✏️" : "👀"))) : [h("div", { class: "empty" }, "រកមិនឃើញ")]));
  }
  draw();
  return [header(item, edit ? h("a", { class: "btn primary", href: "#/articles/new" }, "➕ សរសេរអត្ថបទថ្មី") : null), wrap];
};

async function articleEditor(item, slug) {
  const isNew = slug === "new";
  const edit = perm("articles") === "E";
  let res = isNew ? { data: { title: "", summary: "", tag: S.me.tags[0], date: new Date().toISOString().slice(0, 10), emoji: "📣 💬 📈", draft: true }, body: "", sha: null } : await api("GET", `/api/articles/${encodeURIComponent(slug)}`);
  let data = clone(res.data), body = res.body, sha = res.sha;
  const slugBox = { slug: isNew ? "" : slug };
  let preview = false;
  const bodyWrap = h("div");
  function drawBody() {
    if (preview) { const d = h("div", { class: "md-prev" }); d.innerHTML = mdToHtml(body); put(bodyWrap, d); return; }
    const ta = h("textarea", { class: "input body", id: "abody", "aria-label": "អត្ថបទ", disabled: !edit, oninput: e => { body = e.target.value; setDirty(); } }, body);
    const wrapSel = (pre, post = pre) => { const s = ta.selectionStart, e = ta.selectionEnd; body = ta.value.slice(0, s) + pre + ta.value.slice(s, e) + post + ta.value.slice(e); ta.value = body; ta.focus(); ta.setSelectionRange(s + pre.length, e + pre.length); setDirty(); };
    const linePre = pre => { const s = ta.selectionStart; const ls = ta.value.lastIndexOf("\n", s - 1) + 1; body = ta.value.slice(0, ls) + pre + ta.value.slice(ls); ta.value = body; ta.focus(); setDirty(); };
    put(bodyWrap, edit ? h("div", { class: "toolbar", style: "margin-bottom:6px" },
      h("button", { class: "btn small", type: "button", onclick: () => linePre("## ") }, "H ចំណងជើងរង"),
      h("button", { class: "btn small", type: "button", onclick: () => wrapSel("**") }, h("b", {}, "B"), " ដិត"),
      h("button", { class: "btn small", type: "button", onclick: () => linePre("- ") }, "• បញ្ជី")) : null, ta);
  }
  drawBody();
  const save = async () => {
    const s = isNew ? slugBox.slug.trim() : slug;
    if (!SLUG.test(s)) throw new Error("តំណភ្ជាប់: ប្រើអក្សរឡាតាំងតូច លេខ និង - (ឧ. sell-more-on-live)");
    const r = await api("PUT", `/api/articles/${s}`, { data, body, sha, uploads: S.uploads });
    sha = r.sha; data = r.data; S.uploads = [];
    if (isNew) { setDirty(false); location.hash = `#/articles/${s}`; }
  };
  const kw = { v: Array.isArray(data.keywords) ? data.keywords.join(", ") : "" };
  const page = [
    header({ ...item, km: isNew ? "អត្ថបទថ្មី" : "កែអត្ថបទ" }, h("a", { class: "btn", href: "#/articles" }, "← ត្រឡប់")),
    !isNew && data.source === "autopost" ? h("div", { class: "alert info" }, "🤖 អត្ថបទនេះសរសេរដោយប្រព័ន្ធបោះពុម្ពស្វ័យប្រវត្តិ។ អ្នកអាចកែ ឬបិទវា (ព្រាង) បាន។") : null,
    h("div", { class: "row" },
      h("section", { class: "card main stack" },
        field(data, "title", "ចំណងជើង", { disabled: !edit }),
        field(data, "summary", "សេចក្តីសង្ខេប", { type: "textarea", rows: 2, disabled: !edit, hint: "១-២ ប្រយោគ · បង្ហាញលើកាត និងពេលចែករំលែកលើ Facebook" }),
        h("div", { class: "field" }, h("div", { class: "row", style: "align-items:center;gap:8px" }, h("span", { class: "lbl", style: "flex:1;font-weight:600;font-size:13.5px" }, "អត្ថបទ"),
          h("div", { class: "tabs" }, h("button", { class: "tab", type: "button", "aria-pressed": "true", onclick: e => { preview = false; e.currentTarget.setAttribute("aria-pressed", "true"); e.currentTarget.nextSibling.setAttribute("aria-pressed", "false"); drawBody(); } }, "✏️ សរសេរ"),
            h("button", { class: "tab", type: "button", "aria-pressed": "false", onclick: e => { preview = true; e.currentTarget.setAttribute("aria-pressed", "true"); e.currentTarget.previousSibling.setAttribute("aria-pressed", "false"); drawBody(); } }, "👀 មើលជាមុន"))),
          bodyWrap, h("span", { class: "hint" }, "## = ចំណងជើងរង · **ពាក្យ** = ដិត · - = បញ្ជី"))),
      h("aside", { class: "aside stack" },
        h("section", { class: "card stack" },
          h("h2", { style: "margin:0" }, "📌 ការបោះពុម្ព"),
          sw(!data.draft, "🌐 បង្ហាញលើវេបសាយ", v => { data.draft = !v; setDirty(); }, !edit),
          isNew ? field(slugBox, "slug", "តំណភ្ជាប់ (អក្សរឡាតាំង)", { placeholder: "sell-more-on-live", hint: "adsbox.agency/knowledge/<តំណ>/ · មិនអាចប្តូរក្រោយបង្កើត" })
            : h("div", { class: "field" }, h("span", { class: "lbl" }, "តំណភ្ជាប់"), h("a", { href: `${S.me.site}/knowledge/${slug}/`, target: "_blank", rel: "noopener", style: "word-break:break-all" }, `/knowledge/${slug}/`)),
          field(data, "tag", "ប្រធានបទ", { type: "select", options: S.me.tags, disabled: !edit }),
          field(data, "date", "កាលបរិច្ឆេទ", { type: "date", disabled: !edit }),
          field(data, "emoji", "😀 Emoji លើរូបគម្រប", { disabled: !edit, hint: "Emoji ៣ ដកឃ្លា · រូបគម្របបង្កើតដោយស្វ័យប្រវត្តិ" }),
          imagePicker({ label: "🖼️ រូបគម្របផ្ទាល់ខ្លួន (ស្រេចចិត្ត)", value: data.cover, disabled: !edit, onChange: v => (data.cover = v), hint: "1200×630 · ទុកទទេ = រូបស្វ័យប្រវត្តិ" })),
        h("details", { class: "card" }, h("summary", { style: "cursor:pointer;font-weight:700" }, "🔎 SEO (ស្រេចចិត្ត)"),
          h("div", { class: "stack", style: "margin-top:12px" },
            field(data, "seo_title", "SEO ចំណងជើង", { disabled: !edit, hint: "ក្រោម 60 តួ" }),
            field(data, "seo_description", "SEO ការពិពណ៌នា", { type: "textarea", rows: 2, disabled: !edit, hint: "70-160 តួ" }),
            field(data, "primary_keyword", "ពាក្យគន្លឹះចម្បង", { disabled: !edit }),
            field(kw, "v", "ពាក្យគន្លឹះ (ដកឃ្លាដោយ ,)", { disabled: !edit, onInput: v => (data.keywords = v.split(",").map(s => s.trim()).filter(Boolean)) }),
            field(data, "image_alt", "ការពិពណ៌នារូបភាព (alt)", { disabled: !edit }))))),
    edit ? saveBar(save, () => { data = clone(res.data); body = res.body; S.uploads = []; setDirty(false); render(); }) : null,
  ];
  if (isNew) setTimeout(() => setDirty(true), 0);
  return page;
}

// ---------- auto-publish ----------
PAGES.autopost = async item => {
  const canSettings = S.me.perms.autopost !== "N";
  const [res, hist] = await Promise.all([
    canSettings ? api("GET", "/api/data/autopost") : null,
    S.me.perms.history !== "N" ? api("GET", "/api/data/history").catch(() => null) : null,
  ]);
  const edit = perm("autopost") === "E" && S.me.perms.autopost === "E";
  let data = res && clone(res.data), sha = res && res.sha;
  const wrap = h("div", { class: "stack" });
  function draw() {
    const parts = [];
    if (data) {
      parts.push(h("section", { class: "card" }, h("div", { class: "row", style: "align-items:center" },
        h("div", { style: "flex:1 1 260px" }, h("h2", { style: "margin:0" }, "⚡ ការបោះពុម្ពស្វ័យប្រវត្តិ"), h("span", { class: "muted", style: "font-size:14px" }, "២ អត្ថបទ/ថ្ងៃ សម្រាប់អ្នកលក់អនឡាញ")),
        sw(!!data.enabled, data.enabled ? "បើក" : "ផ្អាក", v => { data.enabled = v; setDirty(); draw(); }, !edit))));
      parts.push(h("div", { class: "modes", role: "radiogroup", "aria-label": "Mode" },
        h("button", { type: "button", role: "radio", "aria-checked": String(data.mode === "live"), class: "mode" + (data.mode === "live" ? " on-live" : ""), disabled: !edit, onclick: () => { if (data.mode === "live") return; if (!confirm("ប្តូរទៅ Live? អត្ថបទនឹងបង្ហាញលើវេបសាយដោយស្វ័យប្រវត្តិ។")) return; data.mode = "live"; setDirty(); draw(); } },
          h("b", {}, "🚀 បោះពុម្ពពិត (Live)"), h("span", { style: "font-size:14px" }, "អត្ថបទបង្ហាញលើវេបសាយភ្លាមៗ"), data.mode === "live" ? h("span", { class: "pill ok", style: "align-self:flex-start;background:var(--ok);color:#fff" }, "✔ កំពុងប្រើ") : null),
        h("button", { type: "button", role: "radio", "aria-checked": String(data.mode === "dry_run"), class: "mode" + (data.mode === "dry_run" ? " on-dry" : ""), disabled: !edit, onclick: () => { data.mode = "dry_run"; setDirty(); draw(); } },
          h("b", {}, "🧪 សាកល្បង (Dry run)"), h("span", { style: "font-size:14px" }, "សរសេរ ហើយទុកឲ្យពិនិត្យ — មិនបង្ហាញលើវេបសាយ"), data.mode === "dry_run" ? h("span", { class: "pill warn", style: "align-self:flex-start" }, "✔ កំពុងប្រើ") : null)),
        !edit ? h("p", { class: "muted", style: "margin:0;font-size:13.5px" }, "🔒 មានតែម្ចាស់ទេ ដែលអាចប្តូរការកំណត់នេះ។") : null);
      const slot = (k, e, label, bg) => h("div", { class: "slot", style: `background:${bg}` },
        h("span", { class: "e", "aria-hidden": "true" }, e),
        h("div", { style: "flex:1" }, h("b", {}, label), h("div", {}, sw(!!data[k].enabled, data[k].enabled ? "បើក" : "បិទ", v => { data[k].enabled = v; setDirty(); draw(); }, !edit))),
        h("label", { class: "sr", for: "t-" + k }, label + " ម៉ោង"),
        h("input", { id: "t-" + k, class: "input", type: "time", value: data[k].time, disabled: !edit, oninput: ev => { data[k].time = ev.target.value; setDirty(); } }));
      parts.push(h("div", { class: "row" },
        h("section", { class: "card main stack" }, h("h2", { style: "margin:0" }, "⏰ ម៉ោងបោះពុម្ព ", h("span", { class: "muted", style: "font-size:13px;font-weight:400" }, "· ម៉ោងភ្នំពេញ")),
          slot("morning", "🌅", "ពេលព្រឹក", "linear-gradient(90deg,#fff6e0,#fff)"),
          slot("evening", "🌆", "ពេលល្ងាច", "linear-gradient(90deg,#efecff,#fff)"),
          h("p", { class: "muted", style: "margin:0;font-size:13px" }, "💡 ប្រព័ន្ធចាប់ផ្តើមសរសេរ ៤ នាទីមុនម៉ោង។ បើប្តូរម៉ោង សូមប្រាប់ Claude ឲ្យប្តូរ Scheduled task ដែរ។")),
        h("section", { class: "card aside stack" }, h("h2", { style: "margin:0" }, "🎛️ ការកំណត់លម្អិត"),
          h("div", { class: "grid2" },
            field(data, "min_khmer_chars", "📏 ប្រវែងតិចបំផុត", { type: "number", disabled: !edit }),
            field(data, "max_khmer_chars", "📏 ប្រវែងច្រើនបំផុត", { type: "number", disabled: !edit }),
            field(data, "max_attempts", "🔁 ព្យាយាមម្តងទៀត", { type: "number", disabled: !edit }),
            field(data, "alert_after_minutes", "✈️ Telegram ក្រោយ (នាទី)", { type: "number", disabled: !edit }),
            field(data, "early_minutes", "⏪ មុនម៉ោង (នាទី)", { type: "number", disabled: !edit }),
            field(data, "late_minutes", "⏩ យឺតបំផុត (នាទី)", { type: "number", disabled: !edit })))));
    }
    if (hist && hist.data) {
      const runs = (hist.data.runs || []).slice().reverse().slice(0, 40);
      const st = { published: ["pill ok", "✅ បានបោះពុម្ព"], dry_run: ["pill warn", "🧪 Dry run"], failed: ["pill hot", "⚠️ បរាជ័យ"] };
      parts.push(h("section", { class: "card" }, h("h2", {}, "📜 ប្រវត្តិ ", h("span", { class: "muted", style: "font-size:13px;font-weight:400" }, "· ថ្មីបំផុតខាងលើ")),
        runs.length ? h("div", { class: "scroll" }, h("table", { class: "tbl" },
          h("thead", {}, h("tr", {}, h("th", { scope: "col" }, "ថ្ងៃ"), h("th", { scope: "col" }, "ពេល"), h("th", { scope: "col" }, "អត្ថបទ"), h("th", { scope: "col" }, "ស្ថានភាព"))),
          h("tbody", {}, runs.map(r => h("tr", {},
            h("td", { class: "num", style: "white-space:nowrap" }, r.date), h("td", {}, r.slot === "morning" ? "🌅" : "🌆"),
            h("td", {}, r.url ? h("a", { href: r.url, target: "_blank", rel: "noopener" }, r.title || r.slug) : (r.title || h("span", { class: "muted" }, r.error || "—"))),
            h("td", {}, h("span", { class: (st[r.status] || ["pill grey"])[0] }, (st[r.status] || [, r.status])[1]))))))) : h("p", { class: "muted" }, "មិនទាន់មាន")));
    }
    put(wrap, ...parts);
  }
  draw();
  const save = async () => { const r = await api("PUT", "/api/data/autopost", { data, sha }); sha = r.sha; data = r.data; draw(); };
  return [header({ ...item, id: "autopost" }), wrap, edit ? saveBar(save, () => { data = clone(res.data); setDirty(false); draw(); }) : null];
};

// ---------- team & roles ----------
PAGES.team = async item => {
  const res = await api("GET", "/api/team");
  let members = clone(res.members);
  const roles = S.me.roles.filter(r => r.id !== "owner");
  const wrap = h("div", { class: "stack" });
  const L = { E: ["✏️", "#e3f7ee", "កែបាន"], V: ["👀", "#e8eefb", "មើលបាន"], N: ["🚫", "#f3f5f9", "មើលមិនឃើញ"] };
  const SEC = [["services", "🛍️ សេវាកម្ម និងតម្លៃ"], ["accounts", "📘 លក់ផេក & TikTok"], ["promos", "🎁 Pop-up"], ["clients", "⭐ ផេកអតិថិជន"], ["articles", "📝 អត្ថបទ"], ["autopost", "🤖 ការកំណត់បោះពុម្ព (Live/Dry run)"], ["history", "📜 ប្រវត្តិបោះពុម្ព"], ["team", "👥 ក្រុមការងារ"]];
  const ROLE_BG = { owner: "linear-gradient(135deg,#f5b544,#ff8a3c)", admin: "linear-gradient(135deg,#1c4b9b,#3f7dff)", sales: "linear-gradient(135deg,#0e7a50,#2fbf7e)", writer: "linear-gradient(135deg,#5b47e0,#9b7bff)", designer: "linear-gradient(135deg,#c8355e,#ff7a9a)", viewer: "#fff" };
  const ROLE_DESC = { owner: "គ្រប់យ៉ាង · Live · តួនាទី", admin: "កែមាតិកាទាំងអស់ លើកលែងតួនាទី និង Live", sales: "សេវាកម្ម តម្លៃ ផេកលក់ និង Pop-up", writer: "អត្ថបទចំណេះដឹង", designer: "ផេកអតិថិជន Pop-up និងរូបភាព", viewer: "មើលបាន មិនអាចកែ" };
  function draw() {
    const count = r => members.filter(m => m.role === r).length;
    const email = h("input", { id: "inv-email", class: "input", type: "email", placeholder: "name@gmail.com", autocomplete: "off" });
    const role = h("select", { id: "inv-role", class: "input" }, roles.map(r => h("option", { value: r.id, selected: r.id === "sales" }, `${r.emoji} ${r.km}`)));
    put(wrap, 
      h("div", { class: "grid", style: "grid-template-columns:repeat(auto-fill,minmax(165px,1fr))" }, S.me.roles.map(r => h("div", { style: `border-radius:16px;padding:14px 16px;background:${ROLE_BG[r.id]};color:${r.id === "viewer" || r.id === "owner" ? "#1b1300" : "#fff"};${r.id === "viewer" ? "border:1px solid var(--line)" : ""};display:flex;flex-direction:column;gap:4px` },
        h("span", { style: "font-size:26px" }, r.emoji), h("b", {}, `${r.km}${r.km !== r.en ? ` (${r.en})` : ""}`), h("span", { style: "font-size:12.5px;line-height:1.5" }, ROLE_DESC[r.id]),
        h("span", { style: "align-self:flex-start;margin-top:4px;font-size:12px;font-weight:700;padding:1px 10px;border-radius:999px;background:rgba(255,255,255,.85);color:#0f1a2e" }, `${count(r.id)} នាក់`)))),
      h("div", { class: "row" },
        h("section", { class: "card main" }, h("h2", {}, "🧑‍🤝‍🧑 សមាជិក"),
          h("div", { class: "list" }, members.map((m, i) => h("div", { class: "item" },
            h("span", { class: "avatar", "aria-hidden": "true" }, (m.name || m.email).charAt(0).toUpperCase()),
            h("div", { class: "txt" }, h("b", {}, m.email), h("span", {}, m.fixed ? "ម្ចាស់វេបសាយ · មិនអាចប្តូរ" : `បន្ថែម ${m.added || "ថ្ងៃនេះ"}`)),
            m.fixed ? h("span", { class: "pill warn" }, "👑 ម្ចាស់") : [
              h("label", { class: "sr", for: `r${i}` }, `តួនាទី ${m.email}`),
              h("select", { id: `r${i}`, class: "input", style: "width:auto;min-height:38px", onchange: e => { m.role = e.target.value; setDirty(); draw(); } }, roles.map(r => h("option", { value: r.id, selected: r.id === m.role }, `${r.emoji} ${r.km}`))),
              h("button", { class: "btn small icon danger", type: "button", "aria-label": `ដក ${m.email}`, onclick: () => { if (!confirm(`ដក ${m.email} ចេញពីក្រុម?`)) return; members.splice(i, 1); setDirty(); draw(); } }, "🗑️")])))),
        h("aside", { class: "aside stack" },
          h("form", { class: "hero-add", onsubmit: e => {
            e.preventDefault();
            const em = email.value.trim().toLowerCase();
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) { toast("⚠️ អ៊ីមែលមិនត្រឹមត្រូវ", true); email.focus(); return; }
            if (members.some(m => m.email === em)) { toast("⚠️ មានរួចហើយ", true); return; }
            members.push({ email: em, role: role.value, name: "" }); setDirty(); draw(); toast("➕ បានបន្ថែម · ចុច «រក្សាទុក»");
          } },
            h("h2", {}, "✉️ បន្ថែមសមាជិក"),
            h("label", { class: "sr", for: "inv-email" }, "អ៊ីមែល Google"), email,
            h("label", { class: "sr", for: "inv-role" }, "តួនាទី"), role,
            h("button", { class: "btn green", type: "submit" }, "➕ បន្ថែម"),
            h("span", { class: "hint" }, "ប្រើអ៊ីមែល Google (Gmail)។ បន្ទាប់ពី Save ពួកគេចូលបានភ្លាមៗ តាម «ចូលដោយ Google»។")),
          h("div", { class: "alert info" }, "🔒 មានតែ ", h("b", {}, "ម្ចាស់"), " ទេ ដែលអាចប្តូរ Live/Dry run ផ្លាស់ប្តូរតួនាទី ឬដកសមាជិក។ ការដកចេញមានប្រសិទ្ធភាពភ្លាមៗ។"))),
      h("section", { class: "card" }, h("h2", {}, "🔐 សិទ្ធិតាមផ្នែក ", h("span", { class: "muted", style: "font-size:13px;font-weight:400" }, "✏️ កែបាន · 👀 មើលបាន · 🚫 មើលមិនឃើញ")),
        h("div", { class: "scroll" }, h("table", { class: "tbl", style: "min-width:620px" },
          h("thead", {}, h("tr", {}, h("th", { scope: "col" }, "ផ្នែក"), S.me.roles.map(r => h("th", { scope: "col", class: "c" }, r.emoji, h("br"), r.km)))),
          h("tbody", {}, SEC.map(([k, l]) => h("tr", {}, h("th", { scope: "row", style: "font-weight:500;white-space:nowrap" }, l),
            S.me.roles.map(r => { const a = S.me.matrix[r.id][k]; return h("td", { class: "c" }, h("span", { title: L[a][2], style: `display:inline-block;min-width:34px;padding:3px 0;border-radius:8px;background:${L[a][1]}` }, L[a][0], h("span", { class: "sr" }, L[a][2]))); }))))))));
  }
  draw();
  const save = async () => { const r = await api("PUT", "/api/team", { members: members.filter(m => !m.fixed) }); members = r.members; res.members = clone(r.members); draw(); };
  return [header(item), wrap, saveBar(save, () => { members = clone(res.members); setDirty(false); draw(); })];
};

// ---------- start ----------
(async function start() {
  try { S.me = await api("GET", "/api/me"); }
  catch (e) { renderLogin(new URLSearchParams(location.search).get("error") || (e.status === 401 ? null : "x")); return; }
  if (location.search) history.replaceState(null, "", "/" + location.hash);
  render();
})();
