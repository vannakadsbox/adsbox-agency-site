// Animated scene templates for the ADS BOX knowledge videos (motion graphics, no stock footage).
// Each scene of a script has "visual": {"type": ..., ...}. Every element appears when the narration reaches it:
// T(j) = the moment subtitle line j starts, F(x) = a fraction x of the scene's speech.
// Brand: navy #0b1430, blue #3f7dff, yellow #ffd23f, white; Khmer type MiSans Khmer.

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const A = (name, t, d = 0.55, ease = "cubic-bezier(.2,.9,.25,1)", fill = "both", extra = "") =>
  `animation:${name} ${d}s ${ease} ${Math.max(0, t).toFixed(3)}s ${fill}${extra}`;

// --- Small pictures (flat, in brand colours) ----------------------------------------------------------------------
const ICON = {
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/>',
  down: '<path d="M12 4v15M5 12l7 7 7-7"/>',
  arrow: '<path d="M12 4v15M5 12l7 7 7-7"/>',
  bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  chat: '<path d="M21 12a8.5 8.5 0 0 1-12.6 7.4L3 21l1.6-5.2A8.5 8.5 0 1 1 21 12z"/>',
  printer: '<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/>',
  tag: '<path d="M20 12l-8 8-9-9V3h8z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  live: '<circle cx="12" cy="12" r="3"/><path d="M5.6 5.6a9 9 0 0 0 0 12.8M18.4 5.6a9 9 0 0 1 0 12.8"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
};
const icon = (n, size = 48, color = "currentColor", sw = 2.6) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[n]}</svg>`;

const PEOPLE = [["#3f7dff", "#f1c6a0", "#2b1d16"], ["#ff8a5c", "#e8b48c", "#1c1410"], ["#2ed39a", "#f3cfac", "#3a2a20"],
  ["#b07cff", "#d9a77f", "#161010"], ["#ffd23f", "#f0c29a", "#2a1a12"]];
const person = (k, size = 120) => {
  const [shirt, skin, hair] = PEOPLE[k % PEOPLE.length];
  return `<svg width="${size}" height="${size * 1.15}" viewBox="0 0 100 115" aria-hidden="true"><path d="M12 115c2-28 18-42 38-42s36 14 38 42z" fill="${shirt}"/>
<circle cx="50" cy="40" r="22" fill="${skin}"/><path d="M27 40c-2-20 10-30 23-30s26 9 23 30c-4-10-12-15-23-15s-19 5-23 15z" fill="${hair}"/></svg>`;
};
const scooter = () => `<svg width="420" height="280" viewBox="0 0 420 280" aria-hidden="true">
<rect x="210" y="40" width="130" height="110" rx="10" fill="#c98b4a"/><rect x="210" y="40" width="130" height="24" fill="#b37538"/><rect x="266" y="40" width="18" height="110" fill="#e9c08a"/>
<path d="M70 210h230c20 0 30-20 30-40v-20H150l-40-80H80l30 80c-30 0-50 25-50 60z" fill="#ffd23f"/>
<path d="M100 70h40" stroke="#0b1430" stroke-width="12" stroke-linecap="round"/><rect x="150" y="135" width="120" height="20" rx="10" fill="#0b1430"/>
<circle cx="95" cy="225" r="42" fill="#0b1430"/><circle cx="95" cy="225" r="16" fill="#9aa6cf"/><circle cx="315" cy="225" r="42" fill="#0b1430"/><circle cx="315" cy="225" r="16" fill="#9aa6cf"/></svg>`;
const calendar = () => `<svg width="300" height="320" viewBox="0 0 300 320" aria-hidden="true"><rect x="10" y="30" width="280" height="280" rx="34" fill="#fff"/>
<path d="M10 64a34 34 0 0 1 34-34h212a34 34 0 0 1 34 34v46H10z" fill="#ff5d6c"/><rect x="70" y="10" width="20" height="56" rx="10" fill="#0b1430"/><rect x="210" y="10" width="20" height="56" rx="10" fill="#0b1430"/>
${[0, 1, 2, 3].map((r) => [0, 1, 2, 3, 4].map((c) => `<rect x="${40 + c * 46}" y="${140 + r * 40}" width="30" height="24" rx="6" fill="${r === 3 && c === 4 ? "#ffd23f" : "#e3e8f6"}"/>`).join("")).join("")}</svg>`;
const clockSvg = (t, d) => `<svg width="300" height="300" viewBox="0 0 300 300" aria-hidden="true"><circle cx="150" cy="150" r="140" fill="#fff"/><circle cx="150" cy="150" r="140" fill="none" stroke="#ffd23f" stroke-width="14"/>
${Array.from({ length: 12 }, (_, i) => `<rect x="146" y="22" width="8" height="${i % 3 ? 16 : 30}" rx="4" fill="#0b1430" transform="rotate(${i * 30} 150 150)"/>`).join("")}
<rect x="144" y="70" width="12" height="86" rx="6" fill="#0b1430" style="transform-origin:150px 150px;${A("spinH", t, d, "linear")}"/>
<rect x="146" y="40" width="8" height="116" rx="4" fill="#ff5d6c" style="transform-origin:150px 150px;${A("spinM", t, d, "linear")}"/><circle cx="150" cy="150" r="14" fill="#0b1430"/></svg>`;

// --- ADS BOX characters (always drawn the same way, so the videos are recognisable) -----------------------------
// Seller "Sreyka": black ponytail, yellow top with navy collar. Customers: blue / coral / green tops.
const FACE = { happy: '<path d="M88 112q12 10 24 0" stroke="#3a2418" stroke-width="5" fill="none" stroke-linecap="round"/>',
  worried: '<path d="M88 118q12-8 24 0" stroke="#3a2418" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M80 82l14 4M120 82l-14 4" stroke="#2b1d16" stroke-width="5" stroke-linecap="round"/>',
  neutral: '<path d="M90 114h20" stroke="#3a2418" stroke-width="5" stroke-linecap="round"/>' };
function seller(mood = "happy", w = 300, hold = "phone") {
  return `<svg width="${w}" height="${w * 1.4}" viewBox="0 0 200 280" aria-hidden="true">
