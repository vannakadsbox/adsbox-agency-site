// Render one ADS BOX knowledge video (1080x1920, 30 fps MP4).
//   node tools/reel/render.js videos/scripts/<slug>.json OUT_DIR [--music file.mp3] [--no-voice] [--photos DIR] [--footage footage.json]
// Clips style (owner, 7 Nov 2026, reference: real moving clips + motion graphics, quick cuts): scenes with Pixabay clips
// (tools/reel/footage.py auto) play them full screen under typed Khmer text; scenes with a 3D picture show it on a white grid.
// (Stock footage was removed on 1 Nov 2026 and brought back by the owner on 7 Nov 2026.)
// Writes OUT_DIR/<slug>.mp4, OUT_DIR/<slug>-thumb.jpg (1080x1920 thumbnail and video cover), OUT_DIR/<slug>-cover.jpg (small),
// and OUT_DIR/meta.json. The 1080x1920 thumb is also the delivered thumbnail.
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
// Video look (videos/settings.json "video_style"): "explainer" = calm, clean illustrations and karaoke subtitles
// (owner's reference, 5 Nov 2026); "creative" = sweeps, sparkles and floating icons.
const STYLE = process.env.REEL_STYLE || (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, "videos", "settings.json"), "utf8")).video_style || "explainer"; } catch (e) { return "explainer"; } })();
const EXPL = STYLE !== "creative";
// The owner's presenter character (videos/settings.json "presenter": "vannak" or "none").
const HOST = (() => { try { return (JSON.parse(fs.readFileSync(path.join(ROOT, "videos", "settings.json"), "utf8")).presenter || "vannak") !== "none"; } catch (e) { return true; } })();

