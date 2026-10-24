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
  return `<!doctype html><html lang="km"><head><meta charset="utf-8"><style>
@font-face { font-family: K; font-weight: 400 700; src: url(data:font/woff2;base64,${b64("tools/fonts/kantumruy-khmer.woff2")}) format("woff2"); unicode-range: U+1780-17FF, U+19E0-19FF, U+200C-200D, U+25CC; }
@font-face { font-family: K; font-weight: 400 700; src: url(data:font/woff2;base64,${b64("tools/fonts/kantumruy-latin.woff2")}) format("woff2"); }
* { box-sizing: border-box; margin: 0; }
body { width: 1200px; height: 630px; overflow: hidden; font-family: K, "Inter", sans-serif; }
.c { position: relative; width: 1200px; height: 630px; padding: 64px 72px 72px; display: flex; flex-direction: column; justify-content: flex-end; gap: 22px; color: #fff; background: ${GRADS[variant(a.id)]}; overflow: hidden; isolation: isolate; }
.logo { position: absolute; top: 60px; left: 72px; width: 240px; }
.tag { align-self: flex-start; font-size: 26px; font-weight: 600; padding: 6px 22px; border-radius: 999px; background: rgba(255,255,255,.16); border: 2px solid rgba(255,255,255,.3); }
h1 { font-size: ${a.title.kh.length > 40 ? 58 : 68}px; font-weight: 700; line-height: 1.45; max-width: 900px; }
.url { position: absolute; top: 62px; right: 72px; font-size: 24px; font-weight: 600; color: #0c1430; background: #fff; padding: 6px 22px; border-radius: 999px; }
.s { position: absolute; z-index: -1; border-radius: 50%; }
.s.a { width: 560px; height: 560px; right: -140px; top: -180px; background: radial-gradient(circle, rgba(255,255,255,.28), rgba(255,255,255,0) 70%); }
.s.b { width: 150px; height: 150px; right: 15%; top: 36%; border-radius: 36px; transform: rotate(20deg); background: rgba(255,255,255,.14); }
.s.c { width: 56px; height: 56px; right: 8%; bottom: 20%; background: #3ccf8e; opacity: .85; }
</style></head><body><div class="c">
<span class="s a"></span><span class="s b"></span><span class="s c"></span>
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
