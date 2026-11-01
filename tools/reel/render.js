// Render one ADS BOX knowledge video (1080x1920 MP4) from its script, Khmer voice, Pexels footage and music.
//   node tools/reel/render.js videos/scripts/<slug>.json OUT_DIR --broll OUT_DIR/broll.json [--music file.mp3] [--no-voice]
// Writes OUT_DIR/<slug>.mp4, OUT_DIR/<slug>-thumb.jpg, OUT_DIR/<slug>-cover.jpg (small) and OUT_DIR/meta.json.
//
// Editing: every spoken line gets its own shot of real footage, cut on the speech; shots move (slow push, pull or pan),
// share one colour grade, and join with short dissolves, with a slide or zoom on each new scene. A text layer drawn by
// Chromium adds the ADS BOX logo, the hook headline, small key-point captions and subtitles timed to each word the voice
// says. The video ends on a short branded card over the opening footage. Music sits low under the voice.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const ROOT = path.join(__dirname, "..", "..");

const FPS = 30, W = 1080, H = 1920;
const LEAD = 0.12, FIRST_LEAD = 0.35, TAIL = 0.32, OUTRO = 3.4, XF = 0.4, MIN_SHOT = 1.5;
const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const b64 = (f) => fs.readFileSync(path.join(ROOT, f)).toString("base64");
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const run = (args) => execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...args], { stdio: ["ignore", "inherit", "inherit"] });
const probe = (f) => parseFloat(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f], { encoding: "utf8" }));

// How the Khmer voice should say English words, prices and percentages (the screen keeps the written form).
const SAY = [["adsbox.agency", "អេដស៍ប៊ក ដត អេជិនស៊ី"], ["ADS BOX", "អេដស៍ប៊ក"], ["Order", "អូឌ័រ"], ["Admin", "អាដមីន"], ["Caption", "ខេបសិន"],
  ["Promotion", "ប្រូម៉ូសិន"], ["Boost", "ប៊ូស្ត៍"], ["Post", "ប៉ុស្ត៍"], ["Live", "ឡាយ"], ["Facebook", "ហ្វេសប៊ុក"], ["TikTok", "ធីកតុក"],
  ["Telegram", "តេឡេក្រាម"], ["Page", "ផេក"], ["Messenger", "មេសេនជ័រ"], ["Comment", "ខមមិន"], ["Inbox", "អ៊ីនបក់"], ["Online", "អនឡាញ"],
  ["Target", "ថាហ្គេត"], ["Bundle", "បាន់ឌល"], ["Reels", "រីល"], ["Link", "លីង"], ["Like", "ឡាយក៍"], ["Share", "ស៊ែរ"]];
