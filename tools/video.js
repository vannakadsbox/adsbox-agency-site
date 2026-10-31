// Make a short vertical video (1080x1920, MP4) from one knowledge article, for Facebook Reels and TikTok.
// Run from the repo root:  node tools/video.js content/articles/<slug>.md [out.mp4]
// Default output: videos/<slug>.mp4. Needs Playwright (Chromium) and ffmpeg.
// Each frame is drawn by Chromium with the animations paused at that moment, then ffmpeg joins the frames.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const ROOT = path.join(__dirname, "..");

const FPS = 30;
const W = 1080, H = 1920;
// Seconds on screen for each slide.
const T_TITLE = 4.5, T_SUMMARY = 4.5, T_POINT = 4.5, T_END = 4.5;

const b64 = (f) => fs.readFileSync(path.join(ROOT, f)).toString("base64");
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const KH_DIGITS = "០១២៣៤៥៦៧៨៩";
const khNum = (n) => String(n).replace(/\d/g, (d) => KH_DIGITS[d]);

function slides(s) {
  const out = [];
  out.push({ dur: T_TITLE, html: `
    <span class="tag in d1">${esc(s.tag)}</span>
    <h1 class="title in d2">${esc(s.title)}</h1>
    <div class="stickers"><span class="e main pop d3">${s.emoji[0]}</span><span class="e b1 pop d4">${s.emoji[1]}</span><span class="e b2 pop d5">${s.emoji[2]}</span></div>` });
  if (s.summary) out.push({ dur: T_SUMMARY, html: `
    <span class="e solo pop d1">💡</span>
    <p class="lead in d2">${esc(s.summary)}</p>` });
  s.points.forEach((p, i) => out.push({ dur: T_POINT, html: `
    <span class="num pop d1">${khNum(i + 1)}</span>
    <h2 class="head in d2">${esc(p.head)}</h2>
    ${p.text ? `<p class="text in d3">${esc(p.text)}</p>` : ""}` }));
  out.push({ dur: T_END, html: `
    <img class="mark pop d1" src="data:image/png;base64,${b64("assets/logo-mark-white.png")}" alt="">
    <h2 class="head in d2">អានអត្ថបទពេញ</h2>
    <p class="url in d3">${esc(s.url)}</p>
    <p class="cta in d4">ឆាតជាមួយក្រុម ADS BOX<br><b>Telegram: t.me/vannakdm</b></p>` });
  let t = 0;
  for (const sl of out) { sl.start = t; t += sl.dur; }
  return { list: out, total: t };
}