<path d="M150 70c22 10 26 60 6 92" stroke="#1a1210" stroke-width="22" fill="none" stroke-linecap="round"/>
<path d="M30 280c4-64 30-92 70-92s66 28 70 92z" fill="#ffd23f"/><path d="M78 190l22 22 22-22" fill="#0b1430"/>
<rect x="88" y="150" width="24" height="34" rx="10" fill="#e9b48f"/>
<ellipse cx="100" cy="100" rx="46" ry="52" fill="#f1c6a0"/>
<path d="M54 100c-6-50 20-70 46-70s54 18 46 70c-6-26-24-40-46-40s-40 14-46 40z" fill="#1a1210"/>
<circle cx="84" cy="96" r="5" fill="#2b1d16"/><circle cx="116" cy="96" r="5" fill="#2b1d16"/>
<circle cx="74" cy="112" r="7" fill="#ffb3a0" opacity=".6"/><circle cx="126" cy="112" r="7" fill="#ffb3a0" opacity=".6"/>${FACE[mood] || FACE.happy}
${hold === "phone" ? '<path d="M150 230q30-30 18-70" stroke="#ffd23f" stroke-width="26" fill="none" stroke-linecap="round"/><rect x="150" y="128" width="40" height="66" rx="8" fill="#0b1430"/><rect x="155" y="135" width="30" height="50" rx="4" fill="#3f7dff"/>' : ""}
${hold === "box" ? '<rect x="58" y="214" width="84" height="62" rx="6" fill="#c98b4a"/><rect x="58" y="214" width="84" height="14" fill="#b37538"/><rect x="92" y="214" width="16" height="62" fill="#e9c08a"/>' : ""}</svg>`;
}
function customer(k = 0, w = 200) {
  const tops = ["#3f7dff", "#ff8a5c", "#2ed39a"], hair = ["#2b1d16", "#3a2a20", "#161010"];
  return `<svg width="${w}" height="${w * 1.3}" viewBox="0 0 200 260" aria-hidden="true"><path d="M30 260c4-60 30-86 70-86s66 26 70 86z" fill="${tops[k % 3]}"/>
<rect x="88" y="140" width="24" height="34" rx="10" fill="#e8b48c"/><ellipse cx="100" cy="96" rx="44" ry="50" fill="#f3cfac"/>
<path d="M56 96c-4-44 18-64 44-64s50 18 44 64c-6-22-22-34-44-34s-38 12-44 34z" fill="${hair[k % 3]}"/>
<circle cx="85" cy="94" r="5" fill="#2b1d16"/><circle cx="115" cy="94" r="5" fill="#2b1d16"/><path d="M90 112q10 8 20 0" stroke="#3a2418" stroke-width="5" fill="none" stroke-linecap="round"/>
<rect x="128" y="176" width="34" height="58" rx="7" fill="#0b1430"/></svg>`;
}

// --- Templates -------------------------------------------------------------------------------------------------
function header(sc, x) {
  if (!sc.keyword) return "";
  return `<div class="hd" style="${A("rise", x.start + 0.2)}">${sc.label ? `<span class="lbl">${esc(sc.label)}</span>` : ""}
<h2>${esc(sc.keyword)}</h2><i class="ul" style="${A("drawX", x.start + 0.55, 0.5)}"></i></div>`;
}

const V = {};

V.question = (v, x) => {
  const bubbles = v.bubbles || [];
  const t0 = x.F(0.02), step = Math.max(0.35, (x.F(0.75) - t0) / Math.max(1, bubbles.length));
  const qs = [[60, 140, 150], [770, 220, 120], [690, 760, 170], [40, 820, 110]];
  return `<div class="q-title" style="${A("popIn", x.T(x.n - 1), 0.6, "cubic-bezier(.3,1.5,.5,1)")}"><span>${esc(v.title)}</span></div>
${qs.map(([l, t, s], i) => `<div class="qmark" style="left:${l}px;top:${t}px;font-size:${s}px;${A("popIn", t0 + i * 0.25, 0.5)},float 3s ease-in-out ${(i * 0.4).toFixed(1)}s infinite">?</div>`).join("")}
<div class="phone" style="${A("rise", x.start + 0.1, 0.7)}"><div class="ph-top">${person(0, 64)}<div><b>អតិថិជន</b><small>Messenger</small></div>
<span class="badge" style="--to:${bubbles.length};${A("count", t0, step * bubbles.length, `steps(${bubbles.length})`)}"></span></div>
<div class="ph-body">${bubbles.map((b, i) => `<div class="bub in" style="${A("bubIn", t0 + i * step, 0.4, "cubic-bezier(.3,1.4,.5,1)")}">${esc(b)}</div>`).join("")}</div></div>`;
};

V.chat = (v, x) => {  // screen demo: a Messenger-style chat between customer and shop, one message per beat
  const msgs = v.messages || [];
  const t0 = x.F(0.02), step = Math.max(0.5, (x.F(0.85) - t0) / Math.max(1, msgs.length));
  return `${header(x.sc, x)}<div class="phone chatp" style="${A("rise", x.start + 0.15, 0.7)}"><div class="ph-top">${person(1, 64)}<div><b>${esc(v.with || "អតិថិជន")}</b><small>Messenger</small></div></div>
<div class="ph-body">${msgs.map((m, i) => `<div class="bub${m.from === "shop" ? " me" : ""}" style="${A("bubIn", t0 + i * step, 0.4, "cubic-bezier(.3,1.4,.5,1)")}">${esc(m.text)}</div>`).join("")}</div></div>`;
};

V.leaving = (v, x) => {
  const pos = [[20, 40], [740, 20], [0, 470], [770, 450], [760, 760]];
  return `<div class="post-c" style="${A("rise", x.start + 0.3, 0.6)}"><div class="pc-top"><span class="shop">ហ</span><b>ហាងគំរូ</b></div>