const spoken = (t) => SAY.reduce((s, [en, kh]) => s.replace(new RegExp("(^|[^A-Za-z])" + en.replace(".", "\\.") + "(?![A-Za-z])", "gi"), "$1" + kh), String(t))
  .replace(/\$(\d+(?:\.\d+)?)/g, "$1 ដុល្លារ").replace(/(\d+)%/g, "$1 ភាគរយ").replace(/[«»"()]/g, " ").replace(/\s+/g, " ").trim();
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
  scenes.forEach((sc, i) => { sc.voice = path.join(dir, i + ".mp3"); sc.voiceLen = res[i].len; sc.marks = res[i].marks; sc.markKind = res[i].kind; });
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
    sc.start = t; sc.vStart = t + lead; sc.dur = lead + v + TAIL; t += sc.dur;
    const at = clock(sc);
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

// --- Footage: shots, motion, grade, transitions -------------------------------------------------------------------
function shots(scenes, broll) {
  const list = [];
  scenes.forEach((sc, i) => {
    let clips = (broll[i] || []).filter((c) => c && fs.existsSync(c.file));
    if (!clips.length) {  // borrow footage from the nearest scene that has some (never an empty slide)
      for (let d = 1; d < scenes.length && !clips.length; d++) clips = (broll[i - d] || broll[i + d] || []).filter((c) => c && fs.existsSync(c.file)).slice(-1);
    }
    if (!clips.length) clips = [null];  // backup: the branded ADS BOX animation
    // Cut where each spoken line starts; very short lines stay on the previous shot.
    const cuts = [sc.start, ...sc.subs.slice(1).map((s) => s.start - 0.1)];
    const ends = [...cuts.slice(1), sc.start + sc.dur];
    let k = 0;
    cuts.forEach((c, j) => {
      const d = ends[j] - c;
      if (j > 0 && d < MIN_SHOT) { list[list.length - 1].dur += d; return; }
      if (j > 0 && list.length && list[list.length - 1].scene === i && list[list.length - 1].dur < MIN_SHOT) { list[list.length - 1].dur += d; return; }
      list.push({ scene: i, start: c, dur: d, clip: clips[k % clips.length], use: Math.floor(k / clips.length), sceneStart: j === 0 });
      k++;
    });
  });
  return list;
}

const MOVES = ["in", "panl", "out", "panr", "in", "up"];
function branded(D, out, alt) {
  const c = alt ? "c0=0x0c1430:c1=0x16306e:c2=0x2a5bd7" : "c0=0x0c1430:c1=0x1c3f86:c2=0x3f2fb0";
  run(["-f", "lavfi", "-i", `gradients=s=${W}x${H}:${c}:n=3:speed=0.012:r=${FPS}:d=${D.toFixed(3)}`, "-vf", "vignette=PI/5,format=yuv420p",
    "-an", "-r", String(FPS), "-c:v", "libx264", "-preset", "veryfast", "-crf", "17", "-t", D.toFixed(3), out]);
}

function segment(shot, idx, out) {
  const D = shot.dur + XF, Ds = D.toFixed(3);
  if (!shot.clip) return branded(D, out, idx % 2);
  const move = MOVES[idx % MOVES.length];
  const fill = `scale=${Math.round(W * 1.12)}:${Math.round(H * 1.12)}:force_original_aspect_ratio=increase,crop=${Math.round(W * 1.12)}:${Math.round(H * 1.12)},setsar=1,fps=${FPS}`;
  const p = `(t/${Ds})`;
  const motion = {
    in: `scale=w='${W}*(1.0+0.10*${p})':h=-2:eval=frame,crop=${W}:${H}`,
    out: `scale=w='${W}*(1.10-0.08*${p})':h=-2:eval=frame,crop=${W}:${H}`,
    panl: `crop=${W}:${H}:x='(iw-${W})*(1-${p})':y='(ih-${H})/2'`,
    panr: `crop=${W}:${H}:x='(iw-${W})*${p}':y='(ih-${H})/2'`,
    up: `crop=${W}:${H}:x='(iw-${W})/2':y='(ih-${H})*(1-${p})'`,
  }[move];
  const grade = "eq=contrast=1.06:saturation=1.12:gamma=0.98,colorbalance=rs=0.03:gs=0.01:bs=-0.03:rm=0.02:bm=-0.02,vignette=PI/5";
  const clipLen = shot.clip.duration || probe(shot.clip.file);
  const off = Math.max(0, Math.min(0.4 + shot.use * (D + 0.5), Math.max(0, clipLen - D - 0.2)));
  run(["-ss", off.toFixed(2), "-stream_loop", "-1", "-i", shot.clip.file, "-vf", `${fill},${motion},${grade},format=yuv420p`,
    "-an", "-r", String(FPS), "-c:v", "libx264", "-preset", "veryfast", "-crf", "17", "-t", Ds, out]);
}

function endCard(shot, out) {
  if (!shot || !shot.clip) return branded(OUTRO + XF, out, 1);
  run(["-ss", "0.5", "-stream_loop", "-1", "-i", shot.clip.file, "-vf",
    `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,fps=${FPS},gblur=sigma=28,eq=brightness=-0.12:saturation=0.9,format=yuv420p`,
    "-an", "-r", String(FPS), "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-t", (OUTRO + XF).toFixed(3), out]);
}

function footage(list, total, dir) {
  const files = list.map((s, i) => { const f = path.join(dir, `shot${String(i).padStart(2, "0")}.mp4`); segment(s, i, f); return f; });
  const end = path.join(dir, "end.mp4"); endCard(list.find((s) => s.clip), end); files.push(end);
  const sceneFx = ["smoothleft", "zoomin", "smoothup", "smoothright"];
  let chain = "", prev = "[0:v]", sc = 0;
  for (let i = 1; i < files.length; i++) {
    const offset = i < list.length ? list[i].start : total - OUTRO;
    const fx = i === files.length - 1 ? "fade" : list[i].sceneStart ? sceneFx[sc++ % sceneFx.length] : "fade";
    const outLbl = i === files.length - 1 ? "[v]" : `[x${i}]`;
    chain += `${prev}[${i}:v]xfade=transition=${fx}:duration=${XF}:offset=${offset.toFixed(3)}${outLbl};`;
    prev = outLbl;
    if (list[i]) list[i].fx = fx;
  }
  const out = path.join(dir, "footage.mp4");
  run([...files.flatMap((f) => ["-i", f]), "-filter_complex", chain.replace(/;$/, ""), "-map", "[v]", "-r", String(FPS),
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "16", "-pix_fmt", "yuv420p", "-t", total.toFixed(3), out]);
  return out;
}

// --- Text layer (transparent, drawn by Chromium) ------------------------------------------------------------------
function page(script, scenes, total) {
  const end = total - OUTRO;
  let css = "", html = "";
  scenes.forEach((sc, i) => {
    if (sc.keyword && i === 0) {  // the hook headline: big, at the top, for the first seconds
      css += `.k0{animation:hin .6s cubic-bezier(.2,1.2,.4,1) .15s both, kout .3s ease-in ${(sc.start + sc.dur - 0.3).toFixed(2)}s forwards}`;
      html += `<div class="hook k0"><b>${esc(sc.keyword)}</b></div>`;
    } else if (sc.keyword) {  // a small key-point caption that slides in above the subtitles
      css += `.k${i}{animation:lin .5s cubic-bezier(.2,1,.3,1) ${(sc.start + 0.25).toFixed(2)}s both, kout .25s ease-in ${(sc.start + sc.dur - 0.3).toFixed(2)}s forwards}`;
      html += `<div class="lt k${i}">${sc.label ? `<span>${esc(sc.label)}</span>` : ""}<b>${esc(sc.keyword)}</b></div>`;
    }
    sc.subs.forEach((s, j) => {
      css += `.s${i}_${j}{animation:sin .18s ease-out ${s.start.toFixed(3)}s both, sout .1s ease-in ${(s.end - 0.1).toFixed(3)}s forwards}`;
      html += `<div class="sub s${i}_${j}"><span>${esc(s.text)}</span></div>`;
    });
  });
  const font = (f, w) => `@font-face{font-family:M;font-weight:${w};src:url(data:font/woff2;base64,${b64(f)}) format("woff2");unicode-range:U+1780-17FF,U+19E0-19FF,U+200C-200D,U+25CC}`;
  return `<!doctype html><html lang="km"><head><meta charset="utf-8"><style>
${font("assets/fonts/MiSansKhmer-Bold.woff2", 700)}${font("assets/fonts/MiSansKhmer-Medium.woff2", 500)}
@font-face{font-family:L;font-weight:400 800;src:url(data:font/woff2;base64,${b64("tools/fonts/kantumruy-latin.woff2")}) format("woff2")}
*{box-sizing:border-box;margin:0}
html,body{background:transparent}
body{width:${W}px;height:${H}px;overflow:hidden;font-family:M,L,sans-serif;color:#fff;position:relative}
.shade-top{position:absolute;left:0;right:0;top:0;height:300px;background:linear-gradient(rgba(4,8,22,.55),rgba(4,8,22,0))}
.shade-bot{position:absolute;left:0;right:0;bottom:0;height:760px;background:linear-gradient(rgba(4,8,22,0),rgba(4,8,22,.45) 50%,rgba(4,8,22,.72))}
.bug{position:absolute;top:78px;left:64px;display:flex;align-items:center;gap:16px}
.bug img{width:210px;filter:drop-shadow(0 4px 14px rgba(0,0,0,.45))}
.hook{position:absolute;left:60px;right:60px;top:250px;text-align:center;opacity:0}
.hook b{display:inline;font-size:96px;line-height:1.5;font-weight:700;padding:6px 24px;background:#ffd23f;color:#0c1430;
  -webkit-box-decoration-break:clone;box-decoration-break:clone;border-radius:18px;box-shadow:0 20px 50px rgba(0,0,0,.35)}
.lt{position:absolute;left:60px;bottom:560px;display:flex;align-items:center;gap:14px;opacity:0;max-width:960px}
.lt span{font-size:34px;font-weight:700;color:#0c1430;background:#ffd23f;padding:6px 18px;border-radius:12px;white-space:nowrap}
.lt b{font-size:42px;font-weight:700;background:rgba(12,20,48,.82);padding:6px 22px 10px;border-radius:14px}
.sub{position:absolute;left:40px;right:40px;bottom:330px;text-align:center;opacity:0}
.sub span{display:inline-block;font-size:60px;line-height:1.55;font-weight:700;padding:6px 26px 12px;border-radius:20px;background:rgba(0,0,0,.5);text-shadow:0 3px 14px rgba(0,0,0,.55)}
.outro{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:40px;text-align:center;padding:0 90px;
  background:rgba(8,14,40,.35);opacity:0;animation:fadein .5s ease-out ${end.toFixed(3)}s forwards}
.outro .mk{width:200px;animation:pop .6s cubic-bezier(.3,1.5,.5,1) ${(end + 0.15).toFixed(2)}s both}
.outro .wd{width:460px;animation:rise .6s ease-out ${(end + 0.3).toFixed(2)}s both}
.outro p{font-size:52px;line-height:1.6;font-weight:500;animation:rise .6s ease-out ${(end + 0.5).toFixed(2)}s both}
.outro .url{font-family:L,M;font-weight:800;font-size:54px;color:#0c1430;background:#fff;padding:14px 42px;border-radius:24px;animation:rise .6s ease-out ${(end + 0.7).toFixed(2)}s both}
.main{animation:fadeout .3s ease-in ${(end - 0.15).toFixed(3)}s forwards}
@keyframes hin{from{opacity:0;transform:translateY(-40px) scale(.92)}to{opacity:1;transform:none}}
@keyframes lin{from{opacity:0;transform:translateX(-80px)}to{opacity:1;transform:none}}
@keyframes kout{to{opacity:0}}
@keyframes sin{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}
@keyframes sout{to{opacity:0}}
@keyframes pop{from{opacity:0;transform:scale(.4)}to{opacity:1;transform:none}}
@keyframes rise{from{opacity:0;transform:translateY(40px)}to{opacity:1;transform:none}}
@keyframes fadein{to{opacity:1}}
@keyframes fadeout{to{opacity:0}}
${css}
</style></head><body>
<div class="main"><div class="shade-top"></div><div class="shade-bot"></div>
<div class="bug"><img src="data:image/png;base64,${b64("assets/logo-word-white.png")}" alt=""></div>
${html}</div>
<div class="outro"><img class="mk" src="data:image/png;base64,${b64("assets/logo-mark-white.png")}" alt="">
<img class="wd" src="data:image/png;base64,${b64("assets/logo-word-white.png")}" alt="">
<p>គន្លឹះលក់អនឡាញថ្មីៗ រាល់ថ្ងៃ</p><span class="url">adsbox.agency</span></div>
</body></html>`;
}

async function browser() {
  const { chromium } = require("playwright");
  try { return await chromium.launch(); } catch (e) { return await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }); }
}

