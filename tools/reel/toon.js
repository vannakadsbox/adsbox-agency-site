// The ADS BOX toon presenter (owner, 14 Nov 2026: "use the style video and voice for daily videos, keep color branding").
// A flat cartoon of the owner, drawn from his photo (owner, 14 Nov 2026 08:07: "change character to my pic"): side-swept dark hair,
// thin moustache, white ADS BOX polo with blue trim and logo (as on the ADS BOX host photos); whose
// mouth follows the loudness of the Kiri voice frame by frame, with blinks and a gentle head bob.
// Frames are drawn by pausing every CSS animation at the frame time (render.js), so all motion here is CSS keyframes.
const { execFileSync } = require("child_process");

const FPS = 30;
let seq = 0;

// Mouth level per video frame (0 closed, 1 half open, 2 open) from the voice file's loudness.
function mouthLevels(file) {
  let raw;
  try {
    raw = execFileSync("ffmpeg", ["-v", "error", "-i", file, "-ac", "1", "-ar", "8000", "-f", "s16le", "-"], { maxBuffer: 1 << 28 });
  } catch (e) { return null; }
  const s = new Int16Array(raw.buffer, raw.byteOffset, Math.floor(raw.length / 2));
  const per = 8000 / FPS, rms = [];
  for (let i = 0; i < s.length; i += per) {
    let a = 0, n = 0;
    for (let j = Math.floor(i); j < Math.min(s.length, Math.floor(i + per)); j++) { a += s[j] * s[j]; n++; }
    rms.push(n ? Math.sqrt(a / n) : 0);
  }
  const ref = [...rms].sort((a, b) => a - b)[Math.floor(rms.length * 0.95)] || 1;
  const lv = rms.map((r) => (r > ref * 0.55 ? 2 : r > ref * 0.18 ? 1 : 0));
  // No single-frame flicker: a lone frame takes its neighbours' shape.
  for (let i = 1; i < lv.length - 1; i++) if (lv[i - 1] === lv[i + 1] && lv[i] !== lv[i - 1]) lv[i] = lv[i - 1];
  return lv;
}

// CSS keyframes that show mouth shape k only on the frames where the level is k.
function mouthCss(id, lv) {
  const n = lv.length, out = [];
  for (const k of [0, 1, 2]) {
    let kf = "", prev = null;
    lv.forEach((l, i) => {
      const on = (l === k) ? 1 : 0;
      if (on !== prev) { kf += `${((i / n) * 100).toFixed(4)}%{opacity:${on}}`; prev = on; }
    });
    kf += `100%{opacity:${k === 0 ? 1 : 0}}`;
    out.push(`@keyframes ${id}m${k}{${kf}}`);
  }
  return out.join("");
}

const CSS = `
.toon svg{display:block;width:100%;height:auto;overflow:visible}
/* Host under the subtitles: the toon has more headroom than the photo cut-outs, so draw it larger and higher. */
.host .vk,.host .toon{width:480px!important}
.host:not(.hsm){bottom:-120px}
.toon .t-head{transform-origin:300px 500px}
.toon .t-eye{transform-box:fill-box;transform-origin:center}
@keyframes tBlink{0%,93%,100%{transform:scaleY(1)}96%{transform:scaleY(.1)}}
@keyframes tBob{0%,100%{transform:rotate(-1.2deg) translateY(0)}50%{transform:rotate(1.2deg) translateY(-4px)}}
@keyframes tWave{0%,100%{transform:rotate(0)}50%{transform:rotate(-7deg)}}
`;