<div class="pc-img"></div><b class="pc-t">${esc(v.post_title || "អាវយឺត")}</b>
<div class="pc-price"><span>${esc(v.confusing)}</span><i class="squig" style="${A("drawX", x.T(0) + 0.6, 0.5)}"></i></div></div>
${pos.map(([l, t], i) => `<div class="cust" style="left:${l}px;top:${t}px;${A("popIn", x.start + 0.5 + i * 0.12, 0.5)}">
<div class="cq" style="${A("popIn", x.T(Math.min(1, x.n - 1)) + i * 0.12, 0.4)}">?</div>
<div style="${A(i % 2 ? "leaveR" : "leaveL", x.T(x.n - 1) + i * 0.12, 0.9, "cubic-bezier(.5,0,.75,0)")}">${person(i, 130)}</div></div>`).join("")}
<div class="warn" style="${A("rise", x.T(x.n - 1) + 0.4)}">${icon("down", 46, "#fff", 3)}<span>${esc(v.caption)}</span></div>`;
};

V.dashboard = (v, x) => {
  const m = (v.metrics || []).slice(0, 3);
  const bars = [62, 80, 54, 88, 70, 96, 74];
  const num = (s) => { const mm = String(s).match(/^(\$?)(\d+)$/); return mm ? { pre: mm[1], n: +mm[2] } : null; };
  return `${header({ keyword: v.title }, x)}<div class="dash" style="${A("rise", x.start + 0.35, 0.6)}">
<div class="dh"><span class="dot"></span><b>Boost Post</b><small>ឧទាហរណ៍ · មិនមែនទិន្នន័យពិត</small></div>
<div class="tiles">${m.map((t, i) => { const c = num(t.value); return `<div class="tile" style="${A("rise", x.start + 0.6 + i * 0.18)}"><small>${esc(t.label)}</small>
${c ? `<b class="cnt" data-pre="${esc(c.pre)}" style="--to:${c.n};${A("count", x.start + 0.7 + i * 0.18, 1.2, "cubic-bezier(.2,.7,.3,1)")}"></b>` : `<b>${esc(t.value)}</b>`}</div>`; }).join("")}</div>
<div class="bars">${bars.map((h, i) => `<i style="height:${h}%;${A("barUp", x.start + 0.8 + i * 0.08, 0.6)}"></i>`).join("")}</div></div>
<div class="alert" style="${A("shakeIn", x.T(Math.min(1, x.n - 1)), 0.6)}">${icon("alert", 50, "#fff", 2.4)}<span>${esc(v.alert)}</span></div>
${v.next ? `<div class="next" style="${A("rise", x.T(x.n - 1))}">${[1, 2, 3, 4].map((k, i) => `<b style="${A("popIn", x.T(x.n - 1) + 0.2 + i * 0.12, 0.4)}">${"០១២៣៤"[k]}</b>`).join("")}<span>${esc(v.next)}</span></div>` : ""}`;
};

V.compare = (v, x) => {
  const tb = x.start + 0.6, tg = x.T(x.n - 1);
  return `${header(x.sc, x)}<div class="cmp">
<div class="card bad" style="${A("slideL", tb, 0.55)}"><div class="tag">${icon("x", 40, "#fff", 3.2)}<span>មិនច្បាស់</span></div><p>${esc(v.bad)}</p>
<i class="strike" style="${A("drawX", tg - 0.15, 0.4)}"></i></div>
<div class="arrowd" style="${A("popIn", tg, 0.4)}">${icon("arrow", 70, "#ffd23f", 3)}</div>
<div class="card good" style="${A("slideR", tg + 0.05, 0.6, "cubic-bezier(.3,1.3,.5,1)")}"><div class="tag">${icon("check", 40, "#0b1430", 3.4)}<span>ច្បាស់</span></div><p>${esc(v.good)}</p>
<div class="stamp" style="${A("stamp", tg + 0.6, 0.45)}">${icon("check", 70, "#fff", 3.4)}</div></div></div>`;
};

V.checklist = (v, x) => {
  const items = v.items || [];
  const t1 = v.mark === "x" ? x.F(0.02) : x.T(Math.min(1, x.n - 1)), span = Math.max(0.6, x.F(0.95) - t1), step = span / Math.max(1, items.length);
  return `${header(x.sc, x)}${v.bad ? `<div class="badline cl" style="${A("rise", x.T(0) + 0.3)}"><span>${esc(v.bad)}</span><i class="strike" style="${A("drawX", t1 - 0.1, 0.4)}"></i></div>` : ""}
<div class="list${v.bad ? " lb" : ""}">${items.map((it, i) => `<div class="li" style="${A("slideR", t1 + i * step, 0.5)}"><span class="ck${v.mark === "x" ? " ckx" : ""}" style="${A("popIn", t1 + i * step + 0.25, 0.4)}">${v.mark === "x" ? icon("x", 40, "#fff", 3.4) : icon("check", 40, "#0b1430", 3.4)}</span><p>${esc(it)}</p></div>`).join("")}</div>`;
};

V.deadline = (v, x) => `${header(x.sc, x)}<div class="dl-art"><div style="${A("popIn", x.start + 0.4, 0.6)}">${calendar()}</div>
<div style="${A("popIn", x.start + 0.6, 0.6)}">${clockSvg(x.start + 0.6, x.dur)}</div></div>
<div class="badline" style="${A("rise", x.T(0) + 0.2)}"><span>${esc(v.bad)}</span><i class="strike" style="${A("drawX", x.T(Math.min(1, x.n - 1)) - 0.1, 0.4)}"></i></div>
<div class="goodline" style="${A("popIn", x.T(Math.min(1, x.n - 1)) + 0.15, 0.55, "cubic-bezier(.3,1.5,.5,1)")}">${esc(v.good)}</div>
${v.result ? `<div class="result" style="${A("rise", x.T(x.n - 1))}">${icon("bolt", 46, "#0b1430", 2.6)}<span>${esc(v.result)}</span></div>` : ""}`;

V.delivery = (v, x) => {
  const rows = v.rows || [];
  const tr = x.T(Math.min(1, x.n - 1)), tt = x.T(x.n - 1);
  return `${header(x.sc, x)}<div class="road"><div class="scoot" style="${A("drive", x.start + 0.3, 1.4, "cubic-bezier(.2,.8,.3,1)")}">${scooter()}</div></div>