async function textLayer(html, total, dir) {
  const b = await browser();
  const pg = await b.newPage({ viewport: { width: W, height: H } });
  await pg.setContent(html, { waitUntil: "load" });
  await pg.evaluate(() => document.fonts.ready);
  // Each subtitle stays on one line: shrink long lines a little (never below 44px), wrap only if still too long.
  await pg.evaluate(() => document.querySelectorAll(".sub span").forEach((el) => {
    const max = el.parentElement.clientWidth; let size = 60;
    el.style.whiteSpace = "nowrap"; el.style.fontSize = size + "px";
    while (el.offsetWidth > max && size > 44) { size -= 2; el.style.fontSize = size + "px"; }
    if (el.offsetWidth > max) el.style.whiteSpace = "normal";
  }));
  const n = Math.round(total * FPS);
  let prev = null, drawn = 0;
  for (let f = 0; f < n; f++) {
    const ms = (f * 1000) / FPS;
    // Draw a frame only while something moves; otherwise reuse the last picture.
    const moving = await pg.evaluate(({ ms, step }) => document.getAnimations().some((a) => {
      const t = a.effect.getComputedTiming(); return ms >= t.delay - step && ms <= t.endTime - t.endDelay + step;
    }), { ms, step: 1000 / FPS });
    const file = path.join(dir, String(f).padStart(5, "0") + ".png");
    if (moving || !prev) {
      await pg.evaluate((ms) => document.getAnimations().forEach((a) => { a.pause(); a.currentTime = ms; }), ms);
      await pg.screenshot({ path: file, omitBackground: true });
      drawn++;
    } else fs.linkSync(prev, file);
    prev = file;
  }
  await b.close();
  return drawn;
}

