// Render one ADS BOX knowledge video (1080x1920, 30 fps MP4) as branded motion graphics: no stock footage.
//   node tools/reel/render.js videos/scripts/<slug>.json OUT_DIR [--music file.mp3] [--no-voice]
// STOCK FOOTAGE IS REMOVED (owner's order, 1 Nov 2026): every frame is drawn by ADS BOX's own scene templates.
// The renderer has no code path that reads, downloads or plays a video clip; "footage" fields in a script are ignored
// and the old --footage option is refused.
// Writes OUT_DIR/<slug>.mp4, OUT_DIR/<slug>-thumb.jpg (9:16 video cover), OUT_DIR/<slug>-cover.jpg (small),
// OUT_DIR/<slug>-thumbnail.jpg (16:9 thumbnail, 1920x1080) and OUT_DIR/meta.json.
//
// Every scene is an animated template (tools/reel/scenes.js) chosen by the script: question, leaving customers,
// ads dashboard, before/after, checklist, deadline, delivery receipt, post mock-up, takeaway, CTA. Its elements appear
// when the Khmer narration reaches them (word timing from the voice), scenes slide in and out, and the video opens with
// an ADS BOX logo sting and ends on a branded card. Chromium draws each frame; ffmpeg adds voice and music.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const S = require("./scenes");
const ROOT = path.join(__dirname, "..", "..");

const FPS = 30, W = 1080, H = 1920;
const LEAD = 0.25, FIRST_LEAD = 0.9, TAIL = 0.35, OUTRO = 3.4;
const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const b64 = (f) => fs.readFileSync(path.join(ROOT, f)).toString("base64");
const esc = S.esc, A = S.A;
const run = (args) => execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...args], { stdio: ["ignore", "inherit", "inherit"] });
const probe = (f) => parseFloat(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f], { encoding: "utf8" }));

// How the Khmer voice should say English words, prices and percentages (the screen keeps the written form).
const SAY = [["adsbox.agency", "អេដស៍ប៊ក ដត អេជិនស៊ី"], ["ADS BOX", "អេដស៍ប៊ក"], ["Order", "អូឌ័រ"], ["Admin", "អាដមីន"], ["Caption", "ខេបសិន"],
  ["Promotion", "ប្រូម៉ូសិន"], ["Boost", "ប៊ូស្ត៍"], ["Post", "ប៉ុស្ត៍"], ["Live", "ឡាយ"], ["Facebook", "ហ្វេសប៊ុក"], ["TikTok", "ធីកតុក"],
  ["Telegram", "តេឡេក្រាម"], ["Page", "ផេក"], ["Messenger", "មេសេនជ័រ"], ["Comment", "ខមមិន"], ["Inbox", "អ៊ីនបក់"], ["Online", "អនឡាញ"],
  ["Target", "ថាហ្គេត"], ["Bundle", "បាន់ឌល"], ["Reels", "រីល"], ["Link", "លីង"], ["Like", "ឡាយក៍"], ["Share", "ស៊ែរ"]];
