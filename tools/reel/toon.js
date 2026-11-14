// The ADS BOX toon presenter (owner, 14 Nov 2026: "use the style video and voice for daily videos, keep color branding").
// A flat cartoon host in ADS BOX colours (blue #3f7dff blazer, navy #0b1430 lapels, yellow #ffd23f pocket square) whose
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
<path d="M95 820 C95 650 150 585 235 560 L300 610 L365 560 C450 585 505 650 505 820 Z" fill="#3f7dff"/>
<path d="M245 562 L300 690 L355 562 L330 548 L300 600 L270 548 Z" fill="#fff"/>
<path d="M268 548 L300 602 L282 618 L250 566 Z" fill="#eef2ff"/><path d="M332 548 L300 602 L318 618 L350 566 Z" fill="#eef2ff"/>
<path d="M293 606 L307 606 L312 690 L300 704 L288 690 Z" fill="#0b1430"/>
<path d="M235 560 L300 700 L268 712 L218 600 Z" fill="#0b1430"/><path d="M365 560 L300 700 L332 712 L382 600 Z" fill="#0b1430"/>
<path d="M395 668 L440 662 L436 680 L398 684 Z" fill="#ffd23f"/>
<path d="M268 470 L268 560 Q300 588 332 560 L332 470 Z" fill="#b97b52"/>
<path d="M268 520 Q300 545 332 520 L332 500 Q300 528 268 500 Z" fill="#a86d47" opacity=".7"/>
<g class="t-head" style="animation:tBob 3.4s ease-in-out -${off.toFixed(2)}s infinite">
<ellipse cx="196" cy="365" rx="20" ry="30" fill="#c68b5e"/><ellipse cx="404" cy="365" rx="20" ry="30" fill="#c68b5e"/>
<path d="M200 330 C200 230 400 230 400 330 L398 400 C394 470 340 505 300 505 C260 505 206 470 202 400 Z" fill="#c68b5e"/>
<path d="M196 340 C180 250 225 185 305 182 C385 180 425 235 410 330 C402 300 392 280 372 270 C350 288 300 290 262 268 C240 285 214 300 205 340 Z" fill="#1b1612"/>
<path d="M262 268 C285 235 340 228 372 270 C345 250 300 248 262 268 Z" fill="#2c241d"/><path d="M240 230 C270 200 330 190 380 215 C340 205 290 210 250 240 Z" fill="#3a2f26"/>
<g transform="translate(0 ${brow})"><path d="M235 318 Q258 304 282 314" stroke="#1b1612" stroke-width="9" fill="none" stroke-linecap="round"/><path d="M318 314 Q342 304 365 318" stroke="#1b1612" stroke-width="9" fill="none" stroke-linecap="round"/></g>
<g class="t-eye" style="animation:tBlink 4.2s linear -${(off * 1.3).toFixed(2)}s infinite"><ellipse cx="258" cy="350" rx="17" ry="12" fill="#fff"/><circle cx="260" cy="351" r="8.5" fill="#2a1a10"/><circle cx="263" cy="347" r="2.6" fill="#fff"/></g>
<g class="t-eye" style="animation:tBlink 4.2s linear -${(off * 1.3).toFixed(2)}s infinite"><ellipse cx="342" cy="350" rx="17" ry="12" fill="#fff"/><circle cx="344" cy="351" r="8.5" fill="#2a1a10"/><circle cx="347" cy="347" r="2.6" fill="#fff"/></g>
<path d="M300 365 Q292 400 290 410 Q300 418 312 410" stroke="#9c6440" stroke-width="5" fill="none" stroke-linecap="round"/>
<g ${anim(0)}><path d="M268 445 Q300 462 332 445" stroke="#6b2f22" stroke-width="7" fill="none" stroke-linecap="round"/></g>
<g ${anim(1)}><path d="M272 440 Q300 446 328 440 Q326 466 300 468 Q274 466 272 440 Z" fill="#5a2018"/><path d="M280 456 Q300 470 320 456 Q310 466 300 466 Q290 466 280 456Z" fill="#d9675a"/></g>
<g ${anim(2)}><path d="M270 436 Q300 442 330 436 Q330 482 300 486 Q270 482 270 436 Z" fill="#5a2018"/><path d="M272 437 Q300 443 328 437 L327 446 Q300 450 273 446 Z" fill="#fff"/><path d="M282 470 Q300 488 318 470 Q310 482 300 482 Q290 482 282 470Z" fill="#d9675a"/></g>
</g>
${raised ? `<g style="transform-origin:150px 640px;animation:tWave 2.6s ease-in-out infinite">
<path d="M150 640 C120 610 110 560 128 520" stroke="#3f7dff" stroke-width="58" fill="none" stroke-linecap="round"/>
<path d="M104 528 C96 500 98 452 112 446 C122 442 128 452 128 462 L130 440 C132 428 148 428 150 442 L152 452 C154 440 170 440 171 454 L172 470 C176 460 190 462 190 476 L188 520 C186 545 165 560 140 558 C122 556 108 546 104 528 Z" fill="#c68b5e"/></g>`
    : `<path d="M150 650 C150 700 180 720 230 715" stroke="#3f7dff" stroke-width="58" fill="none" stroke-linecap="round"/><ellipse cx="248" cy="712" rx="30" ry="24" fill="#c68b5e"/>`}
</svg></div>`;
}

module.exports = { toon, mouthLevels, CSS };