// --- Sound ---------------------------------------------------------------------------------------------------------
function sound(scenes, list, total, music, dir) {
  const whoosh = path.join(dir, "whoosh.wav");
  run(["-f", "lavfi", "-i", "anoisesrc=d=0.5:c=pink:a=0.5", "-af", "highpass=f=700,lowpass=f=3000,afade=t=in:d=0.25,afade=t=out:st=0.25:d=0.25,volume=0.12", whoosh]);
  const clips = [];
  list.forEach((s, i) => { if (i > 0 && s.sceneStart) clips.push([whoosh, s.start - 0.1]); });
  clips.push([whoosh, total - OUTRO - 0.1]);
  scenes.forEach((sc) => { if (sc.voice) clips.push([sc.voice, sc.vStart]); });
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
    const m = clips.length, lo = Number(process.env.MUSIC_VOLUME || 0.11), hi = Math.min(0.42, lo * 3.2);
    const speechEnd = (total - OUTRO).toFixed(2);
    parts.push(`[${m}:a]aresample=44100,aformat=channel_layouts=stereo,atrim=0:${total.toFixed(3)},` +
      `volume='if(gt(t,${speechEnd}),${hi},${lo})':eval=frame,afade=t=in:d=0.4,afade=t=out:st=${(total - 1.5).toFixed(2)}:d=1.5[mu]`);
    mix += `;[fx][mu]amix=inputs=2:normalize=0[mx]`;
    last = "[mx]";
  }
  mix += `;${last}alimiter=limit=0.92[out]`;
  const out = path.join(dir, "audio.wav");
  run([...inputs, "-filter_complex", parts.concat(mix).join(";"), "-map", "[out]", "-t", total.toFixed(3), "-c:a", "pcm_s16le", out]);
  return out;
}

