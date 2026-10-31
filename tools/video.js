// Make a short vertical video (1080x1920, MP4) from one knowledge article, for Facebook Reels and TikTok.
// Run from the repo root:  node tools/video.js content/articles/<slug>.md [out.mp4] [--voice km-KH-PisethNeural] [--no-voice]
// Default output: videos/<slug>.mp4. Needs Playwright (Chromium), ffmpeg and, for the Khmer voice, edge-tts (pip).
// A Khmer voice reads each slide; each slide stays on screen as long as its voice needs.
// If the voice can't be made (no internet, edge-tts missing), the video is made without it.
// Each frame is drawn by Chromium with the animations paused at that moment, then ffmpeg joins frames, voice and sound effects.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const ROOT = path.join(__dirname, "..");

const FPS = 30;
const W = 1080, H = 1920;
const MIN_SLIDE = 3.5;   // seconds, when a slide has no voice
const VOICE_LEAD = 0.5;  // the voice starts this long after its slide appears
const VOICE_TAIL = 0.7;  // and the slide stays this long after the voice ends

const b64 = (f) => fs.readFileSync(path.join(ROOT, f)).toString("base64");
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const KH_DIGITS = "០១២៣៤៥៦៧៨៩";
const khNum = (n) => String(n).replace(/\d/g, (d) => KH_DIGITS[d]);
const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };

// Spoken Khmer for words the Khmer voice reads badly in English letters (only the voice uses these, not the screen).
const SAY = [["ADS BOX", "អេដស៍ប៊ក"], ["Order", "អូឌ័រ"], ["Admin", "អាដមីន"], ["Caption", "ខេបសិន"], ["Bundle", "បាន់ឌល"],
  ["Boost", "ប៊ូស្ត៍"], ["Post", "ប៉ុស្ត៍"], ["Live", "ឡាយ"], ["Facebook", "ហ្វេសប៊ុក"], ["TikTok", "ធីកតុក"], ["Telegram", "តេឡេក្រាម"],
  ["Page", "ផេក"], ["Messenger", "មេសេនជ័រ"], ["Promotion", "ប្រូម៉ូសិន"], ["Comment", "ខមមិន"], ["Inbox", "អ៊ីនប្រុក"], ["Target", "ថាហ្គេត"]];
