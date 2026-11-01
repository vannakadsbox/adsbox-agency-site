// Render one ADS BOX knowledge video (1080x1920 MP4) from its script, voice, B-roll and music.
//   node tools/reel/render.js videos/scripts/<slug>.json OUT_DIR [--broll OUT_DIR/broll.json] [--music file.mp3] [--no-voice]
// Writes OUT_DIR/<slug>.mp4, OUT_DIR/<slug>-thumb.jpg, OUT_DIR/<slug>-cover.jpg (small) and OUT_DIR/meta.json.
// Layers: B-roll (or a branded animated background) -> text layer drawn by Chromium (subtitles, key points, logo,
// opening and closing scenes) -> voice, soft transition sounds and music kept low under the voice.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const ROOT = path.join(__dirname, "..", "..");

const FPS = 30, W = 1080, H = 1920;
const INTRO = 1.3, OUTRO = 3.8, LEAD = 0.15, TAIL = 0.4;
const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const b64 = (f) => fs.readFileSync(path.join(ROOT, f)).toString("base64");
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const run = (args) => execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...args], { stdio: ["ignore", "inherit", "inherit"] });
const probe = (f) => parseFloat(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f], { encoding: "utf8" }));

// How the Khmer voice should say English words (screen text keeps the English).
const SAY = [["adsbox.agency", "អេដស៍ប៊ក ដត អេជិនស៊ី"], ["ADS BOX", "អេដស៍ប៊ក"], ["Order", "អូឌ័រ"], ["Admin", "អាដមីន"], ["Caption", "ខេបសិន"],
  ["Promotion", "ប្រូម៉ូសិន"], ["Boost", "ប៊ូស្ត៍"], ["Post", "ប៉ុស្ត៍"], ["Live", "ឡាយ"], ["Facebook", "ហ្វេសប៊ុក"], ["TikTok", "ធីកតុក"],
  ["Telegram", "តេឡេក្រាម"], ["Page", "ផេក"], ["Messenger", "មេសេនជ័រ"], ["Comment", "ខមមិន"], ["Inbox", "អ៊ីនបក់"], ["Online", "អនឡាញ"],
  ["Target", "ថាហ្គេត"], ["Bundle", "បាន់ឌល"], ["Reels", "រីល"], ["Link", "លីង"], ["Like", "ឡាយក៍"], ["Share", "ស៊ែរ"]];