// --- Thumbnail -----------------------------------------------------------------------------------------------------
async function thumbnail(script, frame, out, cover) {
  const b = await browser();
  const pg = await b.newPage({ viewport: { width: W, height: H } });
  const bg = `url(data:image/jpeg;base64,${fs.readFileSync(frame).toString("base64")}) center/cover`;
  await pg.setContent(`<!doctype html><html lang="km"><head><meta charset="utf-8"><style>
@font-face{font-family:M;font-weight:700;src:url(data:font/woff2;base64,${b64("assets/fonts/MiSansKhmer-Bold.woff2")}) format("woff2");unicode-range:U+1780-17FF,U+19E0-19FF,U+200C-200D,U+25CC}
@font-face{font-family:L;font-weight:400 800;src:url(data:font/woff2;base64,${b64("tools/fonts/kantumruy-latin.woff2")}) format("woff2")}
*{box-sizing:border-box;margin:0}
body{width:${W}px;height:${H}px;overflow:hidden;font-family:M,L,sans-serif;color:#fff;background:${bg};position:relative}
.sh{position:absolute;inset:0;background:linear-gradient(rgba(4,8,22,.5),rgba(4,8,22,.05) 30%,rgba(4,8,22,.2) 50%,rgba(4,8,22,.9) 85%)}
.logo{position:absolute;top:90px;left:70px;width:280px}
.t{position:absolute;left:70px;right:70px;bottom:380px}
.t span{font-size:112px;line-height:1.45;font-weight:700;padding:4px 22px;background:#ffd23f;color:#0c1430;border-radius:18px;-webkit-box-decoration-break:clone;box-decoration-break:clone}
.u{position:absolute;left:70px;bottom:250px;font-family:L,M;font-weight:800;font-size:44px;color:#fff;opacity:.92}
</style></head><body><div class="sh"></div><img class="logo" src="data:image/png;base64,${b64("assets/logo-word-white.png")}" alt="">
<div class="t"><span>${esc(script.thumbnail_text)}</span></div><div class="u">adsbox.agency</div></body></html>`, { waitUntil: "load" });
  await pg.evaluate(() => document.fonts.ready);
  await pg.screenshot({ path: out, type: "jpeg", quality: 90 });
  await b.close();
  run(["-i", out, "-vf", "scale=320:568", "-q:v", "4", cover]);
}