const spoken = (t) => SAY.reduce((s, [en, kh]) => s.replace(new RegExp("(^|[^A-Za-z])" + en.replace(".", "\\.") + "(?![A-Za-z])", "gi"), "$1" + kh), String(t))
  .replace(/\$([0-9០-៩]+(?:\.[0-9០-៩]+)?)/g, "$1 ដុល្លារ").replace(/([0-9០-៩]+)\s?%/g, "$1 ភាគរយ").replace(/[«»"()]/g, " ").replace(/\s+/g, " ").trim();
const weight = (s) => String(s).replace(/\s+/g, "").length || 1;

// --- Voice and word timing ---------------------------------------------------------------------------------------
function voice(scenes, dir) {
  fs.mkdirSync(dir, { recursive: true });
  scenes.forEach((sc) => {
    sc.said = sc.lines.map(spoken);
    sc.text = sc.said.join(" ");
    let p = 0; sc.lineAt = sc.said.map((l) => { const a = p; p += l.length + 1; return a; });
  });
  const tf = path.join(dir, "texts.json");
  fs.writeFileSync(tf, JSON.stringify(scenes.map((s) => s.text)));
  const res = JSON.parse(execFileSync("python3", [path.join(__dirname, "voice.py"), process.env.REEL_VOICE || "km-KH-PisethNeural", dir, tf], { encoding: "utf8" }));
  scenes.forEach((sc, i) => { sc.voice = path.join(dir, i + ".mp3"); sc.voiceLen = res[i].len; sc.marks = res[i].marks; sc.markKind = res[i].kind; sc.match = res[i].match; });
}

// Character position -> seconds, from the word (or sentence) marks the voice reported; null if they don't match the text.
function clock(sc) {
  if (!sc.marks || !sc.marks.length) return null;
  const pts = [[0, Math.max(0, sc.marks[0][0] - 0.05)]];
  let pos = 0, miss = 0;
  for (const [s, e, w] of sc.marks) {
    const word = String(w || "").trim();
    const at = word ? sc.text.indexOf(word, pos) : -1;
    if (at < 0) { miss++; continue; }
    pts.push([at, s], [at + word.length, e]);
    pos = at + word.length;
  }
  if (miss > sc.marks.length * 0.3 || pts.length < 3) return null;
  pts.push([sc.text.length, sc.voiceLen]);
  return (c) => {
    for (let i = 1; i < pts.length; i++) {
      if (c <= pts[i][0]) { const [c0, t0] = pts[i - 1], [c1, t1] = pts[i]; return c1 === c0 ? t0 : t0 + ((c - c0) * (t1 - t0)) / (c1 - c0); }
    }
    return sc.voiceLen;
  };
}

function timeline(scenes) {
  let t = 0;
  scenes.forEach((sc, i) => {
    const lead = i === 0 ? FIRST_LEAD : LEAD;
    const v = sc.voiceLen || Math.max(2.2, weight(sc.lines.join("")) / 12.5);
    sc.voiceLen = v;
    sc.start = t; sc.vStart = t + lead; sc.dur = lead + v + TAIL; t += sc.dur;
    const at = sc.lineAt && sc.lineAt.length ? clock(sc) : null;
    sc.sync = at ? sc.markKind : "proportional";
    const total = sc.lines.reduce((a, l) => a + weight(l), 0);
    let acc = 0;
    sc.subs = sc.lines.map((l, j) => {
      const s = at ? at(sc.lineAt[j]) : (v * acc) / total;
      acc += weight(l);
      return { text: l, start: sc.vStart + s };
    });
    sc.subs.forEach((s, j) => { s.end = j + 1 < sc.subs.length ? sc.subs[j + 1].start - 0.04 : sc.vStart + v + 0.15; });
    sc.subs[0].start = Math.min(sc.subs[0].start, sc.vStart + 0.05);
  });
  return t + OUTRO;
}

// --- The animated page -------------------------------------------------------------------------------------------
function highlight(line, keyword) {
  let h = esc(line);
  h = h.replace(/(\$\d+(?:\.\d+)?|[0-9០-៩]+(?:\s?%)?)/g, "<em>$1</em>");
  return h;
}

function page(script, scenes, total) {
  const end = total - OUTRO;
  let css = "", html = "";
  scenes.forEach((sc, i) => {
    // Scenes overlap a little: the next one glides in while the last one leaves, so there is never an empty frame.
    const enter = i === 0 ? 0.75 : sc.start - 0.12, exit = sc.start + sc.dur - 0.2;
    const dir = i % 2 ? "B" : "A";
    const x = {
      sc, start: enter, dur: sc.dur, n: sc.subs.length,
      T: (j) => sc.subs[Math.max(0, Math.min(j, sc.subs.length - 1))].start,
      F: (f) => sc.vStart + f * sc.voiceLen,
    };
    const v = sc.visual || {};
    const make = S.V[v.type] || S.V.takeaway;
    html += `<section class="scene" style="${A("in" + dir, enter, 0.6, "cubic-bezier(.22,1,.36,1)")},${A("out" + dir, exit, 0.42, "cubic-bezier(.55,0,.75,.35)", "forwards").replace("animation:", "")}">
<div class="stage" style="${A(i % 2 ? "camB" : "camA", enter, sc.dur + 0.3, "ease-in-out")}">${make(v, x, b64)}</div></section>`;
    sc.subs.forEach((s, j) => {
      html += `<div class="sub" style="${A("sin", s.start, 0.18, "ease-out")},${A("sout", s.end - 0.1, 0.1, "ease-in", "forwards").replace("animation:", "")}"><span>${highlight(s.text, sc.keyword)}</span></div>`;
    });
  });
  const font = (f, w) => `@font-face{font-family:M;font-weight:${w};src:url(data:font/woff2;base64,${b64(f)}) format("woff2");unicode-range:U+1780-17FF,U+19E0-19FF,U+200C-200D,U+25CC}`;
  return `<!doctype html><html lang="km"><head><meta charset="utf-8"><style>
${font("assets/fonts/MiSansKhmer-Bold.woff2", 700)}${font("assets/fonts/MiSansKhmer-Medium.woff2", 500)}
@font-face{font-family:L;font-weight:400 800;src:url(data:font/woff2;base64,${b64("tools/fonts/kantumruy-latin.woff2")}) format("woff2")}
*{box-sizing:border-box;margin:0}
body{width:${W}px;height:${H}px;overflow:hidden;font-family:M,L,sans-serif;color:#fff;position:relative;background:#0b1430}
.bg{position:absolute;inset:0;background:linear-gradient(170deg,#0b1430 0%,#13235a 55%,#1b3a8c 100%)}
.grid{position:absolute;inset:-100px;background-image:radial-gradient(rgba(255,255,255,.09) 2px,transparent 2px);background-size:46px 46px;animation:pan ${total.toFixed(1)}s linear both}
.blob{position:absolute;border-radius:50%;filter:blur(60px)}
.b1{width:760px;height:760px;right:-260px;top:120px;background:rgba(63,125,255,.45);animation:drift1 ${total.toFixed(1)}s ease-in-out both}
.b2{width:640px;height:640px;left:-260px;bottom:120px;background:rgba(255,210,63,.18);animation:drift2 ${total.toFixed(1)}s ease-in-out both}
.prog{position:absolute;left:0;top:0;height:10px;width:100%;background:#ffd23f;transform-origin:left;animation:drawX ${end.toFixed(2)}s linear both}
.top{position:absolute;left:90px;right:90px;top:84px;display:flex;justify-content:space-between;align-items:center}
.logo{display:flex;align-items:center;gap:16px;padding:12px 24px 12px 16px;border-radius:22px;background:rgba(255,255,255,.08);border:2px solid rgba(255,255,255,.14)}
.logo .m{width:60px}.logo .w{width:220px}
.chip{font-size:34px;font-weight:500;padding:8px 26px 12px;border-radius:999px;background:#ffd23f;color:#0b1430}
.scene{position:absolute;inset:0;opacity:0}
.stage{position:absolute;left:90px;right:90px;top:260px;height:1010px}
.sub{position:absolute;left:90px;right:90px;bottom:390px;text-align:center;opacity:0;text-wrap:balance}
.sub span{display:inline;font-size:70px;line-height:1.62;font-weight:700;padding:4px 26px 12px;border-radius:18px;background:rgba(5,9,26,.78);
  -webkit-box-decoration-break:clone;box-decoration-break:clone}
.sub em{font-style:normal;color:#ffd23f}
.intro,.outro{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:36px;text-align:center}
.intro{background:radial-gradient(circle at 50% 46%,#1f4fd1,#0b1430 72%);animation:introOut .4s ease-in .7s forwards}
.intro .m{width:250px;animation:popIn .5s cubic-bezier(.3,1.5,.5,1) .02s both}
.intro .w{width:520px;animation:rise .45s ease-out .15s both}
.intro i,.outro i{display:block;width:130px;height:12px;border-radius:12px;background:#ffd23f;transform-origin:center;animation:drawX .4s ease-out .3s both}
.outro{padding:0 110px;background:linear-gradient(165deg,#0b1430,#1c3f86 60%,#3f7dff);opacity:0;animation:fadeIn .45s ease-out ${end.toFixed(3)}s forwards}
.outro .m{width:230px;animation:popIn .6s cubic-bezier(.3,1.5,.5,1) ${(end + 0.15).toFixed(2)}s both}
.outro .w{width:540px;animation:rise .6s ease-out ${(end + 0.3).toFixed(2)}s both}
.outro i{animation-delay:${(end + 0.45).toFixed(2)}s}
.outro p{font-size:58px;line-height:1.6;font-weight:500;animation:rise .6s ease-out ${(end + 0.55).toFixed(2)}s both}
.outro .u{font-family:L,M,sans-serif;font-weight:800;font-size:66px;color:#0b1430;background:#ffd23f;padding:16px 52px;border-radius:28px;animation:rise .6s ease-out ${(end + 0.75).toFixed(2)}s both,pulse 1.1s ease-in-out ${(end + 1.4).toFixed(2)}s infinite}
.outro .f{font-size:44px;font-weight:700;padding:10px 34px 16px;border-radius:999px;border:3px solid rgba(255,255,255,.5);animation:rise .6s ease-out ${(end + 1.1).toFixed(2)}s both}
.outro small{font-family:L,M,sans-serif;font-size:42px;font-weight:600;opacity:.9;animation:rise .6s ease-out ${(end + 0.95).toFixed(2)}s both}
@keyframes camA{from{transform:scale(1)}to{transform:scale(1.035) translateY(-10px)}}
@keyframes camB{from{transform:scale(1.035) translateY(-10px)}to{transform:scale(1)}}
@keyframes inA{from{opacity:0;transform:translateX(120px) scale(.97)}to{opacity:1;transform:none}}
@keyframes outA{to{opacity:0;transform:translateX(-120px) scale(.97)}}
@keyframes inB{from{opacity:0;transform:translateY(90px) scale(.97)}to{opacity:1;transform:none}}
@keyframes outB{to{opacity:0;transform:translateY(-90px) scale(.97)}}
@keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}
@keyframes sin{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
@keyframes sout{to{opacity:0}}
@keyframes introOut{to{opacity:0;transform:scale(1.08)}}
@keyframes fadeIn{to{opacity:1}}
@keyframes pan{from{transform:translateY(0)}to{transform:translateY(-92px)}}
@keyframes drift1{0%{transform:translate(0,0)}50%{transform:translate(-160px,260px)}100%{transform:translate(-40px,520px)}}
@keyframes drift2{0%{transform:translate(0,0)}50%{transform:translate(200px,-200px)}100%{transform:translate(60px,-420px)}}
${S.CSS}
${css}
</style></head><body>
<div class="bgall"><div class="bg"></div><div class="grid"></div><span class="blob b1"></span><span class="blob b2"></span></div>
<div class="top"><div class="logo"><img class="m" src="data:image/png;base64,${b64("assets/logo-mark-white.png")}" alt=""><img class="w" src="data:image/png;base64,${b64("assets/logo-word-white.png")}" alt=""></div>
<span class="chip">ចំណេះដឹងលក់អនឡាញ</span></div>
${html}
<div class="prog"></div>
<div class="intro"><img class="m" src="data:image/png;base64,${b64("assets/logo-mark-white.png")}" alt=""><img class="w" src="data:image/png;base64,${b64("assets/logo-word-white.png")}" alt=""><i></i></div>
<div class="outro"><img class="m" src="data:image/png;base64,${b64("assets/logo-mark-white.png")}" alt=""><img class="w" src="data:image/png;base64,${b64("assets/logo-word-white.png")}" alt=""><i></i>
<p>គន្លឹះលក់អនឡាញថ្មីៗ រាល់ថ្ងៃ</p><span class="u">adsbox.agency</span><span class="f">ចុច Follow ដើម្បីកុំឲ្យរំលង</span><small>Telegram: t.me/vannakdm</small></div>
</body></html>`;
}

async function browser() {
  const { chromium } = require("playwright");
  try { return await chromium.launch(); } catch (e) { return await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }); }
}