const FPS = 30, W = 1080, H = 1920;
const LEAD = 0.15, FIRST_LEAD = 0.6, TAIL = 0.25, OUTRO = 4.2;  // owner review 12 Nov 2026: no empty gaps between scenes
const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const b64 = (f) => fs.readFileSync(path.join(ROOT, f)).toString("base64");
// Photo style (owner, 7 Nov 2026, style C): scene index -> realistic AI photo made by tools/reel/photos.py (--photos DIR).
const PHOTOS = (() => {
  const d = arg("--photos");
  try { return d ? JSON.parse(fs.readFileSync(path.join(d, "photos.json"), "utf8")) : {}; } catch (e) { return {}; }
})();
const ICONS = (() => {
  const d = arg("--photos");
  try { return d ? JSON.parse(fs.readFileSync(path.join(d, "icons.json"), "utf8")) : {}; } catch (e) { return {}; }
})();
// Paper style (owner, 7 Nov 2026, reference: Khmer explainer reels on cream paper): bold black Khmer, red and yellow
// stickers, white paper cards that drop in slightly tilted, simple charts. Only the look changes; the scenes are the same.
const PAPER = `
body{background:#f6f8fc!important;color:#0c1430}
.bg{background:#f6f8fc radial-gradient(rgba(0,89,224,.07) 1.2px,transparent 1.4px) 0 0/7px 7px!important}
.grid,.blob,.fl{display:none!important}
.chip{background:#ffd23f;color:#0c1430;font-weight:700;transform:rotate(-2deg)}
.prog{background:#0059e0}
.hd .lbl{background:#0059e0;color:#fff;border-radius:6px;transform:rotate(-2deg);box-shadow:0 6px 0 rgba(0,0,0,.12)}
.hd h2{color:#0c1430;font-weight:800;font-size:80px}
.hd .ul{background:#0059e0;height:10px}
.q-title span{background:#fff;color:#0c1430;border-radius:8px;box-shadow:0 8px 0 rgba(0,0,0,.08),0 24px 40px rgba(0,0,0,.14);rotate:-1.5deg}
.qmark{color:#0059e0;text-shadow:none}
.card,.li,.tk,.rcpt,.dash,.ord,.post,.post-c,.cta-card,.stk,.goodline{border-radius:10px!important;box-shadow:0 8px 0 rgba(0,0,0,.07),0 22px 40px rgba(0,0,0,.13)!important}
.li:nth-child(odd){rotate:-1deg}.li:nth-child(even){rotate:1deg}
.card.bad{rotate:-1.5deg}.card.good{rotate:1.2deg}
.tk{rotate:-1deg}.rcpt{rotate:1deg}.post{rotate:-1deg}
.good,.goodline,.total{background:#ffd23f!important;color:#0c1430!important}
.bad .tag,.warn,.alert,.ckx{background:#c8355e!important}
.strike{background:#c8355e}
.ck{background:#0c1430!important;border-radius:6px}.ck svg *{stroke:#ffd23f}
.badline{color:#55627a;border-color:rgba(0,0,0,.25)}
.fl-line{background:#0c1430}
.fl-i{background:#ffd23f;border-radius:8px;box-shadow:0 6px 0 rgba(0,0,0,.12)}
.fl-s small{color:#0059e0}
.fl-s p{color:#0c1430;background:#fff;border-radius:8px;box-shadow:0 6px 0 rgba(0,0,0,.07),0 16px 30px rgba(0,0,0,.1)}
.qq{color:#0059e0}.ul2{background:#0059e0}
.st-ring{border-color:rgba(0,0,0,.06);box-shadow:none}
.road::after{background:repeating-linear-gradient(90deg,rgba(0,0,0,.25) 0 60px,transparent 60px 100px)}
.next span{color:#0c1430}
.sub span{background:#0c1430;font-size:60px;border-radius:8px}
.sub i{color:rgba(255,255,255,.45)}
.host .vk{filter:drop-shadow(0 10px 0 rgba(0,0,0,.08))}
.intro,.outro{background:#f6f8fc!important;color:#0c1430}
.intro img,.outro img{filter:brightness(0)}
.intro i,.outro i{background:#0059e0}
.intro .ring{border-color:#0059e0}.intro .r2{border-color:#0c1430}
.intro .rays{background:repeating-conic-gradient(rgba(0,89,224,.10) 0 8deg,transparent 8deg 22deg)}
.outro .u{background:#0059e0;color:#fff;font-family:L,M,sans-serif}
.outro .f{border-color:#0c1430;color:#0c1430}
.outro small{color:#0c1430}
.sh span{box-shadow:0 8px 0 rgba(0,0,0,.08),0 20px 40px rgba(0,0,0,.15)}
.logo{background:#0c1430!important}
`;
// Neon style (owner's reference, 9 Nov 2026: dark navy app-style explainer): deep navy with a soft blue glow, glowing
// UI cards, a big bold headline in yellow-orange, white subtitles without boxes, ADS BOX blue and yellow accents.
const NEON = `
.bg{background:radial-gradient(120% 70% at 50% 20%,#132a6b 0%,#0a1638 45%,#050b1f 100%)!important}
.grid{background-image:linear-gradient(rgba(90,140,255,.06) 2px,transparent 2px),linear-gradient(90deg,rgba(90,140,255,.06) 2px,transparent 2px)!important;background-size:90px 90px!important}
.blob{opacity:.55}
.hd .lbl{background:linear-gradient(90deg,#2f6bff,#5b8cff);color:#fff;border-radius:999px;box-shadow:0 0 28px rgba(63,125,255,.7)}
.hd h2{color:#fff;font-weight:800;font-size:82px;text-shadow:0 0 30px rgba(63,125,255,.35)}
.hd .ul{background:linear-gradient(90deg,#ffd23f,#ff8a1f);height:8px;box-shadow:0 0 18px rgba(255,170,40,.7)}
.q-title{top:10px!important}
.q-title span{background:none;box-shadow:none;font-size:92px;line-height:1.3;padding:0 10px;font-weight:800;color:transparent;background-image:linear-gradient(180deg,#fff 0%,#ffe08a 45%,#ff9d2e 100%);-webkit-background-clip:text;background-clip:text;filter:drop-shadow(0 0 22px rgba(255,160,40,.55))}
.qmark{color:#5b8cff;text-shadow:0 0 30px rgba(63,125,255,.9)}
.card,.li,.tk,.rcpt,.dash,.ord,.post,.post-c,.cta-card,.stk,.goodline,.fl-s p,.st-b{background:rgba(16,30,72,.88)!important;color:#fff!important;border:2px solid rgba(91,140,255,.55)!important;box-shadow:0 0 36px rgba(63,125,255,.35),inset 0 0 24px rgba(63,125,255,.12)!important;border-radius:22px!important}
.card.good,.goodline,.total{border-color:#ffd23f!important;box-shadow:0 0 40px rgba(255,200,60,.45)!important}
.card.bad{border-color:#ff8a1f!important;box-shadow:0 0 36px rgba(255,120,40,.4)!important}
.good,.total{color:#ffd23f!important}
.ck{background:linear-gradient(135deg,#2f6bff,#5b8cff)!important;box-shadow:0 0 18px rgba(63,125,255,.8)}
.ckx,.bad .tag,.warn,.alert{background:#ff8a1f!important;box-shadow:0 0 18px rgba(255,138,31,.8)}
.fl-i{background:#ffd23f;box-shadow:0 0 22px rgba(255,210,63,.7)}
.fl-line{background:linear-gradient(90deg,#2f6bff,#ffd23f)}
.sub span{background:none!important;padding:0 6px;font-size:68px;font-weight:800!important;text-shadow:0 4px 18px rgba(0,0,0,.85),0 0 2px rgba(0,0,0,.9)}
.sub i{color:rgba(255,255,255,.55)}
.sub em{color:#ffd23f}
.chip{background:rgba(16,30,72,.9);color:#ffd23f;border:2px solid rgba(255,210,63,.6)}
.logo{background:rgba(16,30,72,.85)!important;border:2px solid rgba(91,140,255,.45)}
`;
const jpg = (f) => fs.readFileSync(f).toString("base64");
// Big text typed letter by letter (Khmer grapheme clusters), with a blinking cursor, like the owner's reference.
function typed(text, t0, step = 0.055) {
  const seg = new Intl.Segmenter("km", { granularity: "grapheme" });
  let k = 0, out = "";
  for (const { segment } of seg.segment(String(text))) {
    out += segment === " " ? " " : `<i style="animation:tyIn .01s linear ${(t0 + k * step).toFixed(3)}s both">${esc(segment)}</i>`;
    k++;
  }
  return out + `<u style="animation:tyIn .01s linear ${t0.toFixed(3)}s both,blink .8s steps(1) ${(t0 + k * step).toFixed(3)}s infinite"></u>`;
}
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
// Kiri voices read English inside Khmer naturally, so English terms stay English (no Khmer spelling); only the brand,
// the web address, prices and percentages are written the way they should be said.
const spokenKiri = (t) => String(t).replace(/adsbox\.agency/gi, "Ads Box dot agency").replace(/adsbox\.biz/gi, "Ads Box dot biz").replace(/ADS\s*BOX/g, "Ads Box")
  .replace(/\$([0-9០-៩]+(?:\.[0-9០-៩]+)?)/g, "$1 ដុល្លារ").replace(/([0-9០-៩]+)\s?%/g, "$1 ភាគរយ").replace(/[«»"()]/g, " ").replace(/\s+/g, " ").trim();
const weight = (s) => String(s).replace(/\s+/g, "").length || 1;

// --- Creative pack shapes (flat, brand colours) ------------------------------------------------------------------------
const STAR = '<svg viewBox="0 0 24 24" width="44" height="44"><path fill="#ffd23f" d="M12 1.5l2.6 7.2 7.4.3-5.8 4.6 2 7.2L12 16.6l-6.2 4.2 2-7.2L2 9l7.4-.3z"/></svg>';
const svgI = (d, fill) => `<svg viewBox="0 0 24 24" width="70" height="70"><path fill="${fill}" d="${d}"/></svg>`;
const P_CHAT = "M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4v-4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z";
const P_HEART = "M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.8 4.5c2.1 0 3.5 1.2 5.2 3 1.7-1.8 3.1-3 5.2-3 3.8 0 5.9 3.9 4.4 7.3C19.5 16.4 12 21 12 21z";
const P_BAG = "M6 8h12l1 13H5L6 8zm3 0V6a3 3 0 0 1 6 0v2h-2V6a1 1 0 0 0-2 0v2z";
const P_BOX = "M3 7l9-4 9 4v10l-9 4-9-4V7zm9 2l6.5-2.9L12 3.2 5.5 6.1 12 9z";
const FLOAT = [svgI(P_CHAT, "#fff"), svgI(P_HEART, "#ffd23f"), svgI(P_BAG, "#fff"), STAR.replace(/44/g, "70"), svgI(P_BOX, "#ffd23f"), svgI(P_CHAT, "#ffd23f"), svgI(P_HEART, "#fff"), svgI(P_BAG, "#ffd23f")];
const SHARE = {
  heart: '<svg viewBox="0 0 24 24"><path fill="#ff4d6d" d="' + P_HEART + '"/></svg>',
  share: '<svg viewBox="0 0 24 24"><path fill="#3f7dff" d="M14 4l8 7.5-8 7.5v-4.5c-5.5 0-9 1.6-12 6 1-6 4-11 12-12V4z"/></svg>',
  save: '<svg viewBox="0 0 24 24"><path fill="#0b1430" d="M6 2.5h12a1 1 0 0 1 1 1V22l-7-4.5L5 22V3.5a1 1 0 0 1 1-1z"/></svg>',
};

// --- Voice and word timing ---------------------------------------------------------------------------------------
function voice(scenes, dir) {
  fs.mkdirSync(dir, { recursive: true });
  const kiri = String(process.env.REEL_VOICE || "").startsWith("kiri:");
  scenes.forEach((sc) => {
    sc.said = sc.lines.map(kiri ? spokenKiri : spoken);
    // Kiri: a subtitle line break is a natural pause, so a line without its own end mark gets a comma (a short breath).
    let p = 0, text = "";
    sc.lineAt = sc.said.map((l, j) => {
      const sep = j === 0 ? "" : (kiri && !/[។?!,៖]$/.test(sc.said[j - 1]) ? ", " : " ");
      text += sep + l; p += sep.length; const a = p; p += l.length; return a;
    });
    sc.text = text;
  });
  const tf = path.join(dir, "texts.json");
  fs.writeFileSync(tf, JSON.stringify(scenes.map((s) => s.text)));
  // Per scene: the spoken subtitle lines (for the pauses after numbers) and the scene's voice direction (owner, 12 Nov 2026).
  fs.writeFileSync(path.join(dir, "scenes.json"), JSON.stringify(scenes.map((s) => ({ lines: s.said, instruction: s.voice || "" }))));
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
    sc.at = at;
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
// Karaoke subtitles: each Khmer word turns from grey to white at the moment the voice says it
// (times from the voice's own word timing; numbers and prices light up yellow).
const SEG = new Intl.Segmenter("km", { granularity: "word" });
function karaoke(sc, j, s) {
  const line = s.text, said = (sc.said || [])[j] || line, base = (sc.lineAt || [])[j] || 0;
  let k = 0, out = "";
  for (const { segment } of SEG.segment(line)) {
    const frac = line.length ? k / line.length : 0;
    let t = sc.at ? sc.vStart + sc.at(base + Math.round(frac * said.length)) : s.start + frac * Math.max(0.3, s.end - s.start - 0.2);
    t = Math.max(s.start, Math.min(t, s.end - 0.05));
    k += segment.length;
    if (!segment.trim()) { out += esc(segment); continue; }
    const num = /[0-9០-៩$%]/.test(segment);
    out += `<i class="${num ? "n" : ""}" style="animation:${num ? "litN" : "lit"} .14s linear ${t.toFixed(3)}s both">${esc(segment)}</i>`;
  }
  return out;
}

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
    // Creative pack (owner, 4 Nov 2026): four transition styles in turn, a brand-colour sweep at each scene change,
    // and a sparkle burst when the scene's main picture lands.
    const dir = EXPL ? "E" : ["A", "C", "B", "D"][i % 4];
    const x = {
      sc, start: enter, dur: sc.dur, n: sc.subs.length,
      T: (j) => sc.subs[Math.max(0, Math.min(j, sc.subs.length - 1))].start,
      F: (f) => sc.vStart + f * sc.voiceLen,
    };
    const v = sc.visual || {};
    const make = S.V[v.type] || S.V.takeaway;
    const ph0 = PHOTOS[String(i)] && v.type !== "cta" && fs.existsSync(PHOTOS[String(i)]) ? PHOTOS[String(i)] : null;
    const icon = ICONS[String(i)] && v.type !== "cta" && fs.existsSync(ICONS[String(i)]) ? ICONS[String(i)] : null;
    const kw = sc.keyword || v.title || "";
    const ph = sc.foot ? "clip" : (icon ? null : ph0);
    if (sc.foot) {
      // Clip scene: the real clips play underneath (composited by ffmpeg); only shades and the typed key point are drawn.
      const lab = sc.label ? `<b style="${A("pcIn", enter + 0.25, 0.4)}">${esc(sc.label)}</b>` : "";
      html += `<section class="scene fscene" style="${A("sinE", enter, 0.3, "ease-out")},${A("sout", exit, 0.3, "ease-in", "forwards").replace("animation:", "")}">
<div class="fsh-t"></div><div class="fsh-b"></div>${kw ? `<div class="ftxt">${lab}<p>${typed(kw, enter + 0.35)}</p></div>` : ""}</section>`;
    } else if (icon) {
      // Grid scene: white grid paper, the key point typed in brand blue, a 3D picture landing in the middle.
      html += `<section class="scene gscene" style="${A("inE", enter, 0.35, "ease-out")},${A("outE", exit, 0.35, "ease-in", "forwards").replace("animation:", "")}">
<div class="gpaper"></div>${kw ? `<p class="gtxt">${typed(kw, enter + 0.3, 0.06)}</p>` : ""}<div class="gico" style="${A("icoIn", enter + 0.5, 0.7, "cubic-bezier(.3,1.5,.5,1)")}"><img src="data:image/jpeg;base64,${jpg(icon)}" alt="" style="animation:icoFloat 3.2s ease-in-out ${(enter + 1.2).toFixed(2)}s infinite"></div></section>`;
    } else if (ph) {
      // Photo scene: the realistic photo fills the screen with a slow camera move; the key point sits on a card.
      const kb = ["kbA", "kbB", "kbC"][i % 3];
      const lab = sc.label ? `<b>${esc(sc.label)}</b>` : "";
      const key = kw ? `<div class="pcard" style="${A("pcIn", enter + 0.35, 0.5, "cubic-bezier(.22,1,.36,1)")}">${lab}<span>${esc(kw)}</span></div>` : "";
      html += `<section class="scene pscene" style="${A("inE", enter, 0.6, "ease-out")},${A("outE", exit, 0.42, "ease-in", "forwards").replace("animation:", "")}">
<div class="ph"><img src="data:image/jpeg;base64,${jpg(ph)}" alt="" style="${A(kb, enter, sc.dur + 0.6, "linear")}"></div><div class="phs"></div>${key}</section>`;
    } else {
      html += `<section class="scene" style="${A("in" + dir, enter, 0.6, "cubic-bezier(.22,1,.36,1)")},${A("out" + dir, exit, 0.42, "cubic-bezier(.55,0,.75,.35)", "forwards").replace("animation:", "")}">
<div class="stage" style="${A(i % 2 ? "camB" : "camA", enter, sc.dur + 0.3, "ease-in-out")}">${make(v, x, b64)}</div></section>`;
    }
    // The host presents from the space under the subtitles; a scene can hide him with visual.host = false (owner, 12 Nov 2026:
    // host only on the hook, the key explanation and the CTA).
    if (HOST && v.host !== false && (v.type !== "story" || ph || icon)) {
      const mood = { hook: "surprised", problem: "think", summary: "happy", cta: "wave" }[sc.role] || "smile";
      html += `<div class="host${ph ? " hsm" : ""}" style="${A("hostIn", enter + 0.05, 0.5, "cubic-bezier(.22,1,.36,1)")},${A("hostOut", exit, 0.35, "ease-in", "forwards").replace("animation:", "")}">${S.presenter(mood, 400, x, b64)}</div>`;
    }
    if (!EXPL && i > 0) html += `<div class="sweep" style="${A("sweep", sc.start - 0.3, 0.62, "cubic-bezier(.6,0,.3,1)", "both")}"><i></i><b></b></div>`;
    const sp = (sc.subs[1] || sc.subs[0]).start + 0.1;
    if (!EXPL) html += `<div class="spark ${i % 2 ? "sl" : "sr"}">` + [0, 1, 2, 3, 4, 5].map((k) =>
      `<span style="--a:${k * 60 + (i * 23) % 60}deg;--d:${110 + (k % 3) * 40}px;${A("burst", sp + k * 0.02, 0.9, "cubic-bezier(.2,.8,.3,1)", "both")}">${STAR}</span>`).join("") + `</div>`;
    sc.subs.forEach((s, j) => {
      html += `<div class="sub" style="${A(EXPL ? "sinE" : "sin", s.start, EXPL ? 0.18 : 0.24, "ease-out")},${A("sout", s.end - 0.1, 0.1, "ease-in", "forwards").replace("animation:", "")}"><span>${EXPL ? karaoke(sc, j, s) : highlight(s.text, sc.keyword)}</span></div>`;
    });
  });
  // The branded background fades out while clips play and back in for drawn scenes.
  const hidden = [];
  scenes.forEach((sc) => {
    if (!sc.foot) return;
    const a = sc.start - 0.15, b = sc.start + sc.dur - 0.25;
    if (hidden.length && a <= hidden[hidden.length - 1][1] + 0.2) hidden[hidden.length - 1][1] = b; else hidden.push([a, b]);
  });
  const pc = (t) => (Math.max(0, Math.min(total, t)) / total * 100).toFixed(3) + "%";
  let bgKeys = "0%{opacity:1}";
  hidden.forEach(([a, b]) => { bgKeys += `${pc(a)}{opacity:1}${pc(a + 0.3)}{opacity:0}${pc(b)}{opacity:0}${pc(b + 0.3)}{opacity:1}`; });
  bgKeys += "100%{opacity:1}";
  const hybrid = hidden.length > 0;
  const floats = EXPL ? "" : FLOAT.map((ic, k) => `<span class="fl" style="left:${[70, 860, 180, 760, 420, 940, 40, 600][k]}px;` +
    `animation:floatUp ${[11, 13, 9.5, 12, 14, 10.5, 12.5, 15][k]}s linear ${-[0, 4, 7, 2, 9, 5, 11, 3][k]}s infinite">${ic}</span>`).join("");
  const font = (f, w) => `@font-face{font-family:M;font-weight:${w};src:url(data:font/woff2;base64,${b64(f)}) format("woff2");unicode-range:U+1780-17FF,U+19E0-19FF,U+200C-200D,U+25CC}`;
  return `<!doctype html><html lang="km"><head><meta charset="utf-8"><style>
${font("assets/fonts/MiSansKhmer-Bold.woff2", 700)}${font("assets/fonts/MiSansKhmer-Medium.woff2", 500)}${font("assets/fonts/MiSansKhmer-Semibold.woff2", 600)}${font("assets/fonts/MiSansKhmer-Heavy.woff2", 800)}
@font-face{font-family:L;font-weight:400 800;src:url(data:font/woff2;base64,${b64("tools/fonts/kantumruy-latin.woff2")}) format("woff2")}
*{box-sizing:border-box;margin:0}
body{width:${W}px;height:${H}px;overflow:hidden;font-family:M,L,sans-serif;color:#fff;position:relative;background:#0b1430}
.bg{position:absolute;inset:0;background:linear-gradient(170deg,#0b1430 0%,#13235a 55%,#1b3a8c 100%)}
.grid{position:absolute;inset:-100px;background-image:radial-gradient(rgba(255,255,255,.09) 2px,transparent 2px);background-size:46px 46px;animation:pan ${total.toFixed(1)}s linear both}
.blob{position:absolute;border-radius:50%;filter:blur(60px)}
.b1{width:760px;height:760px;right:-260px;top:120px;background:rgba(63,125,255,.45);animation:drift1 ${total.toFixed(1)}s ease-in-out both}
.b2{width:640px;height:640px;left:-260px;bottom:120px;background:rgba(255,210,63,.18);animation:drift2 ${total.toFixed(1)}s ease-in-out both}
.prog{position:absolute;z-index:3;left:0;top:0;height:10px;width:100%;background:#ffd23f;transform-origin:left;animation:drawX ${end.toFixed(2)}s linear both}
.top{position:absolute;z-index:3;left:90px;right:90px;top:84px;display:flex;justify-content:space-between;align-items:center}
.logo{display:flex;align-items:center;gap:16px;padding:12px 24px 12px 16px;border-radius:22px;background:rgba(11,20,48,.72);border:2px solid rgba(255,255,255,.14)}
.logo .m{width:60px}.logo .w{width:220px}
.chip{font-size:34px;font-weight:500;padding:8px 26px 12px;border-radius:999px;background:#ffd23f;color:#0b1430}
.scene{position:absolute;inset:0;opacity:0}
.stage{position:absolute;left:90px;right:90px;top:260px;height:1010px}
.sub{position:absolute;z-index:3;left:90px;right:90px;bottom:390px;text-align:center;opacity:0;text-wrap:balance}
.sub span{display:inline;font-size:70px;line-height:1.62;font-weight:700;padding:4px 26px 12px;border-radius:18px;background:rgba(5,9,26,.78);
  -webkit-box-decoration-break:clone;box-decoration-break:clone}
.sub em{font-style:normal;color:#ffd23f}
.sub i{font-style:normal;color:rgba(255,255,255,.4)}
@keyframes lit{to{color:#fff}}
@keyframes litN{to{color:#ffd23f}}
${EXPL ? ".sub span{font-weight:600}" : ""}
.host{position:absolute;left:40px;bottom:-150px;opacity:0;z-index:2}
.host.hsm{left:10px;bottom:-110px;transform-origin:left bottom;scale:.72}
.pscene{z-index:1}
${hybrid ? `html,body{background:transparent!important}
.bgall{animation:bgHide ${total.toFixed(3)}s linear both}
@keyframes bgHide{${bgKeys}}` : ""}
.fsh-t{position:absolute;left:0;right:0;top:0;height:640px;background:linear-gradient(rgba(5,9,26,.78),rgba(5,9,26,0))}
.fsh-b{position:absolute;left:0;right:0;bottom:0;height:900px;background:linear-gradient(rgba(5,9,26,0),rgba(5,9,26,.88) 60%)}
.ftxt{position:absolute;left:80px;right:80px;top:240px;display:flex;flex-direction:column;align-items:flex-start;gap:16px}
.ftxt b{font-size:36px;font-weight:700;color:#0b1430;background:#ffd23f;padding:4px 22px 10px;border-radius:999px;opacity:0}
.ftxt p,.gtxt{font-size:96px;line-height:1.38;font-weight:800;color:#fff;text-shadow:0 6px 30px rgba(0,0,0,.65)}
.ftxt i,.gtxt i{font-style:normal;opacity:0}
.ftxt u,.gtxt u{display:inline-block;width:.42em;height:.95em;margin-left:6px;vertical-align:-.12em;background:#fff;opacity:0}
.gscene{z-index:1}
.gpaper{position:absolute;inset:0;background-color:#f7f8fc;background-image:linear-gradient(#dfe3ee 2px,transparent 2px),linear-gradient(90deg,#dfe3ee 2px,transparent 2px);background-size:72px 72px}
.gtxt{position:absolute;left:80px;right:80px;top:230px;color:#1f4fd1;text-shadow:none;text-align:center}
.gtxt u{background:#1f4fd1}
.gico{position:absolute;left:50%;top:640px;width:760px;height:760px;margin-left:-380px;opacity:0;mix-blend-mode:multiply}
.gico img{width:100%;height:100%;object-fit:contain}
@keyframes tyIn{from{opacity:0}to{opacity:1}}
@keyframes blink{0%{opacity:1}50%{opacity:0}}
@keyframes icoIn{from{opacity:0;transform:scale(.4) rotate(-12deg)}to{opacity:1;transform:none}}
@keyframes icoFloat{0%,100%{transform:translateY(0) rotate(0)}50%{transform:translateY(-22px) rotate(2deg)}}
.ph{position:absolute;inset:0;overflow:hidden;background:#0b1430}
.ph img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.phs{position:absolute;inset:0;background:linear-gradient(rgba(5,9,26,.72) 0,rgba(5,9,26,0) 22%,rgba(5,9,26,0) 48%,rgba(5,9,26,.82) 74%,rgba(5,9,26,.92) 100%)}
.pcard{position:absolute;left:90px;right:90px;top:250px;opacity:0;display:flex;flex-direction:column;align-items:flex-start;gap:14px}
.pcard b{font-size:36px;font-weight:700;color:#0b1430;background:#ffd23f;padding:4px 22px 10px;border-radius:999px}
.pcard span{font-size:74px;line-height:1.45;font-weight:800;color:#fff;background:rgba(5,9,26,.72);padding:6px 28px 16px;border-radius:24px;border-left:10px solid #ffd23f;-webkit-box-decoration-break:clone;box-decoration-break:clone}
@keyframes pcIn{from{opacity:0;transform:translateY(-30px)}to{opacity:1;transform:none}}
@keyframes kbA{from{transform:scale(1.04) translate(0,0)}to{transform:scale(1.16) translate(-20px,-30px)}}
@keyframes kbB{from{transform:scale(1.16) translate(20px,10px)}to{transform:scale(1.04) translate(0,0)}}
@keyframes kbC{from{transform:scale(1.06) translate(-24px,0)}to{transform:scale(1.14) translate(24px,-20px)}}
@keyframes hostIn{from{opacity:0;transform:translateY(80px)}to{opacity:1;transform:none}}
@keyframes hostOut{to{opacity:0;transform:translateY(40px)}}
@keyframes sinE{from{opacity:0}to{opacity:1}}
@keyframes inE{from{opacity:0;transform:scale(.97)}to{opacity:1;transform:none}}
@keyframes outE{to{opacity:0;transform:scale(1.02)}}
.intro,.outro{position:absolute;z-index:6;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:36px;text-align:center}
.intro{background:radial-gradient(circle at 50% 46%,#1f4fd1,#0b1430 72%);animation:introOut .4s ease-in .7s forwards}
.intro .m{width:250px;animation:popIn .5s cubic-bezier(.3,1.5,.5,1) .02s both}
.intro .w{width:520px;animation:rise .45s ease-out .15s both}
.intro i,.outro i{display:block;width:130px;height:12px;border-radius:12px;background:#ffd23f;transform-origin:center;animation:drawX .4s ease-out .3s both}
.outro{padding:0 110px;background:linear-gradient(165deg,#0b1430,#1c3f86 60%,#3f7dff);opacity:0;animation:fadeIn .45s ease-out ${end.toFixed(3)}s forwards}
.outro .m{width:230px;animation:popIn .6s cubic-bezier(.3,1.5,.5,1) ${(end + 0.15).toFixed(2)}s both}
.outro .w{width:540px;animation:rise .6s ease-out ${(end + 0.3).toFixed(2)}s both}
.outro i{animation-delay:${(end + 0.45).toFixed(2)}s}
.outro p{font-size:52px;line-height:1.6;font-weight:500;animation:rise .6s ease-out ${(end + 0.55).toFixed(2)}s both}
.outro .u{font-family:L,M,sans-serif;font-weight:800;font-size:66px;color:#0b1430;background:#ffd23f;padding:16px 52px;border-radius:28px;animation:rise .6s ease-out ${(end + 0.75).toFixed(2)}s both,pulse 1.1s ease-in-out ${(end + 1.4).toFixed(2)}s infinite}
.outro .f{font-size:44px;font-weight:700;padding:10px 34px 16px;border-radius:999px;border:3px solid rgba(255,255,255,.5);animation:rise .6s ease-out ${(end + 1.1).toFixed(2)}s both}
.outro small{font-family:L,M,sans-serif;font-size:42px;font-weight:600;opacity:.9;animation:rise .6s ease-out ${(end + 0.95).toFixed(2)}s both}
.sweep{position:absolute;inset:0;pointer-events:none;transform:translateX(-140%) skewX(-16deg);z-index:5}
.sweep i,.sweep b{position:absolute;top:-10%;bottom:-10%;display:block}
.sweep i{left:0;width:46%;background:#ffd23f}.sweep b{left:40%;width:30%;background:#3f7dff}
.spark{position:absolute;top:330px;width:0;height:0;z-index:4}.spark.sr{right:150px}.spark.sl{left:150px}
.spark span{position:absolute;left:-22px;top:-22px;width:44px;height:44px;opacity:0}
.fl{position:absolute;top:1960px;width:70px;height:70px;opacity:.16}
.intro .ring{position:absolute;left:50%;top:46%;width:300px;height:300px;margin:-150px 0 0 -150px;border-radius:50%;border:8px solid #ffd23f;opacity:0}
.intro .r1{animation:ring .7s ease-out .05s both}.intro .r2{animation:ring .7s ease-out .22s both;border-color:#fff}
.intro .rays{position:absolute;left:50%;top:46%;width:1400px;height:1400px;margin:-700px 0 0 -700px;opacity:0;
  background:repeating-conic-gradient(rgba(255,210,63,.18) 0 8deg,transparent 8deg 22deg);animation:rays .9s ease-out both}
.share{position:relative;display:flex;gap:44px;margin:6px 0 4px}
.sh{display:flex;flex-direction:column;align-items:center;gap:12px}
.sh span{width:150px;height:150px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 20px 50px rgba(0,0,0,.3)}
.sh svg{width:84px;height:84px}.sh b{font-family:L,M,sans-serif;font-size:40px;font-weight:800}
.tapsh{position:absolute;left:318px;top:82px;width:92px;height:92px}
@keyframes sweep{0%{transform:translateX(-140%) skewX(-16deg)}100%{transform:translateX(160%) skewX(-16deg)}}
@keyframes burst{0%{opacity:0;transform:rotate(var(--a)) translateX(0) scale(.2)}35%{opacity:1}100%{opacity:0;transform:rotate(var(--a)) translateX(var(--d)) scale(1)}}
@keyframes floatUp{from{transform:translateY(0) rotate(-8deg)}to{transform:translateY(-2250px) rotate(12deg)}}
@keyframes ring{0%{opacity:.9;transform:scale(.4)}100%{opacity:0;transform:scale(2.6)}}
@keyframes rays{0%{opacity:0;transform:rotate(0) scale(.6)}40%{opacity:1}100%{opacity:.55;transform:rotate(40deg) scale(1)}}
@keyframes inC{from{opacity:1;clip-path:circle(0% at 50% 45%)}to{opacity:1;clip-path:circle(150% at 50% 45%)}}
@keyframes outC{to{opacity:0;transform:scale(1.06)}}
@keyframes inD{from{opacity:0;transform:scale(1.22);filter:blur(10px)}to{opacity:1;transform:none;filter:none}}
@keyframes outD{to{opacity:0;transform:scale(.9)}}
@keyframes camA{from{transform:scale(1)}to{transform:scale(1.035) translateY(-10px)}}
@keyframes camB{from{transform:scale(1.035) translateY(-10px)}to{transform:scale(1)}}
@keyframes inA{from{opacity:0;transform:translateX(120px) scale(.97)}to{opacity:1;transform:none}}
@keyframes outA{to{opacity:0;transform:translateX(-120px) scale(.97)}}
@keyframes inB{from{opacity:0;transform:translateY(90px) scale(.97)}to{opacity:1;transform:none}}
@keyframes outB{to{opacity:0;transform:translateY(-90px) scale(.97)}}
@keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}
@keyframes sin{0%{opacity:0;transform:translateY(18px) scale(.92)}70%{opacity:1;transform:scale(1.03)}100%{opacity:1;transform:none}}
@keyframes sout{to{opacity:0}}
@keyframes introOut{to{opacity:0;transform:scale(1.08)}}
@keyframes fadeIn{to{opacity:1}}
@keyframes pan{from{transform:translateY(0)}to{transform:translateY(-92px)}}
@keyframes drift1{0%{transform:translate(0,0)}50%{transform:translate(-160px,260px)}100%{transform:translate(-40px,520px)}}
@keyframes drift2{0%{transform:translate(0,0)}50%{transform:translate(200px,-200px)}100%{transform:translate(60px,-420px)}}
${S.CSS}
${STYLE === "paper" ? PAPER : ""}
${STYLE === "neon" ? NEON : ""}
${css}
</style></head><body>
<div class="bgall"><div class="bg"></div><div class="grid"></div><span class="blob b1"></span><span class="blob b2"></span>${floats}</div>
<div class="top"><div class="logo"><img class="m" src="data:image/png;base64,${b64("assets/logo-mark-white.png")}" alt=""><img class="w" src="data:image/png;base64,${b64("assets/logo-word-white.png")}" alt=""></div>
<span class="chip">ចំណេះដឹងលក់អនឡាញ</span></div>
${html}
<div class="prog"></div>
<div class="intro"><span class="ring r1"></span><span class="ring r2"></span><span class="rays"></span><img class="m" src="data:image/png;base64,${b64("assets/logo-mark-white.png")}" alt=""><img class="w" src="data:image/png;base64,${b64("assets/logo-word-white.png")}" alt=""><i></i></div>
<div class="outro"><img class="m" src="data:image/png;base64,${b64("assets/logo-mark-white.png")}" alt=""><img class="w" src="data:image/png;base64,${b64("assets/logo-word-white.png")}" alt=""><i></i>
<p>មានប្រយោជន៍? ចែករំលែកទៅមិត្តអ្នកលក់ផង</p>
<div class="share">${[["heart", "Like"], ["share", "Share"], ["save", "Save"]].map(([k, t], j) => `<div class="sh" style="${A("popIn", end + 0.75 + j * 0.18, 0.5, "cubic-bezier(.3,1.6,.5,1)")}"><span>${SHARE[k]}</span><b>${t}</b></div>`).join("")}
<svg class="tapsh" width="120" height="120" viewBox="0 0 24 24" fill="#fff" stroke="#0b1430" stroke-width="1.2" style="${A("rise", end + 1.4, 0.4)},tap 1s ease-in-out ${(end + 1.8).toFixed(2)}s infinite"><path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V10l4.2.8a2 2 0 0 1 1.6 2.3l-.9 4.6A3 3 0 0 1 14 20H11a3 3 0 0 1-2.4-1.2L5.3 14.4a1.4 1.4 0 0 1 2-2z"/></svg></div>
<span class="u">adsbox.agency</span><span class="f">ចុច Follow ដើម្បីកុំឲ្យរំលង</span></div>
</body></html>`;
}