const spoken = (t) => SAY.reduce((s, [en, kh]) => s.replace(new RegExp("\\b" + en + "\\b", "gi"), kh), String(t)).replace(/[()…«»"]/g, " ");
const KH_ORD = ["មួយ", "ពីរ", "បី", "បួន", "ប្រាំ", "ប្រាំមួយ"];

// The slides, with what the voice says on each, in a friendly spoken style.
function slides(s) {
  const out = [];
  out.push({ say: spoken(`សួស្តីបងប្អូន! ថ្ងៃនេះ ADS BOX មានគន្លឹះល្អៗ មកចែករំលែក។ ${s.title}`), pops: [0.35, 0.55, 0.75], html: `
    <span class="tag in d1">${esc(s.tag)}</span>
    <h1 class="title in d2">${esc(s.title)}</h1>
    <div class="stickers"><span class="e main pop bob d3">${s.emoji[0]}</span><span class="e b1 pop bob d4">${s.emoji[1]}</span><span class="e b2 pop bob d5">${s.emoji[2]}</span></div>` });
  if (s.summary) out.push({ say: spoken(s.summary), pops: [0.15], html: `
    <span class="e solo pop bob d1">💡</span>
    <p class="lead in d2">${esc(s.summary)}</p>` });
  s.points.forEach((p, i) => out.push({ say: spoken(`ចំណុចទី${KH_ORD[i]}, ${p.head}។ ${p.text}`), pops: [0.15], html: `
    <span class="num pop d1">${khNum(i + 1)}</span>
    <h2 class="head in d2">${esc(p.head)}<i class="mark-line d3"></i></h2>
    ${p.text ? `<p class="text in d3">${esc(p.text)}</p>` : ""}` }));
  out.push({ say: spoken("បើបងប្អូនចង់អានលម្អិត សូមចូលទៅកាន់វេបសាយ ADS BOX។ ហើយបើចង់ឲ្យក្រុមយើងជួយ ឆាតមកយើងតាម Telegram បានភ្លាមៗ។ អរគុណបងប្អូន!"), pops: [0.15], html: `
    <img class="mark pop d1" src="data:image/png;base64,${b64("assets/logo-mark-white.png")}" alt="">
    <h2 class="head in d2">អានអត្ថបទពេញ</h2>
    <p class="url in d3">${esc(s.url)}</p>
    <p class="cta in d4">ឆាតជាមួយក្រុម ADS BOX<br><b>Telegram: t.me/vannakdm</b></p>` });
  return out;
}

function voice(list, voiceName, dir) {
  try {
    const lens = JSON.parse(execFileSync("python3", [path.join(__dirname, "tts.py"), voiceName, dir, ...list.map((sl) => sl.say)], { encoding: "utf8" }));
    list.forEach((sl, i) => { sl.voice = path.join(dir, i + ".mp3"); sl.voiceLen = lens[i]; });
    return true;
  } catch (e) {
    console.log("Warning: Khmer voice could not be made, the video will have sound effects only. " + String(e.message || e).split("\n")[0]);
    return false;
  }
}

function timeline(list) {
  let t = 0;
  for (const sl of list) {
    sl.dur = Math.max(MIN_SLIDE, sl.voiceLen ? VOICE_LEAD + sl.voiceLen + VOICE_TAIL : 0);
    sl.start = t; t += sl.dur;
  }
  return t;
}

// Small floating dots in the background; positions come from a fixed pattern so every video looks the same.
function particles(total) {
  let h = "", css = "";
  for (let i = 0; i < 18; i++) {
    const x = (i * 137) % 1000 + 40, size = 8 + (i * 7) % 22, dur = 6 + (i % 5) * 1.7, delay = -((i * 1.3) % dur);
    css += `.p${i} { left: ${x}px; width: ${size}px; height: ${size}px; animation: float ${dur}s linear ${delay}s infinite; opacity: ${0.15 + (i % 4) * 0.1}; }`;
    h += `<span class="p p${i}"></span>`;
  }
  return { h, css };
}

function page(s, list, total) {
  const d = (sl, k) => sl.start + [0, 0.15, 0.35, 0.6, 0.8, 1][k];
  const slideCss = list.map((sl, i) => `
    .s${i} { animation: show ${sl.dur}s linear ${sl.start}s both; }
    ${[1, 2, 3, 4, 5].map((k) => `.s${i} .d${k} { animation-delay: ${d(sl, k)}s; }`).join(" ")}
    .s${i} .bob.d3, .s${i} .bob.d4, .s${i} .bob.d5, .s${i} .bob.d1 { animation-delay: ${d(sl, 1)}s, ${d(sl, 1) + 0.6}s; }
    .s${i} .mark-line { animation-delay: ${d(sl, 3) + 0.2}s; }`).join("");
  const flashCss = list.slice(1).map((sl, i) => `.f${i} { animation: flash .35s ease-out ${sl.start - 0.05}s both; }`).join("");
  const p = particles(total);
  const html = `<!doctype html><html lang="km"><head><meta charset="utf-8"><style>
@font-face { font-family: M; font-weight: 700; src: url(data:font/woff2;base64,${b64("assets/fonts/MiSansKhmer-Bold.woff2")}) format("woff2"); unicode-range: U+1780-17FF, U+19E0-19FF, U+200C-200D, U+25CC; }
@font-face { font-family: M; font-weight: 500; src: url(data:font/woff2;base64,${b64("assets/fonts/MiSansKhmer-Medium.woff2")}) format("woff2"); unicode-range: U+1780-17FF, U+19E0-19FF, U+200C-200D, U+25CC; }
@font-face { font-family: L; font-weight: 400 700; src: url(data:font/woff2;base64,${b64("tools/fonts/kantumruy-latin.woff2")}) format("woff2"); }
* { box-sizing: border-box; margin: 0; }
body { width: ${W}px; height: ${H}px; overflow: hidden; font-family: M, L, "Noto Color Emoji", sans-serif; color: #fff;
  background: linear-gradient(160deg, #0c1430 0%, #1c3f86 55%, #3f7dff 100%); }
.bg { position: absolute; inset: 0; overflow: hidden; }
.glow { position: absolute; border-radius: 50%; }
.g1 { width: 900px; height: 900px; right: -300px; top: -200px; background: radial-gradient(circle, rgba(124,108,255,.45), rgba(124,108,255,0) 65%); animation: drift ${total}s linear both; }
.g2 { width: 800px; height: 800px; left: -300px; bottom: -200px; background: radial-gradient(circle, rgba(43,179,163,.35), rgba(43,179,163,0) 65%); animation: drift2 ${total}s linear both; }
.p { position: absolute; bottom: -40px; border-radius: 50%; background: #fff; }
${p.css}
.flash { position: absolute; inset: 0; background: #fff; opacity: 0; pointer-events: none; }
${flashCss}
.top { position: absolute; top: 90px; left: 80px; right: 80px; display: flex; justify-content: space-between; align-items: center; }
.top img { width: 300px; }
.bar { position: absolute; top: 60px; left: 80px; right: 80px; height: 8px; border-radius: 8px; background: rgba(255,255,255,.18); overflow: hidden; }
.bar i { display: block; height: 100%; background: linear-gradient(90deg, #ffd23f, #fff); transform-origin: left; animation: grow ${total}s linear both; }
.foot { position: absolute; bottom: 110px; left: 0; right: 0; text-align: center; font-family: L, M; font-weight: 600; font-size: 38px; opacity: .85; }
.slide { position: absolute; left: 80px; right: 80px; top: 300px; bottom: 260px; display: flex; flex-direction: column; justify-content: center; gap: 44px; opacity: 0; }
.tag { align-self: flex-start; font-size: 44px; font-weight: 500; padding: 10px 34px; border-radius: 999px; background: rgba(255,255,255,.16); border: 3px solid rgba(255,255,255,.35); }
.title { font-size: ${s.title.length > 60 ? 82 : 92}px; line-height: 1.5; font-weight: 700; }
.stickers { position: relative; height: 420px; }
.e { position: absolute; font-family: "Noto Color Emoji"; line-height: 1; display: grid; place-items: center; background: #fff; box-shadow: 0 40px 80px rgba(0,0,0,.35); }
.main { width: 340px; height: 340px; left: 300px; top: 30px; font-size: 210px; border-radius: 80px; --r: -8deg; }
.b1 { width: 170px; height: 170px; left: 700px; top: 0; font-size: 100px; border-radius: 50%; --r: 10deg; }
.b2 { width: 150px; height: 150px; left: 120px; top: 250px; font-size: 88px; border-radius: 50%; --r: -12deg; }
.solo { position: relative; width: 220px; height: 220px; font-size: 130px; border-radius: 60px; --r: -6deg; }
.lead { font-size: 68px; line-height: 1.6; font-weight: 500; }
.num { width: 200px; height: 200px; border-radius: 56px; background: #fff; color: #1c4b9b; font-size: 130px; font-weight: 700; display: grid; place-items: center; --r: -6deg; box-shadow: 0 30px 60px rgba(0,0,0,.3); }
.head { position: relative; font-size: 92px; line-height: 1.45; font-weight: 700; padding-bottom: 18px; }
.mark-line { position: absolute; left: 0; bottom: 0; width: 260px; height: 14px; border-radius: 14px; background: #ffd23f; transform-origin: left; animation: line .5s ease-out both; }
.text { font-size: 60px; line-height: 1.6; font-weight: 500; opacity: .92; }
.mark { width: 240px; --r: 0deg; }
.url { font-family: L, M; font-size: 52px; font-weight: 600; background: #fff; color: #0c1430; padding: 18px 34px; border-radius: 24px; align-self: flex-start; }
.cta { font-size: 56px; line-height: 1.6; font-weight: 500; }
.cta b { font-family: L, M; font-weight: 700; }
.in { animation: rise .7s cubic-bezier(.2,.8,.2,1) both; }
.pop { animation: pop .6s cubic-bezier(.3,1.6,.5,1) both; }
.pop.bob { animation: pop .6s cubic-bezier(.3,1.6,.5,1) both, bob 2.4s ease-in-out infinite; }
@keyframes show { 0% { opacity: 0; transform: scale(1.08); filter: blur(14px); } 7% { opacity: 1; transform: scale(1); filter: blur(0); }
  90% { opacity: 1; transform: scale(1.025); filter: blur(0); } 100% { opacity: 0; transform: translateX(-140px) scale(1.025); filter: blur(10px); } }
@keyframes rise { from { opacity: 0; transform: translateY(70px); filter: blur(6px); } to { opacity: 1; transform: none; filter: blur(0); } }
@keyframes pop { from { opacity: 0; transform: scale(.2) rotate(-25deg); } to { opacity: 1; transform: scale(1) rotate(var(--r)); } }
@keyframes bob { 0%, 100% { translate: 0 0; } 50% { translate: 0 -18px; } }
@keyframes line { from { transform: scaleX(0); } to { transform: scaleX(1); } }
@keyframes grow { from { transform: scaleX(0); } to { transform: scaleX(1); } }
@keyframes flash { 0% { opacity: 0; } 30% { opacity: .22; } 100% { opacity: 0; } }
@keyframes float { from { transform: translateY(0); } to { transform: translateY(-2000px); } }
@keyframes drift { from { transform: translate(0,0); } to { transform: translate(-200px, 300px); } }
@keyframes drift2 { from { transform: translate(0,0); } to { transform: translate(200px, -300px); } }
${slideCss}
</style></head><body>
<div class="bg"><span class="glow g1"></span><span class="glow g2"></span>${p.h}</div>
<div class="bar"><i></i></div>
<div class="top"><img src="data:image/png;base64,${b64("assets/logo-word-white.png")}" alt=""></div>
${list.map((sl, i) => `<section class="slide s${i}">${sl.html}</section>`).join("\n")}
<div class="foot">adsbox.agency</div>
${list.slice(1).map((sl, i) => `<div class="flash f${i}"></div>`).join("")}
</body></html>`;
  return html;
}

// Sound effects made by ffmpeg: a soft whoosh for each new slide and a pop for stickers and numbers.
function sfx(dir) {
  const whoosh = path.join(dir, "whoosh.wav"), pop = path.join(dir, "pop.wav");
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "anoisesrc=d=0.55:c=pink:a=0.6",
    "-af", "highpass=f=500,lowpass=f=3500,afade=t=in:d=0.25,afade=t=out:st=0.25:d=0.3,volume=0.35", whoosh]);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "sine=f=660:d=0.14",
    "-af", "asetrate=44100*1.6,aresample=44100,afade=t=out:st=0.02:d=0.12,volume=0.3", pop]);
  return { whoosh, pop };
}