async function frames(html, total, dir) {
  const b = await browser();
  const pg = await b.newPage({ viewport: { width: W, height: H } });
  await pg.setContent(html, { waitUntil: "load" });
  await pg.evaluate(() => document.fonts.ready);
  // Subtitles: large, at most two balanced lines; only a third line makes them a little smaller.
  await pg.evaluate(() => document.querySelectorAll(".sub span").forEach((el) => {
    let size = 70;
    while (el.getClientRects().length > 2 && size > 58) { size -= 4; el.style.fontSize = size + "px"; }
  }));
  const n = Math.round(total * FPS);
  for (let f = 0; f < n; f++) {
    await pg.evaluate((ms) => document.getAnimations().forEach((a) => { a.pause(); a.currentTime = ms; }), (f * 1000) / FPS);
    await pg.screenshot({ path: path.join(dir, String(f).padStart(5, "0") + ".jpg"), type: "jpeg", quality: 93 });
  }
  await b.close();
}

// Share of the speaking time by visual type (the branded opening and ending are not counted).
// The five ADS BOX visual methods (owner's direction, 1 Nov 2026) grouped as the four target shares.
const METHOD = { question: "phone_chat", chat: "phone_chat", caption: "phone_chat", story: "illustrated", leaving: "illustrated",
  dashboard: "product_dashboard", orders: "product_dashboard", sticker: "product_dashboard" };