async function browser() {
  const { chromium } = require("playwright");
  try { return await chromium.launch(); } catch (e) { return await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }); }
}

async function frames(html, total, dir, alpha) {
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
    if (alpha) await pg.screenshot({ path: path.join(dir, String(f).padStart(5, "0") + ".png"), omitBackground: true });
    else await pg.screenshot({ path: path.join(dir, String(f).padStart(5, "0") + ".jpg"), type: "jpeg", quality: 93 });
  }
  await b.close();
}

// --- Clip track (clips style): each clip scene plays its clips one after another (quick cuts), with a gentle camera move.
function footageTrack(scenes, total, dir) {
  const inputs = ["-f", "lavfi", "-i", `color=c=0x0b1430:s=${W}x${H}:r=${FPS}:d=${total.toFixed(3)}`];
  let chain = "", prev = "[0:v]", k = 0;
  const moves = ["in", "panl", "out", "panr"];
  scenes.forEach((sc, i) => {
    if (!sc.foot) return;
    const a0 = Math.max(0, sc.start - 0.4), b0 = Math.min(total, sc.start + sc.dur + 0.3);
    const parts = sc.foot.length;
    sc.foot.forEach((clip, n) => {
      const a = a0 + (b0 - a0) * n / parts, b = a0 + (b0 - a0) * (n + 1) / parts, D = b - a, Ds = D.toFixed(3);
      const seg = path.join(dir, `foot${i}_${n}.mp4`), p = `(t/${Ds})`;
      const motion = { in: `scale=w='${W}*(1.0+0.08*${p})':h=-2:eval=frame,crop=${W}:${H}`, out: `scale=w='${W}*(1.08-0.07*${p})':h=-2:eval=frame,crop=${W}:${H}`,
        panl: `crop=${W}:${H}:x='(iw-${W})*(1-${p})':y='(ih-${H})/2'`, panr: `crop=${W}:${H}:x='(iw-${W})*${p}':y='(ih-${H})/2'` }[moves[k % 4]];
      run(["-ss", "0.3", "-stream_loop", "-1", "-i", clip.file, "-vf",
        `scale=${Math.round(W * 1.1)}:${Math.round(H * 1.1)}:force_original_aspect_ratio=increase,crop=${Math.round(W * 1.1)}:${Math.round(H * 1.1)},setsar=1,fps=${FPS},${motion},` +
        "eq=contrast=1.05:saturation=1.08:gamma=0.98,format=yuv420p",
        "-an", "-r", String(FPS), "-c:v", "libx264", "-preset", "veryfast", "-crf", "16", "-t", Ds, seg]);
      inputs.push("-i", seg);
      k++;
      chain += `[${k}:v]setpts=PTS-STARTPTS+${a.toFixed(3)}/TB[s${k}];${prev}[s${k}]overlay=0:0:eof_action=pass:enable='between(t,${a.toFixed(3)},${b.toFixed(3)})'[b${k}];`;
      prev = `[b${k}]`;
    });
  });
  const out = path.join(dir, "footage.mp4");
  run([...inputs, "-filter_complex", chain + `${prev}format=yuv420p[v]`, "-map", "[v]", "-r", String(FPS), "-c:v", "libx264", "-preset", "veryfast", "-crf", "16", "-t", total.toFixed(3), out]);
  return out;
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
  // Voice and sound effects on separate buses, so the music can step back whenever the narrator speaks.
  const isVoice = clips.map(([f]) => scenes.some((sc) => sc.voice === f));
  const vIdx = clips.map((_, i) => i).filter((i) => isVoice[i]), fIdx = clips.map((_, i) => i).filter((i) => !isVoice[i]);
  const bus = (idx, name) => idx.map((i) => `[a${i}]`).join("") + `amix=inputs=${idx.length}:normalize=0,apad=whole_dur=${total.toFixed(3)}[${name}]`;
  let mix = bus(fIdx, "sfx") + (vIdx.length ? ";" + bus(vIdx, "vox") : "");
  let last;
  if (vIdx.length) { mix += `;[vox]asplit=2[vo][vk];[vo][sfx]amix=inputs=2:normalize=0[fx]`; } else { mix += `;[sfx]anull[fx]`; }
  last = "[fx]";
  if (music) {
    inputs.push("-stream_loop", "-1", "-i", music);
    const m = clips.length, lo = Number(process.env.MUSIC_VOLUME || 0.085), hi = Math.min(0.42, lo * 3.4);
    const speechEnd = (total - OUTRO).toFixed(2);
    parts.push(`[${m}:a]aresample=44100,aformat=channel_layouts=stereo,atrim=0:${total.toFixed(3)},` +
      `volume='if(lt(t,0.8)+gt(t,${speechEnd}),${hi},${lo})':eval=frame,afade=t=in:d=0.3,afade=t=out:st=${(total - 1.5).toFixed(2)}:d=1.5[mu]`);
    // Ducking: the music dips a little more while the voice is speaking and comes back softly in the pauses.
    mix += vIdx.length ? `;[mu][vk]sidechaincompress=threshold=0.02:ratio=5:attack=25:release=400:makeup=1[mud];[fx][mud]amix=inputs=2:normalize=0[mx]`
      : `;[fx][mu]amix=inputs=2:normalize=0[mx]`;
    last = "[mx]";
  } else if (vIdx.length) {
    mix += `;[vk]anullsink`;
  }
  mix += `;${last}loudnorm=I=-14:TP=-1.5:LRA=9,alimiter=limit=0.9[out]`;
  const out = path.join(dir, "audio.wav");
  run([...inputs, "-filter_complex", parts.concat(mix).join(";"), "-map", "[out]", "-t", total.toFixed(3), "-ar", "44100", "-c:a", "pcm_s16le", out]);
  return out;
}