// One toon. mood: surprised | think | happy | wave | smile. sc (optional): the scene, for lip sync (sc.mouth, sc.vStart).
function toon(mood, w, sc) {
  const id = "tn" + (seq++);
  const lv = sc && sc.mouth;
  const t0 = sc ? sc.vStart || 0 : 0;
  const dur = lv ? lv.length / FPS : 0;
  const anim = (k) => (lv ? `style="opacity:${k ? 0 : 1};animation:${id}m${k} ${dur.toFixed(3)}s step-end ${t0.toFixed(3)}s 1 forwards"` : (k ? `style="opacity:0"` : ""));
  const brow = mood === "surprised" ? -12 : mood === "think" ? 4 : 0;
  const raised = ["happy", "wave", "surprised"].includes(mood);
  const off = (seq * 0.37) % 3;
  return `<div class="toon" style="width:${w}px">${lv ? `<style>${mouthCss(id, lv)}</style>` : ""}
<svg viewBox="0 0 600 820" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
<ellipse cx="300" cy="808" rx="230" ry="14" fill="#000" opacity=".12"/>
<path d="M95 820 C95 650 150 590 238 566 L300 600 L362 566 C450 590 505 650 505 820 Z" fill="#fff"/>
<path d="M140 760 C150 700 175 670 200 660 C185 700 190 740 205 820 L150 820 Z" fill="#dbe6fb" opacity=".8"/><path d="M460 760 C450 700 425 670 400 660 C415 700 410 740 395 820 L450 820 Z" fill="#dbe6fb" opacity=".8"/>
<path d="M150 740 C170 720 190 735 182 760 M430 720 C412 708 398 726 410 745" stroke="#9db8ee" stroke-width="5" fill="none" stroke-linecap="round"/>
<path d="M286 590 L314 590 L312 680 L288 680 Z" fill="#f3f6fc"/><path d="M296 596 L304 596 L304 676 L296 676 Z" fill="#1f5fe0"/>
<circle cx="300" cy="618" r="5" fill="#fff" stroke="#c8d3ea" stroke-width="2"/><circle cx="300" cy="648" r="5" fill="#fff" stroke="#c8d3ea" stroke-width="2"/>
<path d="M268 470 L268 562 Q300 590 332 562 L332 470 Z" fill="#d29d78"/>
<path d="M268 520 Q300 545 332 520 L332 500 Q300 528 268 500 Z" fill="#c48c66" opacity=".7"/>
<path d="M262 552 L300 600 L272 628 L232 572 Z" fill="#fff" stroke="#d5deef" stroke-width="3"/><path d="M338 552 L300 600 L328 628 L368 572 Z" fill="#fff" stroke="#d5deef" stroke-width="3"/>
<path d="M236 576 L272 626" stroke="#1f5fe0" stroke-width="6" stroke-linecap="round"/><path d="M364 576 L328 626" stroke="#1f5fe0" stroke-width="6" stroke-linecap="round"/>
<g transform="translate(372 628)"><rect x="0" y="0" width="34" height="30" rx="3" fill="none" stroke="#1f5fe0" stroke-width="4"/><path d="M8 25 L17 6 L26 25 M12 18 L22 18" stroke="#1f5fe0" stroke-width="4" fill="none" stroke-linejoin="round"/><text x="17" y="52" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-weight="800" font-size="15" fill="#1f5fe0">ADS BOX</text></g>
<g class="t-head" style="animation:tBob 3.4s ease-in-out -${off.toFixed(2)}s infinite">
<ellipse cx="208" cy="368" rx="18" ry="28" fill="#d9a580"/><ellipse cx="392" cy="368" rx="18" ry="28" fill="#d9a580"/>
<path d="M212 330 C212 236 388 236 388 330 L386 398 C382 462 336 500 300 502 C264 500 218 462 214 398 Z" fill="#e2b08a"/>
<path d="M210 360 C204 330 206 300 216 282 L232 300 C224 318 222 340 224 362 Z" fill="#3b2a1f" opacity=".85"/><path d="M390 360 C396 330 394 300 384 282 L368 300 C376 318 378 340 376 362 Z" fill="#3b2a1f" opacity=".85"/>
<path d="M214 318 C204 262 228 206 286 184 C318 172 352 176 378 194 C402 212 414 246 404 296 L392 318 L376 292 L360 312 L344 284 L326 304 L308 280 L288 298 L270 276 L250 296 L232 280 Z" fill="#2a1d14"/>
<path d="M232 240 C258 204 306 186 350 194 M244 264 C274 226 330 214 376 232 M262 282 C292 252 340 246 384 262 M300 182 C336 178 368 192 388 216" stroke="#5a3f2c" stroke-width="6" fill="none" stroke-linecap="round"/>
<path d="M286 186 C300 174 330 168 352 176" stroke="#6b4c35" stroke-width="5" fill="none" stroke-linecap="round"/>
<g transform="translate(0 ${brow})"><path d="M240 332 Q262 324 284 328" stroke="#2a1d14" stroke-width="8" fill="none" stroke-linecap="round"/><path d="M316 328 Q338 324 360 332" stroke="#2a1d14" stroke-width="8" fill="none" stroke-linecap="round"/></g>
<g class="t-eye" style="animation:tBlink 4.2s linear -${(off * 1.3).toFixed(2)}s infinite"><path d="M245 360 Q262 346 279 360 Q262 368 245 360 Z" fill="#fff"/><circle cx="263" cy="358" r="7" fill="#24170f"/><circle cx="265.5" cy="355.5" r="2.2" fill="#fff"/></g>
<g class="t-eye" style="animation:tBlink 4.2s linear -${(off * 1.3).toFixed(2)}s infinite"><path d="M321 360 Q338 346 355 360 Q338 368 321 360 Z" fill="#fff"/><circle cx="339" cy="358" r="7" fill="#24170f"/><circle cx="341.5" cy="355.5" r="2.2" fill="#fff"/></g>
<path d="M300 372 Q293 398 290 408 Q300 416 311 408" stroke="#b57d58" stroke-width="5" fill="none" stroke-linecap="round"/>
<path d="M276 428 Q288 420 300 424 Q312 420 324 428" stroke="#2a1d14" stroke-width="5" fill="none" stroke-linecap="round" opacity=".85"/>
<g ${anim(0)}><path d="M272 447 Q300 460 328 447" stroke="#7a3a2a" stroke-width="6" fill="none" stroke-linecap="round"/></g>
<g ${anim(1)}><path d="M274 442 Q300 448 326 442 Q324 466 300 468 Q276 466 274 442 Z" fill="#5a2018"/><path d="M282 457 Q300 470 318 457 Q310 466 300 466 Q290 466 282 457Z" fill="#d9675a"/></g>
<g ${anim(2)}><path d="M272 438 Q300 444 328 438 Q328 482 300 486 Q272 482 272 438 Z" fill="#5a2018"/><path d="M274 439 Q300 445 326 439 L325 448 Q300 452 275 448 Z" fill="#fff"/><path d="M284 470 Q300 488 316 470 Q310 482 300 482 Q290 482 284 470Z" fill="#d9675a"/></g>
</g>
${raised ? `<g style="transform-origin:150px 640px;animation:tWave 2.6s ease-in-out infinite">
<path d="M128 520 C118 560 124 600 146 632" stroke="#e2b08a" stroke-width="44" fill="none" stroke-linecap="round"/>
<path d="M150 690 C140 664 140 640 148 618" stroke="#fff" stroke-width="66" fill="none" stroke-linecap="round"/><path d="M118 622 L178 616" stroke="#1f5fe0" stroke-width="10" stroke-linecap="round"/>
<path d="M104 528 C96 500 98 452 112 446 C122 442 128 452 128 462 L130 440 C132 428 148 428 150 442 L152 452 C154 440 170 440 171 454 L172 470 C176 460 190 462 190 476 L188 520 C186 545 165 560 140 558 C122 556 108 546 104 528 Z" fill="#e2b08a"/></g>`
    : ``}
</svg></div>`;
}

module.exports = { toon, mouthLevels, CSS };