function audio(list, total, dir, out) {
  const fx = sfx(dir);
  const clips = [];  // [file, seconds]
  list.forEach((sl, i) => {
    if (i > 0) clips.push([fx.whoosh, Math.max(0, sl.start - 0.2)]);
    (sl.pops || []).forEach((p) => clips.push([fx.pop, sl.start + p]));
    if (sl.voice) clips.push([sl.voice, sl.start + VOICE_LEAD]);
  });
  const inputs = [], parts = [];
  clips.forEach(([f, t], i) => {
    inputs.push("-i", f);
    const ms = Math.round(t * 1000);
    parts.push(`[${i}:a]aresample=44100,aformat=channel_layouts=stereo,adelay=${ms}|${ms}[a${i}]`);
  });
  const mix = clips.map((_, i) => `[a${i}]`).join("") + `amix=inputs=${clips.length}:normalize=0,alimiter=limit=0.9,apad=whole_dur=${total.toFixed(3)}[out]`;
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...inputs, "-filter_complex", parts.concat(mix).join(";"), "-map", "[out]", "-t", total.toFixed(3), "-c:a", "pcm_s16le", out]);
}

(async () => {
  const src = process.argv[2];
  if (!src) { console.error("usage: node tools/video.js content/articles/<slug>.md [out.mp4] [--voice NAME] [--no-voice]"); process.exit(2); }
  const s = JSON.parse(execFileSync("python3", [path.join(__dirname, "video_script.py"), src], { encoding: "utf8" }));
  const outArg = process.argv[3] && !process.argv[3].startsWith("--") ? process.argv[3] : null;
  const out = outArg || path.join(ROOT, "videos", s.slug + ".mp4");
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "adsbox-video-"));
  const frames = path.join(work, "frames"); fs.mkdirSync(frames);

  const list = slides(s);
  if (!process.argv.includes("--no-voice")) voice(list, arg("--voice") || "km-KH-SreymomNeural", path.join(work, "voice"));
  const total = timeline(list);

  const { chromium } = require("playwright");
  let browser;
  try { browser = await chromium.launch(); } catch (e) { browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }); }
  const pg = await browser.newPage({ viewport: { width: W, height: H } });
  await pg.setContent(page(s, list, total), { waitUntil: "load" });
  await pg.evaluate(() => document.fonts.ready);
  const n = Math.round(total * FPS);
  for (let f = 0; f < n; f++) {
    await pg.evaluate((ms) => document.getAnimations().forEach((a) => { a.pause(); a.currentTime = ms; }), (f * 1000) / FPS);
    await pg.screenshot({ path: path.join(frames, String(f).padStart(5, "0") + ".jpg"), type: "jpeg", quality: 92 });
  }
  await browser.close();

  const wav = path.join(work, "audio.wav");
  audio(list, total, work, wav);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", path.join(frames, "%05d.jpg"), "-i", wav,
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "medium", "-crf", "20", "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart", out]);
  fs.rmSync(work, { recursive: true, force: true });
  console.log(`Video made: ${out} (${total.toFixed(1)}s${list[0].voice ? ", with voice" : ", no voice"})`);
})();
