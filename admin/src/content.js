// What each section reads and writes, and the checks a save must pass.
// Rules mirror .pages.yml so the website build accepts everything the panel saves.

import YAML from "yaml";

export const FILES = {
  services: "content/services.json",
  accounts: "content/accounts.json",
  promos:   "content/promos.json",
  clients:  "content/clients.json",
  autopost: "content/autopost/settings.json",
  history:  "content/autopost/history.json",
};
export const ACCOUNT_CACHE = "content/account-cache.json";
export const ARTICLES_DIR = "content/articles";

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const TIME = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const IMAGE = /^(\/assets\/(?!.*\.\.)[A-Za-z0-9._\/ -]+\.(jpe?g|png|webp|gif)|upload:\d+)?$/i;   // no ".." segments
export const ARTICLE_TAGS = ["Boost Post", "Boost Live", "TikTok", "លក់ Live", "ថែទាំផេក", "រចនា", "Messenger", "ចំណេះដឹង", "លក់អនឡាញ", "សេវាអតិថិជន", "ថវិកា និងរបាយការណ៍", "ADS BOX"];

class Invalid extends Error {}
export { Invalid };

const fail = msg => { throw new Invalid(msg); };
const isObj = v => v && typeof v === "object" && !Array.isArray(v);
function str(v, where, { required = false, max = 2000, re } = {}) {
  if (v === undefined || v === null) v = "";
  if (typeof v !== "string") fail(`${where}: ត្រូវតែជាអក្សរ`);
  v = v.trim();
  if (required && !v) fail(`${where}: សូមបំពេញ`);
  if (v.length > max) fail(`${where}: វែងពេក (អតិបរមា ${max})`);
  if (v && re && !re.test(v)) fail(`${where}: ទម្រង់មិនត្រឹមត្រូវ`);
  return v;
}
const img = (v, where) => str(v, where, { max: 300, re: IMAGE });
const bool = v => v === true;
function num(v, where, min = 0, max = 100000) {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isFinite(n) || n < min || n > max) fail(`${where}: ត្រូវតែជាលេខ ${min}–${max}`);
  return n;
}
function list(v, where, max = 500) {
  if (!Array.isArray(v)) fail(`${where}: ត្រូវតែជាបញ្ជី`);
  if (v.length > max) fail(`${where}: ច្រើនពេក`);
  return v;
}
function unique(items, key, where) {
  const seen = new Set();
  for (const it of items) {
    if (seen.has(it[key])) fail(`${where}: លេខកូដ «${it[key]}» ស្ទួន`);
    seen.add(it[key]);
  }
}
// Keep fields this panel does not edit (e.g. ones added later by tools) exactly as they were.
const keep = (orig, clean) => ({ ...(isObj(orig) ? orig : {}), ...clean });
// Optional fields: written only when they have a value or were already in the file,
// so saving without changes leaves the file byte-for-byte the same.
function optional(orig, values) {
  const out = {};
  for (const [k, v] of Object.entries(values)) {
    const empty = v === "" || v === false || (Array.isArray(v) && !v.length);
    if (!empty || (isObj(orig) && k in orig)) out[k] = v;
  }
  return out;
}

export function cleanServices(d) {
  if (!isObj(d)) fail("ទិន្នន័យមិនត្រឹមត្រូវ");
  const groups = list(d.groups, "ក្រុម", 30).map((g, gi) => {
    if (!isObj(g)) fail("ក្រុមមិនត្រឹមត្រូវ");
    const where = `ក្រុម ${gi + 1}`;
    const services = list(g.services, where, 60).map((s, si) => {
      if (!isObj(s)) fail("សេវាកម្មមិនត្រឹមត្រូវ");
      const w = `${where} · សេវាកម្ម ${si + 1}`;
      return keep(s, {
        id: str(s.id, `${w} លេខកូដ`, { required: true, max: 60, re: SLUG }),
        name: str(s.name, `${w} ឈ្មោះ`, { required: true, max: 120 }),
        ...optional(s, {
          desc: str(s.desc, `${w} ការពិពណ៌នា`, { max: 600 }),
          emoji: str(s.emoji, `${w} Emoji`, { max: 40 }),
          price: str(s.price, `${w} តម្លៃ`, { max: 60 }),
          thumb: img(s.thumb, `${w} រូបលើកាត`),
          poster: img(s.poster, `${w} ប៉ូស្ទ័រ`),
          popular: bool(s.popular),
        }),
      });
    });
    unique(services, "id", where);
    return keep(g, { id: str(g.id, `${where} លេខកូដ`, { required: true, max: 60, re: SLUG }), name: str(g.name, `${where} ឈ្មោះ`, { required: true, max: 120 }), services });
  });
  unique(groups, "id", "ក្រុម");
  unique(groups.flatMap(g => g.services), "id", "សេវាកម្ម");
  return keep(d, { groups });
}