(async () => {
  const src = process.argv[2], outDir = process.argv[3];
  if (!src || !outDir || !arg("--broll")) { console.error("usage: node tools/reel/render.js SCRIPT.json OUT_DIR --broll broll.json [--music file] [--no-voice]"); process.exit(2); }
  const script = JSON.parse(fs.readFileSync(src, "utf8"));
  fs.mkdirSync(outDir, { recursive: true });
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "reel-"));
  const scenes = script.scenes.map((s) => ({ ...s, lines: s.lines.map(String) }));
  const broll = (JSON.parse(fs.readFileSync(arg("--broll"), "utf8")).scenes || []).map((x) => (Array.isArray(x) ? x : x ? [x] : []));
  const t0 = Date.now();

  if (!process.argv.includes("--no-voice")) voice(scenes, path.join(work, "voice"));
  else scenes.forEach((sc) => { sc.text = sc.lines.join(" "); sc.lineAt = []; });
  const total = timeline(scenes);
  const list = shots(scenes, broll);
  console.log(`Timeline ${total.toFixed(1)}s: ${scenes.length} scenes, ${list.length} shots, subtitle timing: ${scenes.map((s) => s.sync).join(",")}`);

  const bg = footage(list, total, work);
  const frames = path.join(work, "frames"); fs.mkdirSync(frames);
  const drawn = await textLayer(page(script, scenes, total), total, frames);
  console.log(`Text layer: ${Math.round(total * FPS)} frames (${drawn} drawn)`);
  const music = arg("--music");
  const wav = sound(scenes, list, total, music && fs.existsSync(music) ? music : null, work);

  const slug = script.slug, mp4 = path.join(outDir, `${slug}.mp4`);
  run(["-i", bg, "-framerate", String(FPS), "-i", path.join(frames, "%05d.png"), "-i", wav,
    "-filter_complex", "[0:v][1:v]overlay=0:0:format=auto,format=yuv420p[v]", "-map", "[v]", "-map", "2:a",
    "-c:v", "libx264", "-preset", "medium", "-crf", "21", "-maxrate", "8M", "-bufsize", "16M", "-r", String(FPS),
    "-c:a", "aac", "-b:a", "192k", "-t", total.toFixed(3), "-movflags", "+faststart", mp4]);

  const frame = path.join(work, "frame.jpg");
  run(["-ss", "1.2", "-i", bg, "-frames:v", "1", frame]);
  const thumb = path.join(outDir, `${slug}-thumb.jpg`), cover = path.join(outDir, `${slug}-cover.jpg`);
  await thumbnail(script, frame, thumb, cover);

  const used = list.map((s) => s.clip).filter(Boolean);
  const meta = {
    slug, duration: +probe(mp4).toFixed(2), size_mb: +(fs.statSync(mp4).size / 1e6).toFixed(1), scenes: scenes.length, shots: list.length,
    voice: scenes[0].voice ? (process.env.REEL_VOICE || "km-KH-PisethNeural") : "none", music: music ? path.basename(music) : "none",
    subtitle_sync: [...new Set(scenes.map((s) => s.sync))].join(","),
    broll: [...new Map(used.map((c) => [c.id, { id: c.id, source: c.source, query: c.query, page: c.page, author: c.author }])).values()],
    branded_shots: list.filter((s) => !s.clip).length,
    render_seconds: Math.round((Date.now() - t0) / 1000),
  };
  fs.writeFileSync(path.join(outDir, "meta.json"), JSON.stringify(meta, null, 1));
  fs.rmSync(work, { recursive: true, force: true });
  console.log(`Video made: ${mp4} (${meta.duration}s, ${meta.shots} shots, ${meta.size_mb} MB, ${meta.render_seconds}s)`);
})().catch((e) => { console.error(e.stack || e); process.exit(1); });