<div class="rcpt" style="${A("rise", tr - 0.15)}">${rows.map((r, i) => `<div class="row" style="${A("rise", tr + i * 0.35)}"><span>${esc(r.label)}</span><i></i><b>${esc(r.value)}</b></div>`).join("")}
${v.total ? `<div class="total" style="${A("popIn", tt + 0.1, 0.6, "cubic-bezier(.3,1.5,.5,1)")}"><span>${esc(v.total.label)}</span><b>${esc(v.total.value)}</b></div>` : ""}</div>`;
};

V.caption = (v, x) => {
  const lines = v.lines || [];
  const t0 = x.F(0.02), step = Math.max(0.35, (x.F(0.8) - t0) / Math.max(1, lines.length));
  const hi = (s) => (v.highlight || []).reduce((h, w) => h.split(esc(w)).join(`<mark>${esc(w)}</mark>`), esc(s));
  return `${header(x.sc, x)}<div class="post" style="${A("rise", x.start + 0.3, 0.6)}"><div class="pc-top"><span class="shop">ហ</span><div><b>${esc(v.page || "ហាងគំរូ")}</b><small>ឥឡូវនេះ</small></div></div>
<div class="pl">${lines.map((l, i) => `<p style="${A("rise", t0 + i * step, 0.45)}">${hi(l)}</p>`).join("")}</div>
${v.stamp ? `<div class="stamp2" style="${A("stamp", x.T(x.n - 1) + 0.2, 0.5)}">${icon("check", 44, "#fff", 3.2)}<span>${esc(v.stamp)}</span></div>` : ""}</div>`;
};

V.takeaway = (v, x) => `${header(x.sc, x)}<div class="tk" style="${A("rise", x.start + 0.4, 0.7)}"><div class="qq">“</div>
<p>${esc(v.quote)}</p><i class="ul2" style="${A("drawX", x.T(x.n - 1), 0.7)}"></i>
<div class="eye" style="${A("popIn", x.T(0) + 0.4, 0.5)}">${icon("eye", 64, "#0b1430", 2.4)}</div></div>`;

V.cta = (v, x, b64) => {
  const t1 = x.T(Math.min(1, x.n - 1)), tu = x.T(x.n - 1);
  if (!(v.services || []).length) {  // follow mode: education first, no service list
    return `<div class="cta-card fol" style="${A("rise", x.start + 0.2, 0.65)}">
<div class="cc-top"><img src="data:image/png;base64,${b64("assets/logo-mark.png")}" alt=""><div><b>ADS BOX</b><small>គន្លឹះលក់អនឡាញថ្មីៗ រាល់ថ្ងៃ</small></div></div>
${["គន្លឹះលក់អនឡាញ", "Boost និងផ្សាយពាណិជ្ជកម្ម", "លក់ Live"].map((s, i) => `<div class="cc-row" style="${A("slideR", t1 + i * 0.22, 0.5)}"><span class="ck">${icon("check", 40, "#0b1430", 3.4)}</span><b class="kh">${esc(s)}</b></div>`).join("")}</div>
<div class="cta-url" style="${A("popIn", tu, 0.55, "cubic-bezier(.3,1.5,.5,1)")}"><span class="fbtn" style="${A("pulse", tu + 0.6, 1.1, "ease-in-out", "both", " infinite")}">+ Follow ADS BOX</span></div>`;
  }
  return `<div class="cta-card" style="${A("rise", x.start + 0.2, 0.65)}">
<div class="cc-top"><img src="data:image/png;base64,${b64("assets/logo-mark.png")}" alt=""><div><b>ADS BOX</b><small>ក្រុមជំនាញផ្សាយពាណិជ្ជកម្មអនឡាញ</small></div></div>
${(v.services || []).map((s, i) => `<div class="cc-row" style="${A("slideR", t1 + i * 0.22, 0.5)}"><span class="ck">${icon("check", 40, "#0b1430", 3.4)}</span><b>${esc(s)}</b></div>`).join("")}</div>
<div class="cta-url" style="${A("popIn", tu, 0.55, "cubic-bezier(.3,1.5,.5,1)")}"><span style="${A("pulse", tu + 0.6, 1.1, "ease-in-out", "both", " infinite")}">${esc(v.url || "adsbox.agency")}</span>
<svg class="tap" width="110" height="110" viewBox="0 0 24 24" fill="#fff" stroke="#0b1430" stroke-width="1.2" style="${A("tap", tu + 0.5, 1.1, "ease-in-out", "both", " infinite")}" aria-hidden="true"><path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V10l4.2.8a2 2 0 0 1 1.6 2.3l-.9 4.6A3 3 0 0 1 14 20H11a3 3 0 0 1-2.4-1.2L5.3 14.4a1.4 1.4 0 0 1 2-2z"/></svg></div>`;
};