function visualMix(scenes) {
  const t = { motion_graphics: 0, phone_chat: 0, illustrated: 0, product_dashboard: 0 };
  scenes.forEach((s) => { const k = METHOD[(s.visual || {}).type] || "motion_graphics"; t[k] += s.dur; });
  const all = Object.values(t).reduce((a, b) => a + b, 0) || 1;
  return Object.fromEntries(Object.entries(t).map(([k, v]) => [k, +(v / all).toFixed(2)]));
}

// --- Sound -----------------------------------------------------------------------------------------------------------
function sound(scenes, total, music, dir) {
  const whoosh = path.join(dir, "whoosh.wav"), pop = path.join(dir, "pop.wav");
  run(["-f", "lavfi", "-i", "anoisesrc=d=0.45:c=pink:a=0.5", "-af", "highpass=f=700,lowpass=f=3000,afade=t=in:d=0.2,afade=t=out:st=0.2:d=0.25,volume=0.16", whoosh]);
  run(["-f", "lavfi", "-i", "sine=f=880:d=0.12", "-af", "afade=t=out:st=0.02:d=0.1,volume=0.12", pop]);
  const clips = [[pop, 0.05], [whoosh, total - OUTRO - 0.15]];
  scenes.forEach((sc, i) => {
    if (i > 0) clips.push([whoosh, sc.start - 0.12]);
    if (sc.voice) clips.push([sc.voice, sc.vStart]);
  });
  const inputs = [], parts = [];
  clips.forEach(([f, t], i) => {
    inputs.push("-i", f);
    const ms = Math.max(0, Math.round(t * 1000));
    parts.push(`[${i}:a]aresample=44100,aformat=channel_layouts=stereo,adelay=${ms}|${ms}[a${i}]`);
  });
  let mix = clips.map((_, i) => `[a${i}]`).join("") + `amix=inputs=${clips.length}:normalize=0,apad=whole_dur=${total.toFixed(3)}[fx]`;
  let last = "[fx]";
  if (music) {
    inputs.push("-stream_loop", "-1", "-i", music);
    const m = clips.length, lo = Number(process.env.MUSIC_VOLUME || 0.085), hi = Math.min(0.42, lo * 3.4);
    const speechEnd = (total - OUTRO).toFixed(2);
    parts.push(`[${m}:a]aresample=44100,aformat=channel_layouts=stereo,atrim=0:${total.toFixed(3)},` +
      `volume='if(lt(t,0.8)+gt(t,${speechEnd}),${hi},${lo})':eval=frame,afade=t=in:d=0.3,afade=t=out:st=${(total - 1.5).toFixed(2)}:d=1.5[mu]`);
    mix += `;[fx][mu]amix=inputs=2:normalize=0[mx]`;
    last = "[mx]";
  }
  mix += `;${last}loudnorm=I=-14:TP=-1.5:LRA=9,alimiter=limit=0.9[out]`;
  const out = path.join(dir, "audio.wav");
  run([...inputs, "-filter_complex", parts.concat(mix).join(";"), "-map", "[out]", "-t", total.toFixed(3), "-ar", "44100", "-c:a", "pcm_s16le", out]);
  return out;
}