function page(s) {
  const { list, total } = slides(s);
  const slideCss = list.map((sl, i) => `
    .s${i} { animation: show ${sl.dur}s linear ${sl.start}s both; }
    .s${i} .d1 { animation-delay: ${sl.start + 0.15}s; } .s${i} .d2 { animation-delay: ${sl.start + 0.35}s; }
    .s${i} .d3 { animation-delay: ${sl.start + 0.6}s; } .s${i} .d4 { animation-delay: ${sl.start + 0.8}s; } .s${i} .d5 { animation-delay: ${sl.start + 1}s; }`).join("");
  const html = `<!doctype html><html lang="km"><head><meta charset="utf-8"><style>
@font-face { font-family: M; font-weight: 700; src: url(data:font/woff2;base64,${b64("assets/fonts/MiSansKhmer-Bold.woff2")}) format("woff2"); unicode-range: U+1780-17FF, U+19E0-19FF, U+200C-200D, U+25CC; }
@font-face { font-family: M; font-weight: 500; src: url(data:font/woff2;base64,${b64("assets/fonts/MiSansKhmer-Medium.woff2")}) format("woff2"); unicode-range: U+1780-17FF, U+19E0-19FF, U+200C-200D, U+25CC; }
@font-face { font-family: L; font-weight: 400 700; src: url(data:font/woff2;base64,${b64("tools/fonts/kantumruy-latin.woff2")}) format("woff2"); }
* { box-sizing: border-box; margin: 0; }
body { width: ${W}px; height: ${H}px; overflow: hidden; font-family: M, L, "Noto Color Emoji", sans-serif; color: #fff;
  background: linear-gradient(160deg, #0c1430 0%, #1c3f86 55%, #3f7dff 100%); }
.bg { position: absolute; inset: 0; overflow: hidden; }
.glow { position: absolute; border-radius: 50%; filter: blur(10px); }
.g1 { width: 900px; height: 900px; right: -300px; top: -200px; background: radial-gradient(circle, rgba(124,108,255,.45), rgba(124,108,255,0) 65%); animation: drift ${total}s linear both; }
.g2 { width: 800px; height: 800px; left: -300px; bottom: -200px; background: radial-gradient(circle, rgba(43,179,163,.35), rgba(43,179,163,0) 65%); animation: drift2 ${total}s linear both; }
.top { position: absolute; top: 90px; left: 80px; right: 80px; display: flex; justify-content: space-between; align-items: center; }
.top img { width: 300px; }
.bar { position: absolute; top: 60px; left: 80px; right: 80px; height: 8px; border-radius: 8px; background: rgba(255,255,255,.18); overflow: hidden; }
.bar i { display: block; height: 100%; background: #fff; transform-origin: left; animation: grow ${total}s linear both; }
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
.head { font-size: 92px; line-height: 1.45; font-weight: 700; }
.text { font-size: 60px; line-height: 1.6; font-weight: 500; opacity: .92; }
.mark { width: 240px; --r: 0deg; }
.url { font-family: L, M; font-size: 46px; font-weight: 600; background: #fff; color: #0c1430; padding: 18px 30px; border-radius: 24px; align-self: flex-start; word-break: break-all; }
.cta { font-size: 56px; line-height: 1.6; font-weight: 500; }
.cta b { font-family: L, M; font-weight: 700; }
.in { animation: rise .6s cubic-bezier(.2,.8,.2,1) both; }
.pop { animation: pop .6s cubic-bezier(.3,1.6,.5,1) both; }
@keyframes show { 0% { opacity: 0; transform: translateY(40px); } 6% { opacity: 1; transform: none; } 92% { opacity: 1; transform: none; } 100% { opacity: 0; transform: translateY(-40px); } }
@keyframes rise { from { opacity: 0; transform: translateY(60px); } to { opacity: 1; transform: none; } }
@keyframes pop { from { opacity: 0; transform: scale(.3) rotate(0deg); } to { opacity: 1; transform: scale(1) rotate(var(--r)); } }
@keyframes grow { from { transform: scaleX(0); } to { transform: scaleX(1); } }
@keyframes drift { from { transform: translate(0,0); } to { transform: translate(-200px, 300px); } }
@keyframes drift2 { from { transform: translate(0,0); } to { transform: translate(200px, -300px); } }
${slideCss}
</style></head><body>
<div class="bg"><span class="glow g1"></span><span class="glow g2"></span></div>
<div class="bar"><i></i></div>
<div class="top"><img src="data:image/png;base64,${b64("assets/logo-word-white.png")}" alt=""></div>
${list.map((sl, i) => `<section class="slide s${i}">${sl.html}</section>`).join("\n")}
<div class="foot">adsbox.agency</div>
</body></html>`;
  return { html, total };
}

(async () => {
  const src = process.argv[2];
  if (!src) { console.error("usage: node tools/video.js content/articles/<slug>.md [out.mp4]"); process.exit(2); }
  const s = JSON.parse(execFileSync("python3", [path.join(__dirname, "video_script.py"), src], { encoding: "utf8" }));
  const out = process.argv[3] || path.join(ROOT, "videos", s.slug + ".mp4");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const { html, total } = page(s);
  const frames = fs.mkdtempSync(path.join(os.tmpdir(), "adsbox-video-"));
  const { chromium } = require("playwright");
  let browser;
  try { browser = await chromium.launch(); } catch (e) { browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }); }
  const pg = await browser.newPage({ viewport: { width: W, height: H } });
  await pg.setContent(html, { waitUntil: "load" });
  await pg.evaluate(() => document.fonts.ready);
  const n = Math.round(total * FPS);
  for (let f = 0; f < n; f++) {
    await pg.evaluate((ms) => document.getAnimations().forEach((a) => { a.pause(); a.currentTime = ms; }), (f * 1000) / FPS);
    await pg.screenshot({ path: path.join(frames, String(f).padStart(5, "0") + ".jpg"), type: "jpeg", quality: 92 });
  }
  await browser.close();
  // Silent audio track: Facebook and TikTok handle videos with sound better, and music can be added in their apps.
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", path.join(frames, "%05d.jpg"),
    "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100", "-shortest",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "medium", "-crf", "20", "-c:a", "aac", "-movflags", "+faststart", out]);
  fs.rmSync(frames, { recursive: true, force: true });
  console.log(`Video made: ${path.relative(ROOT, out)} (${total.toFixed(1)}s)`);
})();