// Illustrated storytelling: the ADS BOX seller in a scene (Live, desk or packing), with comments / bubbles per beat.
V.story = (v, x) => {
  const bub = v.bubbles || [];
  const t0 = x.F(0.05), step = Math.max(0.3, (x.F(0.8) - t0) / Math.max(1, bub.length));
  const props = {
    live: `<div class="st-ring"></div><div class="st-live" style="${A("popIn", x.start + 0.5, 0.4)}">${icon("live", 34, "#fff", 2.6)}<b>LIVE</b></div>`,
    desk: `<div class="st-desk"></div><div class="st-laptop"></div>`,
    packing: `<div class="st-desk"></div><div class="st-boxes">${[0, 1, 2].map((i) => `<i style="${A("popIn", x.F(0.3) + i * 0.3, 0.4)}"></i>`).join("")}</div>`,
  }[v.scene || "live"] || "";
  return `${v.title ? `<div class="q-title" style="${A("popIn", x.T(x.n - 1), 0.6, "cubic-bezier(.3,1.5,.5,1)")}"><span>${esc(v.title)}</span></div>` : header(x.sc, x)}
<div class="story s-${esc(v.scene || "live")}">${props}
<div class="st-seller" style="${A("rise", x.start + 0.2, 0.7)}">${seller(v.mood || "happy", 470, v.scene === "packing" ? "box" : "phone")}</div>
${v.customer ? `<div class="st-cust" style="${A("slideR", x.F(0.35), 0.6)}">${customer(0, 230)}</div>` : ""}
<div class="st-bubs">${bub.map((b, i) => `<div class="st-b" style="left:${[8, 52, 22, 60, 30][i % 5]}%;${A("flyUp", t0 + i * step, 2.2, "cubic-bezier(.2,.7,.3,1)")}">${esc(b)}</div>`).join("")}</div></div>`;
};

// Motion graphics: steps joined by a line, each one lighting up as it is said.
V.flow = (v, x) => {
  const steps = v.steps || [];
  const t0 = x.F(0.02), step = Math.max(0.6, (x.F(0.9) - t0) / Math.max(1, steps.length));
  const icons = ["tag", "chat", "list", "printer", "check"];
  return `${header(x.sc, x)}<div class="flow"><i class="fl-line" style="${A("growY", t0, step * steps.length, "linear")}"></i>
${steps.map((st, i) => `<div class="fl-s" style="${A("slideR", t0 + i * step, 0.5)}"><span class="fl-i">${icon(st.icon || icons[i % icons.length], 46, "#0b1430", 2.6)}</span><div><small>${esc(st.label || "")}</small><p>${esc(st.text)}</p></div></div>`).join("")}</div>`;
};

// Product / dashboard demo: an order list filling in (always labelled as an example, never real data).
V.orders = (v, x) => {
  const rows = v.rows || [];
  const t0 = x.F(0.1), step = Math.max(0.4, (x.F(0.8) - t0) / Math.max(1, rows.length));
  return `${header(x.sc, x)}<div class="ord" style="${A("rise", x.start + 0.3, 0.6)}"><div class="dh"><span class="dot"></span><b>${esc(v.title || "បញ្ជី Order")}</b><small>ឧទាហរណ៍ · មិនមែនទិន្នន័យពិត</small></div>
<div class="or-h"><span>អតិថិជន</span><span>កូដ</span><span>ចំនួន</span><span></span></div>
${rows.map((r, i) => `<div class="or-r" style="${A("slideR", t0 + i * step, 0.45)}"><span>${esc(r.name)}</span><b>${esc(r.code)}</b><span>${esc(r.qty)}</span><em style="${A("popIn", t0 + i * step + 0.35, 0.35)}">${icon("check", 30, "#fff", 3.4)}</em></div>`).join("")}</div>`;
};

// Product demo: a shipping sticker printing out of the printer.
V.sticker = (v, x) => `${header(x.sc, x)}<div class="prn" style="${A("rise", x.start + 0.3, 0.6)}">${icon("printer", 110, "#0b1430", 1.8)}</div>
<div class="stk" style="${A("printOut", x.F(0.15), 1.4, "cubic-bezier(.2,.8,.3,1)")}"><div class="stk-h"><b>ADS BOX</b><small>ស្ទីគ័រដឹកជញ្ជូន · ឧទាហរណ៍</small></div>
<p><small>ឈ្មោះ</small>${esc(v.name)}</p><p><small>ទូរស័ព្ទ</small>${esc(v.phone)}</p><p><small>អាសយដ្ឋាន</small>${esc(v.address)}</p><p class="it"><small>ទំនិញ</small>${esc(v.items)}</p>
<div class="bar"></div></div>`;

const TYPES = Object.keys(V);