// --- Thumbnail 16:9 (owner, 1 Nov 2026): navy brand card, big Khmer headline, the hook scene as a phone screen --------
async function thumbnailWide(script, frame, out) {
  const TW = 1920, TH = 1080;
  const b = await browser();
  const pg = await b.newPage({ viewport: { width: TW, height: TH } });
  const img = (f) => `data:image/png;base64,${b64(f)}`;
  await pg.setContent(`<!doctype html><html lang="km"><head><meta charset="utf-8"><style>
@font-face{font-family:M;font-weight:700;src:url(data:font/woff2;base64,${b64("assets/fonts/MiSansKhmer-Bold.woff2")}) format("woff2");unicode-range:U+1780-17FF,U+19E0-19FF,U+200C-200D,U+25CC}
@font-face{font-family:L;font-weight:400 800;src:url(data:font/woff2;base64,${b64("tools/fonts/kantumruy-latin.woff2")}) format("woff2")}
*{box-sizing:border-box;margin:0}
body{width:${TW}px;height:${TH}px;overflow:hidden;font-family:M,L,sans-serif;color:#fff;position:relative;
  background:radial-gradient(1100px 800px at 78% 40%,#1d3a8a 0%,#0f2160 45%,#0b1430 100%)}
.grid{position:absolute;inset:0;background-image:radial-gradient(rgba(255,255,255,.08) 2px,transparent 2px);background-size:44px 44px}
.glow{position:absolute;width:760px;height:760px;right:120px;top:150px;border-radius:50%;background:radial-gradient(rgba(255,210,63,.28),rgba(255,210,63,0) 65%)}
.logo{position:absolute;left:96px;top:78px;display:flex;align-items:center;gap:18px}
.logo .m{height:74px}.logo .w{height:40px}
.chip{position:absolute;left:96px;top:205px;font-size:34px;font-weight:700;color:#0b1430;background:#ffd23f;padding:6px 24px 12px;border-radius:999px}
.h{position:absolute;left:96px;width:1010px;top:300px;font-size:104px;line-height:1.5;font-weight:700;text-shadow:0 6px 24px rgba(0,0,0,.35)}
.h b{color:#ffd23f}
.bar{position:absolute;left:96px;top:auto;bottom:150px;width:160px;height:12px;border-radius:6px;background:#ffd23f}
.u{position:absolute;left:96px;bottom:70px;font-family:L,M,sans-serif;font-weight:800;font-size:44px;letter-spacing:.5px}
.phone{position:absolute;right:170px;top:90px;width:500px;height:900px;border-radius:64px;padding:16px;background:#fff;box-shadow:0 40px 90px rgba(0,0,0,.5);transform:rotate(4deg)}
.phone .s{width:100%;height:100%;border-radius:50px;background:url(data:image/jpeg;base64,${fs.readFileSync(frame).toString("base64")}) center 42%/cover}
</style></head><body><div class="grid"></div><div class="glow"></div>
<div class="logo"><img class="m" src="${img("assets/logo-mark-white.png")}" alt=""><img class="w" src="${img("assets/logo-word-white.png")}" alt=""></div>
<div class="chip">ចំណេះដឹងលក់អនឡាញ</div>
<div class="h" id="h">${esc(script.thumbnail_text)}</div><div class="bar"></div><div class="u">adsbox.agency</div>
<div class="phone"><div class="s"></div></div></body></html>`, { waitUntil: "load" });
  await pg.evaluate(async () => {
    await document.fonts.ready;
    const h = document.getElementById("h");
    // Highlight the English/number words (Order, Live, 4 ...) in yellow; shrink until the headline fits in 3 lines.
    h.innerHTML = h.innerHTML.replace(/([A-Za-z0-9][A-Za-z0-9$%.+]*|[០-៩]+)/g, "<b>$1</b>");
    let fs = 104;
    while (fs > 64 && h.getBoundingClientRect().bottom > 900) { fs -= 4; h.style.fontSize = fs + "px"; }
  });
  await pg.screenshot({ path: out, type: "jpeg", quality: 92 });
  await b.close();
}