// --- Thumbnail 16:9 (not used: the owner's standard is a 1080x1920 thumbnail, see thumbnail()): navy brand card, big Khmer headline, the hook scene as a phone screen --------
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
.t{position:absolute;left:80px;right:80px;bottom:${HOST ? 820 : 360}px}
.t span{font-size:116px;line-height:1.42;font-weight:700;padding:4px 24px 14px;background:#ffd23f;color:#0b1430;border-radius:20px;-webkit-box-decoration-break:clone;box-decoration-break:clone}
.u{position:absolute;left:80px;bottom:${HOST ? 150 : 240}px;font-family:L,M,sans-serif;font-weight:800;font-size:46px}
.sh2{position:absolute;left:0;right:0;bottom:0;height:900px;background:linear-gradient(rgba(11,20,48,0),rgba(11,20,48,.99) 28%)}
.vkt{position:absolute;right:-30px;bottom:-120px;width:640px}
${S.PRESENTER === "toon" ? `.vkt{bottom:-40px;right:0}.toon svg{display:block;width:100%;height:auto}` : ""}
${STYLE === "paper" ? `.sh{background:linear-gradient(rgba(246,248,252,0) 35%,rgba(246,248,252,.94) 72%)}
.sh2{background:linear-gradient(rgba(246,248,252,0),#f6f8fc 28%)}
.t span{background:#0c1430;color:#fff}.t span:last-child{background:#ffd23f;color:#0c1430}.u{color:#0059e0}` : ""}
</style></head><body><div class="sh"></div>${HOST ? `<div class="sh2"></div>${S.PRESENTER === "toon" ? `<div class="vkt">${S.TOON.toon("happy", 640)}</div>` : `<img class="vkt" src="data:image/png;base64,${b64("assets/video/presenter/vannak-happy.png")}" alt="">`}` : ""}<div class="t"><span>${esc(script.thumbnail_text)}</span></div><div class="u">adsbox.agency</div></body></html>`, { waitUntil: "load" });
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
  const footArg = arg("--footage");
  const foot = footArg && fs.existsSync(footArg) ? JSON.parse(fs.readFileSync(footArg, "utf8")) : {};
  scenes.forEach((sc, i) => {
    delete sc.foot;
    const f = [].concat(foot[String(i)] || []).filter((c) => c && fs.existsSync(c.file));
    if (f.length && (sc.visual || {}).type !== "cta") sc.foot = f;
  });
  const hybrid = scenes.some((s) => s.foot);
  const t0 = Date.now();

  if (!process.argv.includes("--no-voice")) voice(scenes, path.join(work, "voice"));
  const total = timeline(scenes);
  // Toon presenter: mouth shape per frame from each scene's voice (lip sync).
  if (S.PRESENTER === "toon") scenes.forEach((sc) => { if (sc.voice && fs.existsSync(sc.voice)) sc.mouth = S.TOON.mouthLevels(sc.voice); });
  console.log(`Timeline ${total.toFixed(1)}s: ${scenes.length} scenes (${scenes.map((s) => (s.visual || {}).type).join(", ")}), subtitle timing: ${scenes.map((s) => s.sync).join(",")}`);

  const fdir = path.join(work, "frames"); fs.mkdirSync(fdir);
  await frames(page(script, scenes, total), total, fdir, hybrid);  // transparent frames when clips play underneath
  const music = arg("--music");
  const wav = sound(scenes, total, music && fs.existsSync(music) ? music : null, work);

  const slug = script.slug, mp4 = path.join(outDir, `${slug}.mp4`);
  const enc = ["-c:v", "libx264", "-preset", "medium", "-crf", "19", "-maxrate", "8M", "-bufsize", "16M",
    "-r", String(FPS), "-c:a", "aac", "-b:a", "192k", "-t", total.toFixed(3), "-movflags", "+faststart", mp4];
  if (!hybrid) {
    run(["-framerate", String(FPS), "-i", path.join(fdir, "%05d.jpg"), "-i", wav, "-map", "0:v", "-map", "1:a",
      "-vf", `scale=${W}:${H},format=yuv420p`, ...enc]);
  } else {
    const base = footageTrack(scenes, total, work);
    run(["-i", base, "-framerate", String(FPS), "-i", path.join(fdir, "%05d.png"), "-i", wav,
      "-filter_complex", "[0:v][1:v]overlay=0:0:format=auto,format=yuv420p[v]", "-map", "[v]", "-map", "2:a", ...enc]);
  }
  // JSON, not CSV: newer ffprobe versions add extra empty CSV fields.
  const vs = (JSON.parse(execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate", "-of", "json", mp4], { encoding: "utf8" })).streams || [])[0] || {};
  const dims = `${vs.width},${vs.height},${vs.r_frame_rate}`;
  if (dims !== `${W},${H},${FPS}/1`) throw new Error(`Output is ${dims}, expected ${W}x${H} at ${FPS} fps`);

  // Thumbnail from the moment the hook question is fully on screen.
  const hook = scenes[0], tf = Math.min(hook.start + hook.dur - 0.5, (hook.subs[hook.subs.length - 1].start || 1) + 0.8);
  let frame = path.join(fdir, String(Math.round(tf * FPS)).padStart(5, "0") + ".jpg");
  if (hybrid) { frame = path.join(work, "thumbframe.jpg"); run(["-ss", tf.toFixed(2), "-i", mp4, "-frames:v", "1", frame]); }
  const thumb = path.join(outDir, `${slug}-thumb.jpg`), cover = path.join(outDir, `${slug}-cover.jpg`);
  await thumbnail(script, fs.existsSync(frame) ? frame : path.join(fdir, "00030.jpg"), thumb, cover);

  const meta = {
    slug, style: hybrid ? "Pixabay clips + 3D pictures + motion graphics" : Object.keys(PHOTOS).length ? "AI photos + animation" : "custom animation only", photos: Object.keys(PHOTOS).length, duration: +probe(mp4).toFixed(2), size_mb: +(fs.statSync(mp4).size / 1e6).toFixed(1), resolution: `${W}x${H}`, fps: FPS,
    scenes: scenes.length, visuals: scenes.map((s) => (s.visual || {}).type), voice: scenes[0].voice ? (process.env.REEL_VOICE || "km-KH-PisethNeural") : "none",
    music: music ? path.basename(music) : "none", subtitle_sync: [...new Set(scenes.map((s) => s.sync))].join(","),
    render_seconds: Math.round((Date.now() - t0) / 1000),
    footage: scenes.map((s, i) => (s.foot ? { scene: i + 1, clips: s.foot.map((c) => ({ id: c.id, page: c.page, author: c.author, query: c.query })) } : null)).filter(Boolean),
    stock_footage: hybrid ? "pixabay" : "none",
    visual_mix: visualMix(scenes, total),
    // Kiri voice: how closely Kiri's own transcript of each scene's audio matches the script (1 = identical), and the timing source per scene.
    speech_match: scenes.map((s) => (s.match ?? null)), scene_sync: scenes.map((s) => s.sync),
    footage_share: hybrid ? +(scenes.filter((s) => s.foot).reduce((a, s) => a + s.dur, 0) / (total - OUTRO)).toFixed(2) : 0,
  };
  fs.writeFileSync(path.join(outDir, "meta.json"), JSON.stringify(meta, null, 1));
  fs.rmSync(work, { recursive: true, force: true });
  console.log(`Video made: ${mp4} (${meta.duration}s, ${meta.resolution} @ ${FPS} fps, ${meta.size_mb} MB, ${meta.render_seconds}s)`);
})().catch((e) => { console.error(e.stack || e); console.log("::error::render: " + String((e && e.stack) || e).split("\n").slice(0, 4).join(" | ").slice(0, 900)); process.exit(1); });