const spoken = (t) => SAY.reduce((s, [en, kh]) => s.replace(new RegExp("(^|[^A-Za-z])" + en.replace(".", "\\.") + "(?![A-Za-z])", "gi"), "$1" + kh), String(t))
  .replace(/\$(\d+(?:\.\d+)?)/g, "$1 ដុល្លារ").replace(/(\d+)%/g, "$1 ភាគរយ").replace(/[«»"()]/g, " ");
const weight = (s) => String(s).replace(/\s+/g, "").length || 1;

function voice(scenes, dir) {
  const texts = scenes.map((sc) => spoken(sc.lines.join(" ")));
  const env = { ...process.env, TTS_RATE: process.env.TTS_RATE || "+2%" };
  delete env.ELEVENLABS_API_KEY;  // the owner chose the Microsoft Khmer voice
  const lens = JSON.parse(execFileSync("python3", [path.join(ROOT, "tools", "tts.py"), process.env.REEL_VOICE || "km-KH-PisethNeural", dir, ...texts],
    { encoding: "utf8", env }));
  scenes.forEach((sc, i) => { sc.voice = path.join(dir, i + ".mp3"); sc.voiceLen = lens[i]; });
}

function timeline(scenes) {
  let t = INTRO;
  for (const sc of scenes) {
    const v = sc.voiceLen || Math.max(2.2, weight(sc.lines.join("")) / 12.5);
    sc.start = t; sc.dur = LEAD + v + TAIL; t += sc.dur;
    // Subtitle lines share the voice time in proportion to their length.
    const total = sc.lines.reduce((a, l) => a + weight(l), 0);
    let s = sc.start + LEAD;
    sc.subs = sc.lines.map((l) => { const d = (v * weight(l)) / total; const r = { text: l, start: s, end: s + d }; s += d; return r; });
    sc.subs[sc.subs.length - 1].end = sc.start + sc.dur - 0.05;
  }
  return t + OUTRO;
}

// --- Background layer -------------------------------------------------------------------------------------------
function segment(src, dur, out, kind) {
  const base = ["-r", String(FPS), "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-t", dur.toFixed(3), out];
  if (src) {
    // Fill the 9:16 frame, slow push-in, gentle grade.
    const vf = `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,fps=${FPS},` +
      `scale=w='${W}*(1+0.07*t/${dur.toFixed(2)})':h=-2:eval=frame,crop=${W}:${H},eq=contrast=1.04:saturation=1.08`;
    run(["-stream_loop", "-1", "-i", src, "-vf", vf, ...base]);
  } else {
    const c = kind === "end" ? "c0=0x0c1430:c1=0x16306e:c2=0x2a5bd7" : "c0=0x0c1430:c1=0x1c3f86:c2=0x3f2fb0";
    run(["-f", "lavfi", "-i", `gradients=s=${W}x${H}:${c}:n=3:speed=0.012:r=${FPS}:d=${dur.toFixed(3)}`, "-vf", "format=yuv420p", ...base]);
  }
}

function background(scenes, total, broll, dir) {
  const segs = [];
  const add = (src, dur, kind) => { const f = path.join(dir, `seg${String(segs.length).padStart(2, "0")}.mp4`); segment(src, dur, f, kind); segs.push(f); };
  add(null, INTRO, "start");
  scenes.forEach((sc, i) => add(broll[i] && broll[i].file, sc.dur, "scene"));
  add(null, OUTRO, "end");
  const list = path.join(dir, "segs.txt");
  fs.writeFileSync(list, segs.map((f) => `file '${f}'`).join("\n"));
  const out = path.join(dir, "bg.mp4");
  run(["-f", "concat", "-safe", "0", "-i", list, "-c", "copy", out]);
  return out;
}

// --- Text layer (transparent, drawn by Chromium) ----------------------------------------------------------------
function page(script, scenes, total) {
  const end = total - OUTRO;
  let css = "", html = "";
  scenes.forEach((sc, i) => {
    const kIn = sc.start + 0.12, kOut = sc.start + sc.dur - 0.25;
    if (sc.keyword) {
      css += `.k${i}{animation:kin .55s cubic-bezier(.2,1.3,.4,1) ${kIn}s both, kout .25s ease-in ${kOut}s forwards}`;
      html += `<div class="key k${i}">${sc.label ? `<span class="label">${esc(sc.label)}</span>` : ""}<b>${esc(sc.keyword)}</b></div>`;
    }
    sc.subs.forEach((s, j) => {
      css += `.s${i}_${j}{animation:sin .22s ease-out ${s.start.toFixed(3)}s both, sout .12s ease-in ${(s.end - 0.12).toFixed(3)}s forwards}`;
      html += `<div class="sub s${i}_${j}"><span>${esc(s.text)}</span></div>`;
    });
    if (i > 0) { css += `.w${i}{animation:sweep .5s ease-out ${(sc.start - 0.12).toFixed(3)}s both}`; html += `<i class="sweep w${i}"></i>`; }
  });
  return `<!doctype html><html lang="km"><head><meta charset="utf-8"><style>
@font-face{font-family:M;font-weight:700;src:url(data:font/woff2;base64,${b64("assets/fonts/MiSansKhmer-Bold.woff2")}) format("woff2");unicode-range:U+1780-17FF,U+19E0-19FF,U+200C-200D,U+25CC}
@font-face{font-family:M;font-weight:500;src:url(data:font/woff2;base64,${b64("assets/fonts/MiSansKhmer-Medium.woff2")}) format("woff2");unicode-range:U+1780-17FF,U+19E0-19FF,U+200C-200D,U+25CC}
@font-face{font-family:L;font-weight:400 800;src:url(data:font/woff2;base64,${b64("tools/fonts/kantumruy-latin.woff2")}) format("woff2")}
*{box-sizing:border-box;margin:0}
html,body{background:transparent}
body{width:${W}px;height:${H}px;overflow:hidden;font-family:M,L,sans-serif;color:#fff;position:relative}
.shade-top{position:absolute;left:0;right:0;top:0;height:380px;background:linear-gradient(rgba(6,10,28,.62),rgba(6,10,28,0))}
.shade-bot{position:absolute;left:0;right:0;bottom:0;height:980px;background:linear-gradient(rgba(6,10,28,0),rgba(6,10,28,.55) 45%,rgba(6,10,28,.86))}
.brand{position:absolute;top:84px;left:70px;right:70px;display:flex;justify-content:space-between;align-items:center}
.brand img{width:250px}
.brand span{font-size:34px;font-weight:500;padding:8px 26px;border-radius:999px;background:rgba(255,255,255,.16);border:2px solid rgba(255,255,255,.3)}
.key{position:absolute;left:70px;right:70px;top:300px;display:flex;flex-direction:column;align-items:flex-start;gap:18px;opacity:0}
.key .label{font-size:40px;font-weight:700;color:#0c1430;background:#ffd23f;padding:6px 26px;border-radius:14px}
.key b{font-size:84px;line-height:1.45;font-weight:700;background:rgba(12,20,48,.80);padding:14px 36px 18px;border-radius:30px;box-shadow:0 24px 60px rgba(0,0,0,.35)}
.sub{position:absolute;left:40px;right:40px;bottom:330px;text-align:center;opacity:0}
.sub span{display:inline-block;font-size:64px;line-height:1.55;font-weight:700;padding:8px 30px 14px;border-radius:24px;background:rgba(0,0,0,.42);text-shadow:0 4px 18px rgba(0,0,0,.6)}
.site{position:absolute;bottom:150px;left:0;right:0;text-align:center;font-family:L,M;font-weight:700;font-size:40px;letter-spacing:.02em;opacity:.9}
.sweep{position:absolute;top:0;bottom:0;width:420px;left:-460px;background:linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,.28),rgba(255,255,255,0));transform:skewX(-14deg)}
.intro,.outro{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:46px;text-align:center;
  background:linear-gradient(160deg,#0c1430 0%,#1c3f86 60%,#3f7dff 100%)}
.intro{animation:introout .45s cubic-bezier(.6,0,.4,1) ${(INTRO - 0.4).toFixed(2)}s forwards}
.intro .mk{width:250px;animation:pop .6s cubic-bezier(.3,1.6,.5,1) .05s both}
.intro .wd{width:520px;animation:rise .6s cubic-bezier(.2,.8,.2,1) .3s both}
.outro{opacity:0;animation:fadein .5s ease-out ${end.toFixed(3)}s forwards;padding:0 90px}
.outro .mk{width:230px;animation:pop .6s cubic-bezier(.3,1.6,.5,1) ${(end + 0.15).toFixed(2)}s both}
.outro .wd{width:500px;animation:rise .6s ease-out ${(end + 0.35).toFixed(2)}s both}
.outro p{font-size:56px;line-height:1.6;font-weight:500;animation:rise .6s ease-out ${(end + 0.6).toFixed(2)}s both}
.outro .url{font-family:L,M;font-weight:800;font-size:58px;color:#0c1430;background:#fff;padding:16px 46px;border-radius:26px;animation:rise .6s ease-out ${(end + 0.85).toFixed(2)}s both}
.outro small{font-family:L,M;font-size:40px;font-weight:600;opacity:.85;animation:rise .6s ease-out ${(end + 1.05).toFixed(2)}s both}
.main{animation:fadeout .3s ease-in ${(end - 0.2).toFixed(3)}s forwards}
@keyframes kin{from{opacity:0;transform:translateY(60px) scale(.9)}to{opacity:1;transform:none}}
@keyframes kout{to{opacity:0;transform:translateY(-30px)}}
@keyframes sin{from{opacity:0;transform:translateY(26px)}to{opacity:1;transform:none}}
@keyframes sout{to{opacity:0}}
@keyframes sweep{from{left:-460px}to{left:${W + 40}px}}
@keyframes pop{from{opacity:0;transform:scale(.3) rotate(-20deg)}to{opacity:1;transform:none}}
@keyframes rise{from{opacity:0;transform:translateY(50px)}to{opacity:1;transform:none}}
@keyframes introout{to{clip-path:inset(0 0 100% 0)}}
@keyframes fadein{to{opacity:1}}
@keyframes fadeout{to{opacity:0}}
${css}
</style></head><body>
<div class="main"><div class="shade-top"></div><div class="shade-bot"></div>
<div class="brand"><img src="data:image/png;base64,${b64("assets/logo-word-white.png")}" alt=""><span>ចំណេះដឹងលក់អនឡាញ</span></div>
${html}<div class="site">adsbox.agency</div></div>
<div class="intro"><img class="mk" src="data:image/png;base64,${b64("assets/logo-mark-white.png")}" alt=""><img class="wd" src="data:image/png;base64,${b64("assets/logo-word-white.png")}" alt=""></div>
<div class="outro"><img class="mk" src="data:image/png;base64,${b64("assets/logo-mark-white.png")}" alt="">
<p>តាមដាន ADS BOX ដើម្បីទទួលបាន<br>គន្លឹះលក់អនឡាញថ្មីៗ រាល់ថ្ងៃ</p><span class="url">adsbox.agency</span><small>Telegram: t.me/vannakdm</small></div>
</body></html>`;
}

async function textLayer(html, total, dir) {
  const { chromium } = require("playwright");
  let browser;
  try { browser = await chromium.launch(); } catch (e) { browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }); }
  const pg = await browser.newPage({ viewport: { width: W, height: H } });
  await pg.setContent(html, { waitUntil: "load" });
  await pg.evaluate(() => document.fonts.ready);
  // Each subtitle stays on one line: shrink long lines a little (never below 46px), wrap only if still too long.
  await pg.evaluate(() => document.querySelectorAll(".sub span").forEach((el) => {
    const max = el.parentElement.clientWidth; let size = 62;
    el.style.whiteSpace = "nowrap"; el.style.fontSize = size + "px";
    while (el.offsetWidth > max && size > 46) { size -= 2; el.style.fontSize = size + "px"; }
    if (el.offsetWidth > max) el.style.whiteSpace = "normal";
  }));
  const n = Math.round(total * FPS);
  let prev = null, drawn = 0;
  for (let f = 0; f < n; f++) {
    const ms = (f * 1000) / FPS;
    // Draw a frame only while something moves; otherwise reuse the last picture (most of the video is still text).
    const moving = await pg.evaluate(({ ms, step }) => document.getAnimations().some((a) => {
      const t = a.effect.getComputedTiming(); const s = t.delay, e = t.endTime - t.endDelay;
      return (ms >= s - step && ms <= e + step);
    }), { ms, step: 1000 / FPS });
    const file = path.join(dir, String(f).padStart(5, "0") + ".png");
    if (moving || !prev) {
      await pg.evaluate((ms) => document.getAnimations().forEach((a) => { a.pause(); a.currentTime = ms; }), ms);
      await pg.screenshot({ path: file, omitBackground: true });
      drawn++;
    } else {
      fs.linkSync(prev, file);
    }
    prev = file;
  }
  await browser.close();
  return drawn;
}