// --- Thumbnail: the hook scene's picture with the big thumbnail words ------------------------------------------------
async function thumbnail(script, frame, out, cover) {
  const b = await browser();
  const pg = await b.newPage({ viewport: { width: W, height: H } });
  await pg.setContent(`<!doctype html><html lang="km"><head><meta charset="utf-8"><style>
@font-face{font-family:M;font-weight:700;src:url(data:font/woff2;base64,${b64("assets/fonts/MiSansKhmer-Bold.woff2")}) format("woff2");unicode-range:U+1780-17FF,U+19E0-19FF,U+200C-200D,U+25CC}
@font-face{font-family:L;font-weight:400 800;src:url(data:font/woff2;base64,${b64("tools/fonts/kantumruy-latin.woff2")}) format("woff2")}
*{box-sizing:border-box;margin:0}
body{width:${W}px;height:${H}px;overflow:hidden;font-family:M,L,sans-serif;color:#fff;position:relative;
  background:url(data:image/jpeg;base64,${fs.readFileSync(frame).toString("base64")}) center/cover}
.sh{position:absolute;inset:0;background:linear-gradient(rgba(11,20,48,0) 35%,rgba(11,20,48,.92) 72%)}
.t{position:absolute;left:80px;right:80px;bottom:360px}
.t span{font-size:116px;line-height:1.42;font-weight:700;padding:4px 24px 14px;background:#ffd23f;color:#0b1430;border-radius:20px;-webkit-box-decoration-break:clone;box-decoration-break:clone}
.u{position:absolute;left:80px;bottom:240px;font-family:L,M,sans-serif;font-weight:800;font-size:46px}
</style></head><body><div class="sh"></div><div class="t"><span>${esc(script.thumbnail_text)}</span></div><div class="u">adsbox.agency</div></body></html>`, { waitUntil: "load" });
  await pg.evaluate(() => document.fonts.ready);
  await pg.screenshot({ path: out, type: "jpeg", quality: 90 });
  await b.close();
  run(["-i", out, "-vf", "scale=320:568", "-q:v", "4", cover]);
}