const CSS = `
.hd{position:absolute;left:0;right:0;top:0;display:flex;flex-direction:column;align-items:flex-start;gap:14px}
.hd .lbl{font-size:40px;font-weight:700;color:#0b1430;background:#ffd23f;padding:6px 26px;border-radius:14px}
.hd h2{font-size:70px;line-height:1.45;font-weight:700}
.hd .ul{display:block;width:180px;height:12px;border-radius:12px;background:#ffd23f;transform-origin:left}
.q-title{position:absolute;left:0;right:0;top:0;text-align:center;z-index:3}
.q-title span{display:inline-block;font-size:96px;font-weight:700;line-height:1.4;color:#0b1430;background:#ffd23f;padding:6px 40px 16px;border-radius:28px;box-shadow:0 26px 60px rgba(0,0,0,.35)}
.qmark{position:absolute;font-family:L,sans-serif;font-weight:800;color:#ffd23f;opacity:.9;text-shadow:0 10px 30px rgba(0,0,0,.3)}
.phone{position:absolute;left:180px;top:190px;width:540px;height:780px;border-radius:70px;background:#0e1838;border:14px solid #1d2a57;box-shadow:0 40px 90px rgba(0,0,0,.45);overflow:hidden}
.ph-top{display:flex;align-items:center;gap:16px;padding:26px 28px;background:#fff;color:#0b1430;position:relative}
.ph-top b{display:block;font-size:38px}.ph-top small{font-family:L,sans-serif;font-size:28px;color:#6a7495}
.badge{position:absolute;right:26px;top:30px;width:64px;height:64px;border-radius:50%;background:#ff5d6c;color:#fff;display:grid;place-items:center;font-family:L,M,sans-serif;font-weight:800;font-size:34px;counter-reset:n var(--n)}
.badge::after{content:counter(n)}
.ph-body{padding:26px 22px;display:flex;flex-direction:column;gap:18px;background:#eef2fb;height:100%}
.chatp{top:250px;height:740px;left:90px;width:720px}
.bub.me{align-self:flex-end;background:#3f7dff;color:#fff;border-radius:30px 30px 8px 30px}
.bub{align-self:flex-start;max-width:94%;font-size:44px;font-weight:500;line-height:1.5;color:#0b1430;background:#fff;padding:12px 26px 16px;border-radius:30px 30px 30px 8px;box-shadow:0 6px 16px rgba(11,20,48,.08)}
.post-c,.post{position:absolute;left:150px;top:150px;width:600px;background:#fff;color:#0b1430;border-radius:36px;padding:28px;box-shadow:0 36px 80px rgba(0,0,0,.4)}
.pc-top{display:flex;align-items:center;gap:16px;margin-bottom:18px}.pc-top b{font-size:40px;display:block}.pc-top small{font-size:30px;color:#6a7495}
.shop{width:70px;height:70px;border-radius:50%;background:#3f7dff;color:#fff;display:grid;place-items:center;font-size:38px;font-weight:700}
.pc-img{height:300px;border-radius:24px;background:linear-gradient(135deg,#ffe7a3,#ffd23f 50%,#ffb84d);margin-bottom:18px;position:relative}
.pc-img::after{content:"";position:absolute;left:50%;top:50%;width:170px;height:190px;margin:-95px 0 0 -85px;background:#fff;border-radius:30px 30px 18px 18px;clip-path:polygon(25% 0,75% 0,100% 18%,88% 34%,80% 28%,80% 100%,20% 100%,20% 28%,12% 34%,0 18%)}
.pc-t{font-size:44px;display:block;margin-bottom:8px}
.pc-price{position:relative;display:inline-block;font-size:42px;font-weight:700;color:#d6334a}
.squig{position:absolute;left:0;right:0;bottom:-6px;height:8px;background:repeating-linear-gradient(90deg,#ff5d6c 0 14px,transparent 14px 22px);transform-origin:left}
.cust{position:absolute;display:flex;flex-direction:column;align-items:center}
.cq{width:62px;height:62px;border-radius:50%;background:#fff;color:#0b1430;font-family:L,sans-serif;font-weight:800;font-size:40px;display:grid;place-items:center;margin-bottom:-6px;box-shadow:0 8px 20px rgba(0,0,0,.25)}
.warn,.alert,.result{position:absolute;left:0;right:0;margin:0 auto;width:max-content;bottom:0;display:flex;align-items:center;gap:18px;white-space:nowrap;font-size:48px;font-weight:700;padding:16px 36px 22px;border-radius:24px;background:#ff5d6c;color:#fff;box-shadow:0 20px 50px rgba(0,0,0,.35)}
.result{background:#ffd23f;color:#0b1430}
.dash{position:absolute;left:30px;right:30px;top:250px;background:#fff;color:#0b1430;border-radius:36px;padding:30px;box-shadow:0 36px 80px rgba(0,0,0,.4)}
.dh{display:flex;align-items:center;gap:14px;font-family:L,M,sans-serif}.dh b{font-size:38px}.dh small{margin-left:auto;font-size:30px;color:#6a7495}
.dot{width:18px;height:18px;border-radius:50%;background:#2ed39a}
.tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin-top:24px}
.tile{background:#eef2fb;border-radius:22px;padding:18px 20px}.tile small{display:block;font-size:36px;color:#4a557a}
.tile b{font-family:L,M,sans-serif;font-size:66px;font-weight:800}
.cnt{counter-reset:n var(--n)}.cnt::after{content:attr(data-pre) counter(n)}
.bars{display:flex;align-items:flex-end;gap:16px;height:220px;margin-top:28px}
.bars i{flex:1;background:linear-gradient(#3f7dff,#1f4fd1);border-radius:12px 12px 4px 4px;transform-origin:bottom}
.alert{bottom:auto;top:790px;background:#ff5d6c}
.next{position:absolute;left:0;right:0;bottom:0;display:flex;align-items:center;justify-content:center;gap:14px}
.next b{width:76px;height:76px;border-radius:22px;background:#ffd23f;color:#0b1430;display:grid;place-items:center;font-size:44px}
.next span{font-size:46px;font-weight:700;margin-left:10px}
.cmp{position:absolute;left:0;right:0;top:250px;display:flex;flex-direction:column;align-items:stretch;gap:26px}
.card{position:relative;border-radius:34px;padding:30px 36px 38px;box-shadow:0 30px 70px rgba(0,0,0,.35)}
.card .tag{display:inline-flex;align-items:center;gap:12px;font-size:34px;font-weight:700;padding:6px 20px 10px;border-radius:14px;margin-bottom:14px}
.card p{font-size:60px;line-height:1.5;font-weight:700}
.bad{background:#fff;color:#0b1430}.bad .tag{background:#ff5d6c;color:#fff}
.good{background:#ffd23f;color:#0b1430}.good .tag{background:#0b1430;color:#ffd23f}
.strike{position:absolute;left:30px;right:30px;top:58%;height:10px;border-radius:10px;background:#ff5d6c;transform-origin:left;transform:rotate(-3deg)}
.arrowd{align-self:center;margin:-10px 0}
.stamp{position:absolute;right:-18px;top:-30px;width:120px;height:120px;border-radius:50%;background:#2ed39a;display:grid;place-items:center;box-shadow:0 14px 34px rgba(0,0,0,.3)}
.badline{position:absolute;left:0;top:585px;display:inline-block;font-size:52px;font-weight:700;color:#c9d3f5;padding:8px 28px 14px;border:4px dashed rgba(255,255,255,.35);border-radius:20px}
.badline .strike{left:14px;right:14px;top:52%}
.goodline{position:absolute;left:0;right:0;top:730px;font-size:64px;font-weight:700;color:#0b1430;background:#ffd23f;padding:14px 34px 22px;border-radius:26px;text-align:center;box-shadow:0 26px 60px rgba(0,0,0,.35)}
.dl-art{position:absolute;left:0;right:0;top:250px;display:flex;justify-content:center;gap:60px}
.list{position:absolute;left:0;right:0;top:300px;display:flex;flex-direction:column;gap:22px}.list.lb{top:420px}
.badline.cl{top:250px}
.li{display:flex;align-items:center;gap:24px;background:#fff;color:#0b1430;border-radius:28px;padding:22px 30px 28px;box-shadow:0 20px 50px rgba(0,0,0,.3)}
.li p{font-size:52px;font-weight:700;line-height:1.45}
.ck{flex:none;width:70px;height:70px;border-radius:20px;background:#ffd23f;display:grid;place-items:center}
.road{position:absolute;left:-90px;right:-90px;top:220px;height:280px;overflow:hidden}
.road::after{content:"";position:absolute;left:0;right:0;bottom:12px;height:10px;background:repeating-linear-gradient(90deg,rgba(255,255,255,.5) 0 60px,transparent 60px 100px)}
.scoot{position:absolute;left:350px;top:10px;transform-origin:left top;scale:.9}
.rcpt{position:absolute;left:40px;right:40px;top:520px;background:#fff;color:#0b1430;border-radius:34px;padding:30px 36px;box-shadow:0 30px 70px rgba(0,0,0,.4)}
.row{display:flex;align-items:baseline;gap:16px;font-size:52px;font-weight:700;padding:6px 0}.row i{flex:1;border-bottom:4px dotted #b9c3e3}
.row b,.total b{font-family:L,M,sans-serif;font-weight:800}
.total{display:flex;justify-content:space-between;align-items:center;gap:20px;margin-top:16px;background:#ffd23f;border-radius:22px;padding:16px 24px 22px;font-size:48px;font-weight:700}
.total b{font-size:64px}
.post{top:240px;left:0;width:900px;padding:34px 40px}
.pl p{font-size:52px;line-height:1.55;font-weight:500;padding:4px 0}
.pl mark{background:#ffd23f;color:#0b1430;padding:0 10px;border-radius:10px;font-weight:700}
.post .pl{padding-bottom:40px}
.stamp2{position:absolute;right:-20px;bottom:-56px;display:flex;align-items:center;gap:12px;background:#2ed39a;color:#fff;font-size:44px;font-weight:700;padding:14px 30px 20px;border-radius:24px;transform:rotate(-4deg);box-shadow:0 18px 40px rgba(0,0,0,.3)}
.tk{position:absolute;left:0;right:0;top:300px;background:#fff;color:#0b1430;border-radius:40px;padding:80px 60px 70px;box-shadow:0 36px 80px rgba(0,0,0,.4)}
.qq{position:absolute;left:40px;top:-70px;font-family:Georgia,serif;font-size:260px;line-height:1;color:#ffd23f}
.tk p{font-size:68px;line-height:1.55;font-weight:700}
.ul2{display:block;height:14px;width:70%;border-radius:14px;background:#ffd23f;transform-origin:left;margin-top:10px}
.eye{position:absolute;right:40px;top:-60px;width:120px;height:120px;border-radius:50%;background:#ffd23f;display:grid;place-items:center;box-shadow:0 14px 34px rgba(0,0,0,.3)}
.cta-card{position:absolute;left:30px;right:30px;top:60px;background:#fff;color:#0b1430;border-radius:40px;padding:40px 44px 30px;box-shadow:0 36px 80px rgba(0,0,0,.4)}
.cc-top{display:flex;align-items:center;gap:24px;padding-bottom:26px;margin-bottom:12px;border-bottom:3px solid #e6ebf7}
.cc-top img{width:110px}.cc-top b{display:block;font-family:L,M,sans-serif;font-size:60px;font-weight:800}.cc-top small{font-size:36px;color:#4a557a}
.cc-row{display:flex;align-items:center;gap:24px;padding:16px 0}.cc-row b{font-family:L,M,sans-serif;font-size:56px;font-weight:800}
.cc-row b.kh{font-family:M,L,sans-serif;font-size:50px;font-weight:700}
.fbtn{font-family:L,M,sans-serif;font-size:66px;font-weight:800;color:#0b1430;background:#ffd23f;padding:18px 54px 22px;border-radius:30px;box-shadow:0 24px 60px rgba(255,210,63,.35)}
.cta-url{position:absolute;left:0;right:0;top:740px;display:flex;justify-content:center}
.cta-url span{font-family:L,M,sans-serif;font-size:70px;font-weight:800;color:#0b1430;background:#ffd23f;padding:18px 60px 22px;border-radius:30px;box-shadow:0 24px 60px rgba(255,210,63,.35)}
.tap{position:absolute;left:735px;top:78px}
@keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}
@keyframes tap{0%,100%{transform:translate(0,0)}50%{transform:translate(-14px,-18px)}}
.ckx{background:#ff5d6c}
.story{position:absolute;left:-90px;right:-90px;top:200px;height:820px;overflow:visible}
.st-seller{position:absolute;left:290px;bottom:0}
.st-cust{position:absolute;right:60px;bottom:0}
.st-ring{position:absolute;left:240px;top:20px;width:600px;height:600px;border-radius:50%;border:26px solid rgba(255,255,255,.12);box-shadow:0 0 80px rgba(255,210,63,.25) inset}
.st-live{position:absolute;left:120px;top:60px;display:flex;align-items:center;gap:10px;background:#ff3b5c;padding:10px 24px;border-radius:16px;font-family:L,sans-serif;font-size:40px;font-weight:800}
.st-desk{position:absolute;left:0;right:0;bottom:0;height:90px;background:linear-gradient(#c98b4a,#a8713a);border-radius:18px 18px 0 0}
.st-laptop{position:absolute;left:140px;bottom:90px;width:220px;height:150px;background:#dfe5f3;border:10px solid #0b1430;border-radius:14px}
.st-boxes{position:absolute;right:110px;bottom:90px;display:flex;align-items:flex-end;gap:12px}
.st-boxes i{display:block;width:150px;height:120px;background:#c98b4a;border-radius:8px;box-shadow:inset 0 22px 0 #b37538}
.st-bubs{position:absolute;left:0;right:0;top:0;bottom:200px}
.st-b{position:absolute;bottom:0;font-family:L,M,sans-serif;font-size:42px;font-weight:800;color:#0b1430;background:#fff;padding:10px 26px 14px;border-radius:26px 26px 26px 8px;box-shadow:0 12px 30px rgba(0,0,0,.3);opacity:0}
.flow{position:absolute;left:0;right:0;top:230px;display:flex;flex-direction:column;gap:34px}
.fl-line{position:absolute;left:52px;top:40px;bottom:40px;width:8px;background:#ffd23f;border-radius:8px;transform-origin:top}
.fl-s{position:relative;display:flex;align-items:center;gap:26px}
.fl-i{flex:none;width:112px;height:112px;border-radius:30px;background:#ffd23f;display:grid;place-items:center;box-shadow:0 14px 34px rgba(0,0,0,.3)}
.fl-s small{display:block;font-size:34px;font-weight:700;color:#ffd23f}
.fl-s p{font-size:50px;font-weight:700;line-height:1.4;background:rgba(255,255,255,.08);padding:8px 24px 12px;border-radius:18px}
.ord{position:absolute;left:0;right:0;top:250px;background:#fff;color:#0b1430;border-radius:36px;padding:30px;box-shadow:0 36px 80px rgba(0,0,0,.4)}
.or-h,.or-r{display:grid;grid-template-columns:1.5fr 1fr .8fr 70px;align-items:center;gap:10px;padding:14px 10px}
.or-h{font-size:32px;color:#6a7495;border-bottom:3px solid #e6ebf7;margin-top:14px}
.or-r{font-size:48px;font-weight:700;border-bottom:2px solid #eef2fb}.or-r b{font-family:L,M,sans-serif;color:#1f4fd1}
.or-r em{width:54px;height:54px;border-radius:50%;background:#2ed39a;display:grid;place-items:center}
.prn{position:absolute;left:0;right:0;top:230px;margin:0 auto;width:220px;height:170px;background:#fff;border-radius:30px;display:grid;place-items:center;box-shadow:0 26px 60px rgba(0,0,0,.35);z-index:2}
.stk{position:absolute;left:110px;right:110px;top:380px;background:#fff;color:#0b1430;border-radius:10px 10px 24px 24px;padding:26px 34px;box-shadow:0 30px 70px rgba(0,0,0,.4);transform-origin:top}
.stk-h{display:flex;justify-content:space-between;align-items:baseline;border-bottom:4px dashed #b9c3e3;padding-bottom:12px;margin-bottom:10px}
.stk-h b{font-family:L,M,sans-serif;font-size:44px;font-weight:800}.stk-h small{font-size:28px;color:#6a7495}
.stk p{font-size:46px;font-weight:700;line-height:1.5}.stk p small{display:inline-block;width:220px;font-size:32px;font-weight:500;color:#6a7495}
.stk .it{color:#1f4fd1}
.stk .bar{height:80px;margin-top:16px;background:repeating-linear-gradient(90deg,#0b1430 0 6px,transparent 6px 10px,#0b1430 10px 12px,transparent 12px 20px)}
@keyframes flyUp{0%{opacity:0;transform:translateY(40px) scale(.7)}15%{opacity:1;transform:none}80%{opacity:1}100%{opacity:0;transform:translateY(-520px)}}
@keyframes growY{from{transform:scaleY(0)}to{transform:none}}
@keyframes printOut{from{clip-path:inset(0 0 100% 0);transform:translateY(-60px)}to{clip-path:inset(0 0 0 0);transform:none}}
@property --n{syntax:'<integer>';inherits:false;initial-value:0}
@keyframes count{from{--n:0}to{--n:var(--to)}}
@keyframes rise{from{opacity:0;transform:translateY(60px)}to{opacity:1;transform:none}}
@keyframes popIn{from{opacity:0;transform:scale(.3)}to{opacity:1;transform:none}}
@keyframes bubIn{from{opacity:0;transform:translateY(30px) scale(.7);transform-origin:left bottom}to{opacity:1;transform:none}}
@keyframes slideL{from{opacity:0;transform:translateX(-140px)}to{opacity:1;transform:none}}
@keyframes slideR{from{opacity:0;transform:translateX(140px)}to{opacity:1;transform:none}}
@keyframes drawX{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes barUp{from{transform:scaleY(0)}to{transform:none}}
@keyframes stamp{from{opacity:0;transform:scale(2.4) rotate(-20deg)}to{opacity:1;transform:none}}
@keyframes shakeIn{0%{opacity:0;transform:scale(.6)}50%{opacity:1;transform:scale(1.06)}65%{transform:translateX(-18px)}80%{transform:translateX(18px)}100%{opacity:1;transform:none}}
@keyframes leaveL{to{opacity:0;transform:translateX(-260px) scale(.7)}}
@keyframes leaveR{to{opacity:0;transform:translateX(260px) scale(.7)}}
@keyframes drive{from{transform:translateX(-900px)}to{transform:none}}
@keyframes float{0%,100%{translate:0 0}50%{translate:0 -24px}}
@keyframes spinM{from{transform:rotate(0)}to{transform:rotate(1440deg)}}
@keyframes spinH{from{transform:rotate(0)}to{transform:rotate(120deg)}}
`;

module.exports = { V, TYPES, CSS, A, esc, icon };