// --- Sound -------------------------------------------------------------------------------------------------------
function sound(scenes, total, music, dir) {
  const whoosh = path.join(dir, "whoosh.wav");
  run(["-f", "lavfi", "-i", "anoisesrc=d=0.5:c=pink:a=0.5", "-af", "highpass=f=600,lowpass=f=3200,afade=t=in:d=0.2,afade=t=out:st=0.2:d=0.3,volume=0.22", whoosh]);
  const clips = [[whoosh, INTRO - 0.35], [whoosh, total - OUTRO - 0.2]];
  scenes.forEach((sc, i) => {
    if (i > 0) clips.push([whoosh, sc.start - 0.18]);
    if (sc.voice) clips.push([sc.voice, sc.start + LEAD]);
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
    const m = clips.length, lo = Number(process.env.MUSIC_VOLUME || 0.11), hi = Math.min(0.4, lo * 3);
    const speechEnd = (total - OUTRO).toFixed(2);
    parts.push(`[${m}:a]aresample=44100,aformat=channel_layouts=stereo,atrim=0:${total.toFixed(3)},` +
      `volume='if(lt(t,${INTRO})+gt(t,${speechEnd}),${hi},${lo})':eval=frame,afade=t=in:d=0.6,afade=t=out:st=${(total - 1.6).toFixed(2)}:d=1.6[mu]`);
    mix += `;[fx][mu]amix=inputs=2:normalize=0[mx]`;
    last = "[mx]";
  }
  mix += `;${last}alimiter=limit=0.92[out]`;
  const out = path.join(dir, "audio.wav");
  run([...inputs, "-filter_complex", parts.concat(mix).join(";"), "-map", "[out]", "-t", total.toFixed(3), "-c:a", "pcm_s16le", out]);
  return out;
}

// --- Thumbnail ---------------------------------------------------------------------------------------------------
async function thumbnail(script, bgFrame, out, cover) {
  const { chromium } = require("playwright");
  let browser;
  try { browser = await chromium.launch(); } catch (e) { browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }); }
  const pg = await browser.newPage({ viewport: { width: W, height: H } });
  const bg = bgFrame ? `url(data:image/jpeg;base64,${fs.readFileSync(bgFrame).toString("base64")}) center/cover` : "linear-gradient(160deg,#0c1430,#1c3f86 60%,#3f7dff)";
  await pg.setContent(`<!doctype html><html lang="km"><head><meta charset="utf-8"><style>
@font-face{font-family:M;font-weight:700;src:url(data:font/woff2;base64,${b64("assets/fonts/MiSansKhmer-Bold.woff2")}) format("woff2");unicode-range:U+1780-17FF,U+19E0-19FF,U+200C-200D,U+25CC}
@font-face{font-family:L;font-weight:400 800;src:url(data:font/woff2;base64,${b64("tools/fonts/kantumruy-latin.woff2")}) format("woff2")}
*{box-sizing:border-box;margin:0}
body{width:${W}px;height:${H}px;overflow:hidden;font-family:M,L,sans-serif;color:#fff;background:${bg};position:relative}
.sh{position:absolute;inset:0;background:linear-gradient(rgba(6,10,28,.55),rgba(6,10,28,.15) 35%,rgba(6,10,28,.88) 75%)}
.logo{position:absolute;top:90px;left:70px;width:300px}
.t{position:absolute;left:70px;right:70px;bottom:400px}
.t span{font-size:118px;line-height:1.42;font-weight:700;background:linear-gradient(transparent 62%,#ffd23f 62%,#ffd23f 90%,transparent 90%);-webkit-box-decoration-break:clone;box-decoration-break:clone;text-shadow:0 6px 24px rgba(0,0,0,.55)}
.u{position:absolute;left:70px;bottom:250px;font-family:L,M;font-weight:800;font-size:46px;color:#0c1430;background:#fff;padding:10px 32px;border-radius:20px}
</style></head><body><div class="sh"></div><img class="logo" src="data:image/png;base64,${b64("assets/logo-word-white.png")}" alt="">
<div class="t"><span>${esc(script.thumbnail_text)}</span></div><div class="u">adsbox.agency</div></body></html>`, { waitUntil: "load" });
  await pg.evaluate(() => document.fonts.ready);
  await pg.screenshot({ path: out, type: "jpeg", quality: 90 });
  await browser.close();
  run(["-i", out, "-vf", "scale=320:568", "-q:v", "4", cover]);
}