(async () => {
  const src = process.argv[2], outDir = process.argv[3];
  if (!src || !outDir) { console.error("usage: node tools/reel/render.js SCRIPT.json OUT_DIR [--music file] [--no-voice]"); process.exit(2); }
  const script = JSON.parse(fs.readFileSync(src, "utf8"));
  fs.mkdirSync(outDir, { recursive: true });
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "reel-"));
  const scenes = script.scenes.map((s) => ({ ...s, lines: s.lines.map(String) }));
  if (process.argv.includes("--footage")) throw new Error("Stock footage is removed from ADS BOX videos: --footage is not accepted.");
  scenes.forEach((sc) => { delete sc.footage; delete sc.foot; });  // a script's old footage notes never reach the video
  const t0 = Date.now();

  if (!process.argv.includes("--no-voice")) voice(scenes, path.join(work, "voice"));
  const total = timeline(scenes);
  console.log(`Timeline ${total.toFixed(1)}s: ${scenes.length} scenes (${scenes.map((s) => (s.visual || {}).type).join(", ")}), subtitle timing: ${scenes.map((s) => s.sync).join(",")}`);

  const fdir = path.join(work, "frames"); fs.mkdirSync(fdir);
  await frames(page(script, scenes, total), total, fdir);  // opaque frames only: nothing is composited underneath
  const music = arg("--music");
  const wav = sound(scenes, total, music && fs.existsSync(music) ? music : null, work);

  const slug = script.slug, mp4 = path.join(outDir, `${slug}.mp4`);
  const enc = ["-c:v", "libx264", "-preset", "medium", "-crf", "19", "-maxrate", "8M", "-bufsize", "16M",
    "-r", String(FPS), "-c:a", "aac", "-b:a", "192k", "-t", total.toFixed(3), "-movflags", "+faststart", mp4];
  run(["-framerate", String(FPS), "-i", path.join(fdir, "%05d.jpg"), "-i", wav, "-map", "0:v", "-map", "1:a",
    "-vf", `scale=${W}:${H},format=yuv420p`, ...enc]);
  const dims = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate", "-of", "csv=p=0", mp4], { encoding: "utf8" }).trim();
  if (dims !== `${W},${H},${FPS}/1`) throw new Error(`Output is ${dims}, expected ${W}x${H} at ${FPS} fps`);

  // Thumbnail from the moment the hook question is fully on screen.
  const hook = scenes[0], tf = Math.min(hook.start + hook.dur - 0.5, (hook.subs[hook.subs.length - 1].start || 1) + 0.8);
  let frame = path.join(fdir, String(Math.round(tf * FPS)).padStart(5, "0") + ".jpg");
  const thumb = path.join(outDir, `${slug}-thumb.jpg`), cover = path.join(outDir, `${slug}-cover.jpg`);
  await thumbnail(script, fs.existsSync(frame) ? frame : path.join(fdir, "00030.jpg"), thumb, cover);
  await thumbnailWide(script, fs.existsSync(frame) ? frame : path.join(fdir, "00030.jpg"), path.join(outDir, `${slug}-thumbnail.jpg`));

  const meta = {
    slug, style: "custom animation only (no stock footage)", duration: +probe(mp4).toFixed(2), size_mb: +(fs.statSync(mp4).size / 1e6).toFixed(1), resolution: `${W}x${H}`, fps: FPS,
    scenes: scenes.length, visuals: scenes.map((s) => (s.visual || {}).type), voice: scenes[0].voice ? (process.env.REEL_VOICE || "km-KH-PisethNeural") : "none",
    music: music ? path.basename(music) : "none", subtitle_sync: [...new Set(scenes.map((s) => s.sync))].join(","),
    render_seconds: Math.round((Date.now() - t0) / 1000),
    footage: [], stock_footage: "removed",
    visual_mix: visualMix(scenes, total),
    // Kiri voice: how closely Kiri's own transcript of each scene's audio matches the script (1 = identical), and the timing source per scene.
    speech_match: scenes.map((s) => (s.match ?? null)), scene_sync: scenes.map((s) => s.sync),
    footage_share: 0,
  };
  fs.writeFileSync(path.join(outDir, "meta.json"), JSON.stringify(meta, null, 1));
  fs.rmSync(work, { recursive: true, force: true });
  console.log(`Video made: ${mp4} (${meta.duration}s, ${meta.resolution} @ ${FPS} fps, ${meta.size_mb} MB, ${meta.render_seconds}s)`);
})().catch((e) => { console.error(e.stack || e); process.exit(1); });