const FB = /^https:\/\/(www\.|m\.)?facebook\.com\/.+/;
const TT = /^https:\/\/(www\.)?tiktok\.com\/@.+/;
export function cleanAccounts(d) {
  if (!isObj(d)) fail("ទិន្នន័យមិនត្រឹមត្រូវ");
  const side = (p, re, withType) => {
    const s = isObj(d[p]) ? d[p] : {};
    const items = list(s.items || [], p, 200).map((it, i) => {
      if (!isObj(it)) fail("មិនត្រឹមត្រូវ");
      const w = `${p} ${i + 1}`;
      const out = {
        url: str(it.url, `${w} Link`, { required: true, max: 300, re }),
        ...(withType ? { type: ["ផេកខ្មែរ", "ផេកប៊ូសឡាយ"].includes(it.type) ? it.type : "ផេកខ្មែរ" } : {}),
        status: ["available", "sold"].includes(it.status) ? it.status : "available",
        cover: img(it.cover, `${w} Cover`),
        name: str(it.name, `${w} ឈ្មោះ`, { max: 120 }),
        followers: str(String(it.followers ?? ""), `${w} Follower`, { max: 20, re: /^[0-9.,]*\s*[KkMm]?$/ }),
      };
      return keep(it, out);
    });
    unique(items, "url", p);
    return keep(s, { title: str(s.title, `${p} ឈ្មោះផ្ទាំង`, { max: 80 }), price_per_1k: num(s.price_per_1k ?? 0, `${p} តម្លៃក្នុង 1K`, 0, 10000), items });
  };
  return keep(d, { facebook: side("facebook", FB, true), tiktok: side("tiktok", TT, false) });
}

export function cleanPromos(d) {
  const items = list(d, "Pop-up", 30).map((p, i) => {
    if (!isObj(p)) fail("មិនត្រឹមត្រូវ");
    const w = `Pop-up ${i + 1}`;
    const points = list(p.points || [], `${w} ចំណុច`, 20).map(x => str(x, `${w} ចំណុច`, { max: 160 })).filter(Boolean);
    return keep(p, {
      id: str(p.id, `${w} លេខកូដ`, { required: true, max: 60, re: SLUG }),
      title: str(p.title, `${w} ចំណងជើង`, { required: true, max: 120 }),
      ...optional(p, { price: str(p.price, `${w} តម្លៃ`, { max: 60 }), badge: str(p.badge, `${w} ស្លាក`, { max: 40 }), points }),
      image: img(p.image, `${w} ប៉ូស្ទ័រ`) || fail(`${w} ប៉ូស្ទ័រ: សូមដាក់រូប`),
      popup: p.popup !== false,
    });
  });
  unique(items, "id", "Pop-up");
  return items;
}

export function cleanClients(d) {
  if (!isObj(d)) fail("ទិន្នន័យមិនត្រឹមត្រូវ");
  const clients = list(d.clients, "Logo", 200).map((c, i) => {
    if (!isObj(c)) fail("មិនត្រឹមត្រូវ");
    if (!Object.keys(c).length) return c;   // an empty entry already in the file: left alone
    return keep(c, {
      ...optional(c, { name: str(c.name, `Logo ${i + 1} ឈ្មោះ`, { max: 120 }) }),
      logo: img(c.logo, `Logo ${i + 1}`) || fail(`Logo ${i + 1}: សូមដាក់រូប`),
    });
  });
  return keep(d, { clients });
}

export function cleanAutopost(d, before) {
  if (!isObj(d)) fail("ទិន្នន័យមិនត្រឹមត្រូវ");
  const slot = (s, w) => ({ enabled: bool(isObj(s) && s.enabled), time: str(isObj(s) ? s.time : "", `${w} ម៉ោង`, { required: true, re: TIME }) });
  const out = keep(d, {
    enabled: bool(d.enabled),
    mode: ["live", "dry_run"].includes(d.mode) ? d.mode : fail("របៀប: live ឬ dry_run"),
    timezone: before && before.timezone ? before.timezone : str(d.timezone, "ម៉ោងតំបន់", { max: 60 }),
    morning: slot(d.morning, "ពេលព្រឹក"),
    evening: slot(d.evening, "ពេលល្ងាច"),
    early_minutes: num(d.early_minutes, "មុនម៉ោង", 0, 120),
    late_minutes: num(d.late_minutes, "យឺតបំផុត", 0, 600),
    alert_after_minutes: num(d.alert_after_minutes, "ផ្ញើ Telegram", 0, 600),
    max_attempts: num(d.max_attempts, "ចំនួនដង", 1, 10),
    min_khmer_chars: num(d.min_khmer_chars, "ប្រវែងអប្បបរមា", 100, 20000),
    max_khmer_chars: num(d.max_khmer_chars, "ប្រវែងអតិបរមា", 100, 20000),
  });
  if (out.min_khmer_chars > out.max_khmer_chars) fail("ប្រវែងអប្បបរមា ធំជាងអតិបរមា");
  return out;
}

export const CLEAN = { services: cleanServices, accounts: cleanAccounts, promos: cleanPromos, clients: cleanClients, autopost: cleanAutopost };

// ---------- articles (Markdown with YAML front matter) ----------

