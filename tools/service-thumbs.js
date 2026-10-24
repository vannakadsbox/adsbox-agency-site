// Make the picture shown on each service card (960x540), from the name, group and emoji in services.js.
// Run from the repo root:  node tools/service-thumbs.js        (only makes pictures that are missing)
//                          node tools/service-thumbs.js --all  (remakes every picture)
// Pictures are saved to assets/services/<service id>.jpg.
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
global.window = {};
require(path.join(ROOT, "services.js"));

const GRADS = {
  boost: "linear-gradient(135deg, #0c1430 0%, #1c4b9b 60%, #3f7dff 100%)",
  design: "linear-gradient(135deg, #0c1430 0%, #3b2f8f 55%, #7c6cff 100%)",
  care: "linear-gradient(135deg, #0c1430 0%, #11607a 55%, #2bb3a3 100%)",
  live: "linear-gradient(135deg, #1a0c30 0%, #8f2f6a 55%, #ff6b81 100%)",
};
const b64 = (f) => fs.readFileSync(path.join(ROOT, f)).toString("base64");
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const label = (kh) => kh.replace(/^សេវាកម្ម\s*/, "");

function html(g, s) {
  const E = s.emoji && s.emoji.length >= 3 ? s.emoji : ["📣", "💬", "📈"];
  const t = label(s.name.kh);
  return `<!doctype html><html lang="km"><head><meta charset="utf-8"><style>
@font-face { font-family: M; font-weight: 700; src: url(data:font/woff2;base64,${b64("assets/fonts/MiSansKhmer-Bold.woff2")}) format("woff2"); unicode-range: U+1780-17FF, U+19E0-19FF, U+200C-200D, U+25CC; }
@font-face { font-family: M; font-weight: 600; src: url(data:font/woff2;base64,${b64("assets/fonts/MiSansKhmer-Semibold.woff2")}) format("woff2"); unicode-range: U+1780-17FF, U+19E0-19FF, U+200C-200D, U+25CC; }
@font-face { font-family: L; font-weight: 400 700; src: url(data:font/woff2;base64,${b64("tools/fonts/kantumruy-latin.woff2")}) format("woff2"); }
* { box-sizing: border-box; margin: 0; }
body { width: 960px; height: 540px; overflow: hidden; font-family: M, L, "Noto Color Emoji", sans-serif; }
.c { position: relative; width: 960px; height: 540px; padding: 52px 56px 56px; display: flex; flex-direction: column; justify-content: flex-end; gap: 18px; color: #fff; background: ${GRADS[g.id] || GRADS.boost}; overflow: hidden; isolation: isolate; }
.logo { position: absolute; top: 48px; left: 56px; width: 190px; }
.tag { align-self: flex-start; font-size: 22px; font-weight: 600; padding: 5px 18px; border-radius: 999px; background: rgba(255,255,255,.16); border: 2px solid rgba(255,255,255,.3); }
h1 { font-size: ${t.length > 28 ? 46 : 54}px; font-weight: 700; line-height: 1.45; max-width: 520px; }
.glow { position: absolute; z-index: -1; width: 520px; height: 520px; right: -110px; top: -40px; border-radius: 50%; background: radial-gradient(circle, rgba(255,255,255,.30), rgba(255,255,255,0) 68%); }
.e { position: absolute; font-family: "Noto Color Emoji"; line-height: 1; display: grid; place-items: center; }
.main { width: 230px; height: 230px; right: 90px; top: 120px; font-size: 140px; border-radius: 54px; transform: rotate(-8deg); background: linear-gradient(160deg, #ffffff, #e6eeff); box-shadow: 0 34px 70px rgba(0,0,0,.35), inset 0 -9px 0 rgba(28,75,155,.12); }
.b1 { width: 110px; height: 110px; right: 40px; top: 52px; font-size: 62px; border-radius: 50%; background: #fff; box-shadow: 0 20px 44px rgba(0,0,0,.3); transform: rotate(10deg); }
.b2 { width: 98px; height: 98px; right: 260px; top: 330px; font-size: 54px; border-radius: 50%; background: #fff; box-shadow: 0 20px 44px rgba(0,0,0,.3); transform: rotate(-12deg); }
.dot { position: absolute; border-radius: 50%; }
.d1 { width: 28px; height: 28px; right: 290px; top: 84px; background: #3ccf8e; }
.d2 { width: 18px; height: 18px; right: 52px; top: 380px; background: #ffd23f; }
.d3 { width: 14px; height: 14px; right: 360px; top: 160px; background: rgba(255,255,255,.7); }
</style></head><body><div class="c">
<span class="glow"></span><span class="dot d1"></span><span class="dot d2"></span><span class="dot d3"></span>
<span class="e main">${E[0]}</span><span class="e b1">${E[1]}</span><span class="e b2">${E[2]}</span>
<img class="logo" src="data:image/png;base64,${b64("assets/logo-word-white.png")}" alt="">
<span class="tag">${esc(g.name.kh)}</span>
<h1>${esc(t).replace(/(\([^)]*\))/g, '<span style="white-space:nowrap">$1</span>')}</h1>
</div></body></html>`;
}

(async () => {
  const all = process.argv.includes("--all");
  const outDir = path.join(ROOT, "assets", "services");
  fs.mkdirSync(outDir, { recursive: true });
  const todo = [];
  window.SERVICE_GROUPS.forEach((g) => g.services.forEach((s) => {
    if (s.id && (all || !fs.existsSync(path.join(outDir, s.id + ".jpg")))) todo.push([g, s]);
  }));
  if (!todo.length) return console.log("Service pictures: nothing to make");
  const { chromium } = require("playwright");
  let browser;
  try { browser = await chromium.launch(); } catch (e) { browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }); }
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  for (const [g, s] of todo) {
    await page.setContent(html(g, s), { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(outDir, s.id + ".jpg"), type: "jpeg", quality: 84 });
    console.log("Service picture made: assets/services/" + s.id + ".jpg");
  }
  await browser.close();
})();