(async () => {
  const src = process.argv[2], outDir = process.argv[3];
  if (!src || !outDir) { console.error("usage: node tools/reel/render.js SCRIPT.json OUT_DIR [--broll broll.json] [--music file] [--no-voice]"); process.exit(2); }
  const script = JSON.parse(fs.readFileSync(src, "utf8"));
  fs.mkdirSync(outDir, { recursive: true });
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "reel-"));
  const scenes = script.scenes.map((s) => ({ ...s, lines: s.lines.map(String) }));
  const brollFile = arg("--broll");
  const broll = brollFile ? (JSON.parse(fs.readFileSync(brollFile, "utf8")).scenes || []) : [];
  const t0 = Date.now();

  if (!process.argv.includes("--no-voice")) voice(scenes, path.join(work, "voice"));
  const total = timeline(scenes);
  console.log(`Timeline: ${total.toFixed(1)}s, ${scenes.length} scenes, B-roll for ${broll.filter(Boolean).length}`);

  const bg = background(scenes, total, broll, work);
  const frames = path.join(work, "frames"); fs.mkdirSync(frames);
  const drawn = await textLayer(page(script, scenes, total), total, frames);
  console.log(`Text layer: ${Math.round(total * FPS)} frames (${drawn} drawn)`);
  const music = arg("--music");
  const wav = sound(scenes, total, music && fs.existsSync(music) ? music : null, work);

  const slug = script.slug, mp4 = path.join(outDir, `${slug}.mp4`);
  run(["-i", bg, "-framerate", String(FPS), "-i", path.join(frames, "%05d.png"), "-i", wav,
    "-filter_complex", "[0:v][1:v]overlay=0:0:format=auto,format=yuv420p[v]", "-map", "[v]", "-map", "2:a",
    "-c:v", "libx264", "-preset", "medium", "-crf", "23", "-maxrate", "6M", "-bufsize", "12M", "-r", String(FPS),
    "-c:a", "aac", "-b:a", "160k", "-t", total.toFixed(3), "-movflags", "+faststart", mp4]);

  // Thumbnail background: a frame from the first scene that has footage.
  let frame = null;
  const firstClip = broll.find(Boolean);
  if (firstClip) { frame = path.join(work, "frame.jpg"); run(["-ss", "1", "-i", firstClip.file, "-frames:v", "1", "-vf", `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}`, frame]); }
  const thumb = path.join(outDir, `${slug}-thumb.jpg`), cover = path.join(outDir, `${slug}-cover.jpg`);
  await thumbnail(script, frame, thumb, cover);

  const meta = {
    slug, duration: +probe(mp4).toFixed(2), size_mb: +(fs.statSync(mp4).size / 1e6).toFixed(1), scenes: scenes.length,
    voice: scenes[0].voice ? (process.env.REEL_VOICE || "km-KH-PisethNeural") : "none", music: music ? path.basename(music) : "none",
    broll: broll.map((b) => (b ? { id: b.id, query: b.query, page: b.page, author: b.author } : null)),
    render_seconds: Math.round((Date.now() - t0) / 1000),
  };
  fs.writeFileSync(path.join(outDir, "meta.json"), JSON.stringify(meta, null, 1));
  fs.rmSync(work, { recursive: true, force: true });
  console.log(`Video made: ${mp4} (${meta.duration}s, ${meta.size_mb} MB, ${meta.render_seconds}s to render)`);
})().catch((e) => { console.error(e.stack || e); process.exit(1); });