export function parseArticle(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!m) return { data: {}, body: text };
  const data = YAML.parse(m[1]) || {};
  for (const k of ["date", "updated"]) if (data[k] instanceof Date) data[k] = data[k].toISOString().slice(0, 10);
  return { data, body: m[2] };
}

// Same style as the existing files: "quoted" strings, plain dates and booleans, ["flow", "lists"].
function yamlValue(k, v) {
  if (typeof v === "string") return (k === "date" || k === "updated") && DATE.test(v) ? v : JSON.stringify(v);
  if (typeof v === "boolean" || typeof v === "number") return String(v);
  if (v === null || v === undefined) return '""';
  if (Array.isArray(v) && v.every(x => typeof x === "string")) return `[${v.map(x => JSON.stringify(x)).join(", ")}]`;
  return JSON.stringify(v);  // JSON is valid YAML
}

export function serializeArticle(data, body) {
  const fm = Object.entries(data).map(([k, v]) => `${k}: ${yamlValue(k, v)}`).join("\n");
  return `---\n${fm}\n---\n${body.replace(/\r\n/g, "\n")}`;
}

export function cleanArticle(d, body, before, slug) {
  if (!isObj(d)) fail("ទិន្នន័យមិនត្រឹមត្រូវ");
  const kws = (Array.isArray(d.keywords) ? d.keywords : String(d.keywords || "").split(","))
    .map(k => String(k).trim()).filter(Boolean).slice(0, 20);
  const clean = {
    title: str(d.title, "ចំណងជើង", { required: true, max: 200 }),
    slug,
    summary: str(d.summary, "សេចក្តីសង្ខេប", { required: true, max: 500 }),
    tag: ARTICLE_TAGS.includes(d.tag) ? d.tag : fail("ប្រធានបទ: សូមជ្រើសរើស"),
    date: str(d.date, "កាលបរិច្ឆេទ", { required: true, re: DATE }),
    ...optional(before, { emoji: str(d.emoji, "Emoji", { max: 40 }), cover: img(d.cover, "រូបគម្រប"), draft: bool(d.draft) }),
  };
  const opt = {
    seo_title: str(d.seo_title, "SEO ចំណងជើង", { max: 120 }),
    seo_description: str(d.seo_description, "SEO ការពិពណ៌នា", { max: 300 }),
    primary_keyword: str(d.primary_keyword, "ពាក្យគន្លឹះចម្បង", { max: 120 }),
    image_alt: str(d.image_alt, "ការពិពណ៌នារូបភាព", { max: 200 }),
    updated: str(d.updated, "កាលបរិច្ឆេទកែប្រែ", { re: DATE }),
  };
  for (const [k, v] of Object.entries(opt)) if (v || (before && k in before)) clean[k] = v;
  if (kws.length || (before && "keywords" in before)) clean.keywords = kws;
  if (typeof body !== "string" || body.length > 100000) fail("អត្ថបទ: វែងពេក");
  // Hidden fields written by the auto-publisher (category, source, …) are kept as they were.
  return { data: keep(before, clean), body };
}

export function articleMeta(data) {
  return { title: data.title || "", date: data.date || "", tag: data.tag || "", draft: data.draft === true, source: data.source || "" };
}

// ---------- uploads ----------

const TYPES = { jpg: [0xff, 0xd8], jpeg: [0xff, 0xd8], png: [0x89, 0x50, 0x4e, 0x47], gif: [0x47, 0x49, 0x46], webp: [0x52, 0x49, 0x46, 0x46] };
export const MAX_UPLOAD = 5 * 1024 * 1024;

export function uploadPath(section, name, ext, now = new Date()) {
  const base = String(name || "").toLowerCase().replace(/\.[a-z0-9]+$/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "image";
  const rand = Array.from(crypto.getRandomValues(new Uint8Array(3)), b => b.toString(16).padStart(2, "0")).join("");
  const dir = section === "clients" ? "assets/uploads/clients" : `assets/uploads/admin/${now.toISOString().slice(0, 7)}`;
  return `${dir}/${base}-${rand}.${ext}`;
}

export function checkImage(name, bytes) {
  const ext = String(name || "").toLowerCase().split(".").pop();
  const magic = TYPES[ext];
  if (!magic) fail("រូបភាព: ប្រើតែ JPG, PNG, WEBP ឬ GIF");
  if (bytes.length > MAX_UPLOAD) fail("រូបភាព: ធំពេក (អតិបរមា 5 MB)");
  if (!magic.every((b, i) => bytes[i] === b)) fail("រូបភាព: ឯកសារមិនមែនជារូបភាពពិត");
  return ext === "jpeg" ? "jpg" : ext;
}

// Replace "upload:N" placeholders anywhere in the data with the final website paths.
export function fillUploads(value, paths) {
  if (typeof value === "string") {
    const m = /^upload:(\d+)$/.exec(value);
    if (!m) return value;
    if (!paths[m[1]]) fail("រូបភាពបាត់");
    return paths[m[1]];
  }
  if (Array.isArray(value)) return value.map(v => fillUploads(v, paths));
  if (isObj(value)) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fillUploads(v, paths)]));
  return value;
}
