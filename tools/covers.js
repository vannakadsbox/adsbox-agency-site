// Make a Facebook share picture (1200x630) for each article, matching the cover at the top of its page.
// Run from the repo root:  node tools/covers.js        (only makes pictures that are missing)
//                          node tools/covers.js --all  (remakes every picture)
// Pictures are saved to assets/covers/<article id>.png. tools/build.py then uses them as og:image.
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
global.window = {};
require(path.join(ROOT, "articles.js"));

const GRADS = [
  "linear-gradient(135deg, #0c1430 0%, #1c4b9b 60%, #3f7dff 100%)",
  "linear-gradient(135deg, #0c1430 0%, #3b2f8f 55%, #7c6cff 100%)",
  "linear-gradient(135deg, #0c1430 0%, #11607a 55%, #2bb3a3 100%)",
];
// Same rule as variant() in tools/build.py, so the picture matches the page cover.
const variant = (id) => [...id].reduce((s, c) => s + c.charCodeAt(0), 0) % 3;
const b64 = (f) => fs.readFileSync(path.join(ROOT, f)).toString("base64");
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function html(a) {
  const E = (a.emoji && a.emoji.length >= 3) ? a.emoji : ["📣", "💬", "📈"];
  return `<!doctype html><html lang="km"><head><meta charset="utf-8"><style>
@font-face { font-family: K; font-weight: 400 700; src: url(data:font/woff2;base64,${b64("tools/fonts/kantumruy-khmer.woff2")}) format("woff2"); unicode-range: U+1780-17FF, U+19E0-19FF, U+200C-200D, U+25CC; }
@font-face { font-family: K; font-weight: 400 700; src: url(data:font/woff2;base64,${b64("tools/fonts/kantumruy-latin.woff2")}) format("woff2"); }
* { box-sizing: border-box; margin: 0; }
body { width: 1200px; height: 630px; overflow: hidden; font-family: K, "Inter", "Noto Color Emoji", sans-serif; }
.c { position: relative; width: 1200px; height: 630px; padding: 64px 72px 72px; display: flex; flex-direction: column; justify-content: flex-end; gap: 22px; color: #fff; background: ${GRADS[variant(a.id)]}; overflow: hidden; isolation: isolate; }
.logo { position: absolute; top: 60px; left: 72px; width: 240px; }
.tag { align-self: flex-start; font-size: 26px; font-weight: 600; padding: 6px 22px; border-radius: 999px; background: rgba(255,255,255,.16); border: 2px solid rgba(255,255,255,.3); }
h1 { font-size: ${a.title.kh.length > 40 ? 54 : 62}px; font-weight: 700; line-height: 1.45; max-width: 680px; }
.url { position: absolute; bottom: 40px; right: 72px; font-size: 22px; font-weight: 600; color: #0c1430; background: #fff; padding: 6px 22px; border-radius: 999px; }
.glow { position: absolute; z-index: -1; width: 620px; height: 620px; right: -120px; top: -40px; border-radius: 50%; background: radial-gradient(circle, rgba(255,255,255,.30), rgba(255,255,255,0) 68%); }
.e { position: absolute; font-family: "Noto Color Emoji"; line-height: 1; display: grid; place-items: center; }
.main { width: 280px; height: 280px; right: 120px; top: 120px; font-size: 170px; border-radius: 64px; transform: rotate(-8deg); background: linear-gradient(160deg, #ffffff, #e6eeff); box-shadow: 0 40px 80px rgba(0,0,0,.35), inset 0 -10px 0 rgba(28,75,155,.12); }
.b1 { width: 132px; height: 132px; right: 56px; top: 54px; font-size: 76px; border-radius: 50%; background: #fff; box-shadow: 0 24px 50px rgba(0,0,0,.3); transform: rotate(10deg); }
.b2 { width: 116px; height: 116px; right: 330px; top: 410px; font-size: 64px; border-radius: 50%; background: #fff; box-shadow: 0 24px 50px rgba(0,0,0,.3); transform: rotate(-12deg); }
.dot { position: absolute; border-radius: 50%; }
.d1 { width: 34px; height: 34px; right: 330px; top: 96px; background: #3ccf8e; }
.d2 { width: 22px; height: 22px; right: 70px; top: 440px; background: #ffd23f; }
.d3 { width: 16px; height: 16px; right: 440px; top: 160px; background: rgba(255,255,255,.7); }
</style></head><body><div class="c">
<span class="glow"></span><span class="dot d1"></span><span class="dot d2"></span><span class="dot d3"></span>
<span class="e main">${E[0]}</span><span class="e b1">${E[1]}</span><span class="e b2">${E[2]}</span>
<img class="logo" src="data:image/png;base64,${b64("assets/logo-word-white.png")}" alt="">
<span class="url">adsbox.agency</span>
<span class="tag">${esc(a.tag.kh)}</span>
<h1>${esc(a.title.kh)}</h1>
</div></body></html>`;
}

(async () => {
  const all = process.argv.includes("--all");
  const outDir = path.join(ROOT, "assets", "covers");
  fs.mkdirSync(outDir, { recursive: true });
  const todo = window.ARTICLES.filter((a) => !a.cover && (all || !fs.existsSync(path.join(outDir, a.id + ".png"))));
  if (!todo.length) return console.log("Covers: nothing to make");
  const { chromium } = require("playwright");
  let browser;
  try { browser = await chromium.launch(); } catch (e) { browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }); }
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  for (const a of todo) {
    await page.setContent(html(a), { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(outDir, a.id + ".png") });
    console.log("Cover made: assets/covers/" + a.id + ".png");
  }
  await browser.close();
})();
