// Make a storyboard video (1080x1920 MP4) from a story file: presenter scenes with the owner's photo,
// method scenes with an animated example, a Khmer voice, Khmer subtitles synced to the voice, soft music and effects.
// Run from the repo root:  node tools/video_story.js videos/story-aov.json [out.mp4] [--no-voice] [--stills DIR]
// --stills DIR saves one picture from the middle of each scene instead of making the video (for a quick check).
// Story file: { out, voice, scenes: [{ kind: presenter|pair|bundle|chat|delivery|checklist|cta, title, say, ... }] }
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const ROOT = path.join(__dirname, "..");

const FPS = 30;
const W = 1080, H = 1920;
const MIN_SCENE = 5;
const LEAD = 0.6;   // the voice starts this long after its scene appears
const TAIL = 0.9;   // and the scene stays this long after the voice ends
const OUTRO = 2.6;  // logo at the end

const b64 = (f) => fs.readFileSync(path.join(ROOT, f)).toString("base64");
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const KH = (n) => String(n).replace(/\d/g, (x) => "០១២៣៤៥៦៧៨៩"[x]);
const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
const img64 = (f) => fs.existsSync(path.join(ROOT, f)) ? "data:image/jpeg;base64," + b64(f) : "";
const FULL = img64("assets/video/presenter-full.jpg");
let FACE = img64("assets/video/presenter-face.jpg");

// Spoken Khmer for English words (the voice only; the screen keeps the English).
const SAY = [["ADS BOX", "អេដស៍ប៊ក"], ["Order", "អូឌ័រ"], ["Admin", "អាដមីន"], ["Caption", "ខេបសិន"], ["Bundle", "បាន់ឌល"],
  ["Boost", "ប៊ូស្ត៍"], ["Post", "ប៉ុស្ត៍"], ["Live", "ឡាយ"], ["Facebook", "ហ្វេសប៊ុក"], ["TikTok", "ធីកតុក"], ["Telegram", "តេឡេក្រាម"],
  ["Page", "ផេក"], ["Messenger", "មេសេនជ័រ"], ["Promotion", "ប្រូម៉ូសិន"], ["Comment", "ខមមិន"], ["Inbox", "អ៊ីនប្រុក"], ["Target", "ថាហ្គេត"]];
const spoken = (t) => SAY.reduce((s, [en, kh]) => s.replace(new RegExp("\\b" + en + "\\b", "gi"), kh), String(t)).replace(/[()…«»"]/g, " ");

// Subtitle lines: split the narration at sentence marks and spaces, then join pieces up to about 34 characters.
function chunks(text) {
  const pieces = String(text).split(/(?<=[។!?])\s*|\s+/).filter(Boolean);
  const out = [];
  for (const p of pieces) {
    const last = out[out.length - 1];
    if (last && !/[។!?]$/.test(last) && (last + " " + p).length <= 34) out[out.length - 1] = last + " " + p;
    else out.push(p);
  }
  return out;
}

function voice(scenes, voiceName, dir) {
  try {
    const lens = JSON.parse(execFileSync("python3", [path.join(__dirname, "tts.py"), voiceName, dir, ...scenes.map((s) => spoken(s.say))], { encoding: "utf8" }));
    scenes.forEach((s, i) => { s.voice = path.join(dir, i + ".mp3"); s.voiceLen = lens[i]; });
  } catch (e) {
    console.log("Warning: Khmer voice could not be made, the video will have music and effects only. " + String(e.message || e).split("\n")[0]);
  }
}

function timeline(scenes) {
  let t = 0;
  for (const s of scenes) {
    const talk = s.voiceLen || String(s.say || "").length * 0.075;  // a guess when there is no voice
    s.talk = talk;
    s.dur = s.kind === "outro" ? OUTRO : Math.max(MIN_SCENE, LEAD + talk + TAIL);
    s.start = t; t += s.dur;
  }
  return t;
}

// Each scene's HTML. at(f) is the moment, in seconds from the video start, at fraction f of the scene's voice.
// Every timed element gets its animation delay inline; pops collects the moments for the pop sound.
function sceneHtml(s, i) {
  const at = (f) => +(s.start + LEAD + s.talk * f).toFixed(3);
  const d = (t, extra = "") => `style="animation-delay:${t}s${extra}"`;
  const pop = (t) => { s.pops.push(t); return t; };
  s.pops = [];
  const head = (title) => `<div class="titlebox in" ${d(s.start + 0.15)}><b>${esc(title)}</b><i class="ul" ${d(s.start + 0.6)}></i></div>`;
  const tile = (o, t, cls = "") => `<div class="tile pop ${cls}" ${d(pop(t))}><span class="em">${o.emoji}</span><b>${esc(o.label)}</b>${o.note ? `<small>${esc(o.note)}</small>` : ""}</div>`;
  switch (s.kind) {
    case "presenter":
      return `<img class="photo zoom" src="${FULL}" alt="" ${d(s.start)}><div class="shade"></div>
        <div class="hello pop" ${d(pop(s.start + 0.4))}>👋 សួស្តីបងប្អូន!</div>
        <div class="bigtitle in" ${d(s.start + 0.8)}>${esc(s.title)}</div>`;
    case "cta":
      return `<img class="photo zoom" src="${FULL}" alt="" ${d(s.start)}><div class="shade"></div>
        <div class="bigtitle up in" ${d(s.start + 0.3)}>${esc(s.title)}</div>
        <div class="ctabtn pop" ${d(pop(at(0.42)))}><span>✈️</span><div><b>${esc(s.title2)}</b><small>t.me/vannakdm</small></div></div>`;
    case "pair":
      return `${head(s.title)}<div class="stage pair">
        ${tile(s.a, at(0.3))}
        <div class="plus pop" ${d(pop(at(0.55)))}>+</div>
        ${tile(s.b, at(0.62), "hi")}
        <div class="badge pop" ${d(pop(at(0.8)))}>🛒 Order កាន់តែធំ</div></div>`;
    case "bundle":
      return `${head(s.title)}<div class="stage bundle">
        <div class="tile small pop" ${d(pop(at(0.12)))}><span class="em">${s.single.emoji}</span><b>${esc(s.single.label)}</b></div>
        <div class="arrow pop" ${d(at(0.3))}>➜</div>
        <div class="tile big hi pop" ${d(pop(at(0.35)))}><span class="ems">${s.bundle.emoji.map((e, k) => `<span class="pop" ${d(pop(at(0.4 + k * 0.08)))}>${e}</span>`).join("")}</span>
          <b>${esc(s.bundle.label)}</b><small class="ribbon pop" ${d(pop(at(0.7)))}>🏷️ ${esc(s.bundle.note)}</small></div></div>`;
    case "chat": {
      const n = s.messages.length;
      const msgs = s.messages.map((m, k) => {
        const t = at(0.08 + (k / n) * 0.8);
        return `<div class="msg ${m.from} pop" ${d(pop(t))}>${esc(m.text)}</div>`;
      }).join("");
      return `${head(s.title)}<div class="stage"><div class="phone"><div class="bar2"><span class="dot"></span><b>Messenger</b></div><div class="msgs">${msgs}</div></div></div>`;
    }
    case "delivery": {
      const col = (c, t, good) => `<div class="col pop ${good ? "good" : "bad"}" ${d(pop(t))}><b>${esc(c.title)}</b>
        <div class="boxes">${Array.from({ length: c.boxes }, () => `<span class="truck">🚚</span>`).join("")}</div>
        <small>${good ? "✅" : "❌"} ${esc(c.note)}</small></div>`;
      return `${head(s.title)}<div class="stage delivery">${col(s.left, at(0.25), false)}${col(s.right, at(0.55), true)}</div>`;
    }
    case "checklist":
      return `${head(s.title)}<div class="stage"><div class="clip pop" ${d(s.start + 0.5)}><div class="cliptop">📋 បញ្ជីណែនាំ Admin</div>
        ${s.items.map((it, k) => { const t = at(0.25 + k * 0.22); return `<div class="item in" ${d(t)}><span class="tick pop" ${d(pop(t + 0.35))}>✓</span>${esc(it)}</div>`; }).join("")}</div></div>`;
    case "hook":
      return `<div class="center"><span class="bigemoji pop shake" ${d(pop(s.start + 0.15), `, ${s.start + 0.8}s`)}>${s.emoji}</span>
        <div class="hooktitle in" ${d(s.start + 0.35)}>${esc(s.title)}</div></div>`;
    case "problem":
      return `${head(s.title)}<div class="stage col2">${s.bubbles.map((b, k) => `<div class="qb q${k % 3} pop" ${d(pop(at(0.05 + k * 0.16)))}>${esc(b)}</div>`).join("")}
        ${s.note ? `<div class="pnote in" ${d(at(0.6))}>${esc(s.note)}</div>` : ""}</div>`;
    case "curiosity":
      return `<div class="center"><span class="bigemoji pop bob" ${d(pop(s.start + 0.15), `, ${s.start + 0.8}s`)}>${s.emoji}</span>
        <div class="hooktitle in" ${d(s.start + 0.35)}>${esc(s.title)}</div>
        ${s.badge ? `<div class="tipbadge pop" ${d(pop(at(0.7)))}>${esc(s.badge)} 👇</div>` : ""}</div>`;
    case "tip":
      return `<div class="center tipc"><div class="tipnum pop" ${d(pop(s.start + 0.15))}>${KH(s.n)}</div>
        <span class="tipemoji pop bob" ${d(pop(s.start + 0.4), `, ${s.start + 1}s`)}>${s.emoji}</span>
        <div class="tiptitle in" ${d(s.start + 0.5)}>${esc(s.title)}<i class="ul" ${d(s.start + 1)}></i></div>
        ${s.text ? `<div class="tiptext pop" ${d(pop(at(0.55)))}>${esc(s.text)}</div>` : ""}</div>`;
    case "caption":
      return `${head(s.title)}<div class="stage"><div class="post pop" ${d(s.start + 0.4)}><div class="posttop"><span class="av">🛍️</span><b>ហាងគំរូ</b></div>
        <div class="posthead">${esc(s.head)}</div>
        ${s.lines.map((l, k) => { const t = at(0.12 + k * 0.18); return `<div class="pline in" ${d(t)}><span class="tick pop" ${d(pop(t + 0.3))}>✓</span>${esc(l)}</div>`; }).join("")}</div></div>`;
    case "social":
      return `<div class="center"><div class="hooktitle in" ${d(s.start + 0.2)}>${esc(s.title)}</div>
        <div class="acts">${s.actions.map(([e, l], k) => `<div class="act pop" ${d(pop(at(0.12 + k * 0.28)))}><span>${e}</span><b>${esc(l)}</b></div>`).join("")}</div></div>`;
    case "outro":
      return `<div class="outro"><img class="pop" src="data:image/png;base64,${b64("assets/logo-mark-white.png")}" alt="" ${d(pop(s.start + 0.2))}>
        <img class="word in" src="data:image/png;base64,${b64("assets/logo-word-white.png")}" alt="" ${d(s.start + 0.6)}><p class="in" ${d(s.start + 0.9)}>adsbox.agency</p></div>`;
  }
  throw new Error("Unknown scene kind: " + s.kind);
}

function subtitles(scenes) {
  let h = "";
  for (const s of scenes) {
    if (!s.say) continue;
    const parts = chunks(s.say), total = parts.reduce((a, p) => a + p.length, 0);
    let t = s.start + LEAD;
    for (const p of parts) {
      const len = (s.talk * p.length) / total;
      h += `<div class="sub" style="animation: sub ${len.toFixed(3)}s linear ${t.toFixed(3)}s both">${esc(p)}</div>`;
      t += len;
    }
  }
  return h;
}

function page(scenes, total) {
  const photoKinds = new Set(["presenter", "cta", "outro"]);
  const hostCss = scenes.map((s, i) => photoKinds.has(s.kind) ? "" : `.host .h${i} { animation: show ${s.dur}s linear ${s.start}s both; }`).join("");
  const sceneCss = scenes.map((s, i) => `.s${i} { animation: scene ${s.dur}s linear ${s.start}s both; }`).join("");
  const flashCss = scenes.slice(1).map((s, i) => `.f${i} { animation: flash .4s ease-out ${s.start - 0.05}s both; }`).join("");
  const talkCss = scenes.map((s, i) => s.say ? `.talk${i} { animation: show ${s.talk}s linear ${s.start + LEAD}s both; }` : "").join("");
  let dots = "";
  for (let i = 0; i < 16; i++) {
    const x = (i * 137) % 1000 + 40, size = 8 + (i * 7) % 20, dur = 6 + (i % 5) * 1.7, delay = -((i * 1.3) % dur);
    dots += `<span class="p" style="left:${x}px;width:${size}px;height:${size}px;opacity:${0.12 + (i % 4) * 0.08};animation:float ${dur}s linear ${delay}s infinite"></span>`;
  }
  return `<!doctype html><html lang="km"><head><meta charset="utf-8"><style>
@font-face { font-family: M; font-weight: 700; src: url(data:font/woff2;base64,${b64("assets/fonts/MiSansKhmer-Bold.woff2")}) format("woff2"); unicode-range: U+1780-17FF, U+19E0-19FF, U+200C-200D, U+25CC; }
@font-face { font-family: M; font-weight: 500; src: url(data:font/woff2;base64,${b64("assets/fonts/MiSansKhmer-Medium.woff2")}) format("woff2"); unicode-range: U+1780-17FF, U+19E0-19FF, U+200C-200D, U+25CC; }
@font-face { font-family: L; font-weight: 400 700; src: url(data:font/woff2;base64,${b64("tools/fonts/kantumruy-latin.woff2")}) format("woff2"); }
* { box-sizing: border-box; margin: 0; }
body { width: ${W}px; height: ${H}px; overflow: hidden; position: relative; font-family: L, M, "Noto Color Emoji", sans-serif; color: #fff;
  background: linear-gradient(160deg, #0c1430 0%, #1c3f86 55%, #3f7dff 100%); }
.bg { position: absolute; inset: 0; overflow: hidden; }
.glow { position: absolute; border-radius: 50%; }
.g1 { width: 900px; height: 900px; right: -300px; top: -200px; background: radial-gradient(circle, rgba(124,108,255,.45), rgba(124,108,255,0) 65%); animation: drift ${total}s linear both; }
.g2 { width: 800px; height: 800px; left: -300px; bottom: -200px; background: radial-gradient(circle, rgba(43,179,163,.35), rgba(43,179,163,0) 65%); animation: drift2 ${total}s linear both; }
.p { position: absolute; bottom: -40px; border-radius: 50%; background: #fff; }
.scene { position: absolute; inset: 0; opacity: 0; overflow: hidden; }
.photo { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; transform-origin: 540px 560px; }
.zoom { animation: zoom 9s ease-out both; }
.shade { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(12,20,48,.55) 0%, rgba(12,20,48,0) 18%, rgba(12,20,48,0) 50%, rgba(12,20,48,.88) 72%, rgba(12,20,48,.96) 100%); }
.hello { position: absolute; left: 80px; top: 220px; font: 700 54px M, L, "Noto Color Emoji"; background: #ffd23f; color: #0c1430; padding: 14px 36px; border-radius: 999px; --r: -3deg; }
.bigtitle { position: absolute; left: 70px; right: 70px; top: 1130px; font: 700 80px/1.45 M, L; text-shadow: 0 6px 30px rgba(0,0,0,.5); }
.bigtitle.up { top: 960px; }
.ctabtn { position: absolute; left: 70px; right: 70px; top: 1220px; display: flex; align-items: center; gap: 26px; background: #fff; color: #0c1430; border-radius: 36px; padding: 26px 34px; box-shadow: 0 30px 70px rgba(0,0,0,.4); --r: 0deg; }
.ctabtn span { font: 90px "Noto Color Emoji"; }
.ctabtn b { display: block; font: 700 46px/1.45 M, L; }
.ctabtn small { display: block; font: 700 40px L; color: #1c4b9b; margin-top: 6px; }
.titlebox { position: absolute; left: 70px; right: 70px; top: 220px; background: #fff; color: #0c1430; border-radius: 36px; padding: 34px 42px 40px; box-shadow: 0 30px 70px rgba(0,0,0,.35); }
.titlebox b { font: 700 66px/1.45 M, L; display: block; }
.titlebox .ul { display: block; width: 220px; height: 14px; border-radius: 14px; background: #ffd23f; margin-top: 14px; transform-origin: left; animation: line .5s ease-out both; }
.stage { position: absolute; left: 70px; right: 70px; top: 640px; height: 760px; display: flex; align-items: center; justify-content: center; }
.tile { width: 400px; background: rgba(255,255,255,.12); border: 4px solid rgba(255,255,255,.35); border-radius: 40px; padding: 40px 24px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 18px; --r: 0deg; }
.tile.hi { border-color: #ffd23f; background: rgba(255,210,63,.16); box-shadow: 0 0 0 10px rgba(255,210,63,.18); }
.tile .em { width: 200px; height: 200px; border-radius: 50%; background: #fff; display: grid; place-items: center; font: 120px/1 "Noto Color Emoji"; }
.tile b { font: 700 50px/1.4 M, L; }
.tile small { font: 500 38px/1.4 M, L; opacity: .85; }
.pair { gap: 20px; flex-wrap: wrap; align-content: center; }
.plus { font: 700 110px L; color: #ffd23f; --r: 0deg; }
.badge { flex-basis: 100%; text-align: center; margin-top: 40px; font: 700 50px M, L, "Noto Color Emoji"; --r: -2deg; }
.badge { background: #ffd23f; color: #0c1430; padding: 18px 30px; border-radius: 999px; flex-basis: auto; }
.bundle { gap: 26px; }
.tile.small { width: 270px; padding: 30px 16px; opacity: .8; }
.tile.small .em { width: 150px; height: 150px; font-size: 90px; }
.tile.big { width: 520px; }
.tile .ems { display: flex; gap: 12px; }
.tile .ems span { width: 145px; height: 145px; border-radius: 50%; background: #fff; display: grid; place-items: center; font: 86px/1 "Noto Color Emoji"; --r: 0deg; }
.ribbon { background: #ffd23f; color: #0c1430 !important; opacity: 1 !important; font-weight: 700 !important; padding: 10px 26px; border-radius: 999px; --r: -3deg; }
.arrow { font: 700 90px L; color: #ffd23f; --r: 0deg; }
.phone { width: 820px; background: #f2f4fa; border-radius: 48px; overflow: hidden; box-shadow: 0 40px 90px rgba(0,0,0,.45); }
.bar2 { background: #1c4b9b; padding: 26px 36px; display: flex; align-items: center; gap: 18px; font: 700 40px L; }
.bar2 .dot { width: 26px; height: 26px; border-radius: 50%; background: #3be38a; }
.msgs { padding: 36px 30px 44px; display: flex; flex-direction: column; gap: 24px; min-height: 560px; }
.msg { max-width: 640px; padding: 24px 32px; border-radius: 34px; font: 500 42px/1.5 M, L, "Noto Color Emoji"; --r: 0deg; }
.msg.customer { align-self: flex-start; background: #fff; color: #0c1430; border-bottom-left-radius: 8px; }
.msg.admin { align-self: flex-end; background: #3f7dff; color: #fff; border-bottom-right-radius: 8px; }
.delivery { gap: 30px; }
.col { flex: 1; border-radius: 40px; padding: 44px 24px; text-align: center; display: flex; flex-direction: column; gap: 30px; align-items: center; --r: 0deg; }
.col.bad { background: rgba(255,90,90,.16); border: 4px solid rgba(255,120,120,.6); }
.col.good { background: rgba(59,227,138,.16); border: 4px solid #3be38a; box-shadow: 0 0 0 10px rgba(59,227,138,.15); }
.col b { font: 700 50px/1.4 M, L; }
.col small { font: 700 44px/1.4 M, L, "Noto Color Emoji"; }
.boxes { display: flex; flex-direction: column; gap: 10px; }
.truck { font: 110px/1.1 "Noto Color Emoji"; animation: drive 1.8s ease-in-out infinite alternate; display: inline-block; }
.clip { width: 860px; background: #fff; color: #0c1430; border-radius: 40px; padding: 40px 44px 50px; box-shadow: 0 40px 90px rgba(0,0,0,.4); --r: 0deg; }
.cliptop { font: 700 48px M, L, "Noto Color Emoji"; padding-bottom: 24px; border-bottom: 4px dashed #d5dbea; margin-bottom: 20px; }
.item { display: flex; align-items: center; gap: 24px; font: 500 46px/1.5 M, L, sans-serif; padding: 18px 0; }
.tick { flex: none; width: 70px; height: 70px; border-radius: 22px; background: #2bb3a3; color: #fff; display: grid; place-items: center; font: 700 46px L; --r: 0deg; }
.center { position: absolute; left: 70px; right: 70px; top: 300px; bottom: 420px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 50px; text-align: center; }
.bigemoji { font: 230px/1 "Noto Color Emoji"; width: 340px; height: 340px; border-radius: 90px; background: #fff; display: grid; place-items: center; box-shadow: 0 40px 80px rgba(0,0,0,.35); --r: -6deg; }
.pop.shake { animation: pop .6s cubic-bezier(.3,1.6,.5,1) both, shake .5s ease-in-out 3; }
.pop.bob { animation: pop .6s cubic-bezier(.3,1.6,.5,1) both, bob 2.4s ease-in-out infinite; }
.hooktitle { font: 700 84px/1.45 M, L; text-shadow: 0 6px 30px rgba(0,0,0,.35); }
.tipbadge { font: 700 60px M, L, "Noto Color Emoji"; background: #ffd23f; color: #0c1430; padding: 16px 44px; border-radius: 999px; --r: -3deg; }
.col2 { flex-direction: column; align-items: stretch; gap: 34px; }
.qb { font: 700 56px/1.4 M, L; background: #fff; color: #0c1430; padding: 28px 40px; border-radius: 40px; max-width: 80%; box-shadow: 0 24px 50px rgba(0,0,0,.3); }
.qb.q0 { align-self: flex-start; --r: -2deg; } .qb.q1 { align-self: flex-end; --r: 2deg; } .qb.q2 { align-self: flex-start; --r: -1deg; margin-left: 40px; }
.pnote { margin-top: 30px; text-align: center; font: 700 52px/1.5 M, L, "Noto Color Emoji"; color: #ffd23f; }
.tipc { gap: 40px; }
.tipnum { width: 170px; height: 170px; border-radius: 50%; background: #ffd23f; color: #0c1430; font: 700 110px/1 M, L; display: grid; place-items: center; --r: 0deg; }
.tipemoji { font: 150px/1 "Noto Color Emoji"; --r: 0deg; }
.tiptitle { position: relative; font: 700 86px/1.45 M, L; padding-bottom: 26px; }
.tiptitle .ul { position: absolute; left: 50%; margin-left: -130px; bottom: 0; width: 260px; height: 14px; border-radius: 14px; background: #ffd23f; transform-origin: center; animation: line .5s ease-out both; }
.tiptext { font: 700 54px/1.5 M, L, sans-serif; background: #fff; color: #1c4b9b; padding: 22px 40px; border-radius: 28px; --r: -1deg; }
.post { width: 880px; background: #fff; color: #0c1430; border-radius: 40px; padding: 36px 44px 46px; box-shadow: 0 40px 90px rgba(0,0,0,.4); --r: 0deg; }
.posttop { display: flex; align-items: center; gap: 20px; font: 700 42px M, L; margin-bottom: 20px; }
.posttop .av { width: 84px; height: 84px; border-radius: 50%; background: #e8eefc; display: grid; place-items: center; font: 48px "Noto Color Emoji"; }
.posthead { font: 700 52px/1.4 M, L, "Noto Color Emoji"; padding-bottom: 18px; border-bottom: 4px dashed #d5dbea; margin-bottom: 12px; }
.pline { display: flex; align-items: center; gap: 22px; font: 500 44px/1.5 M, L, sans-serif; padding: 14px 0; }
.acts { display: flex; flex-direction: column; gap: 30px; width: 100%; }
.act { display: flex; align-items: center; gap: 30px; background: rgba(255,255,255,.14); border: 4px solid rgba(255,255,255,.4); border-radius: 36px; padding: 26px 40px; --r: 0deg; }
.act span { font: 90px/1 "Noto Color Emoji"; }
.act b { font: 700 56px/1.4 M, L; }
@keyframes shake { 0%, 100% { translate: 0 0; } 25% { translate: -14px 0; } 75% { translate: 14px 0; } }
@keyframes bob { 0%, 100% { translate: 0 0; } 50% { translate: 0 -18px; } }
.outro { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 40px; }
.outro img { width: 300px; --r: 0deg; }
.outro .word { width: 520px; }
.outro p { font: 600 46px L; opacity: .85; }
.top { position: absolute; top: 80px; left: 70px; }
.top img { width: 280px; }
.pbar { position: absolute; top: 50px; left: 70px; right: 70px; height: 8px; border-radius: 8px; background: rgba(255,255,255,.2); overflow: hidden; }
.pbar i { display: block; height: 100%; background: linear-gradient(90deg, #ffd23f, #fff); transform-origin: left; animation: grow ${total}s linear both; }
.sub { position: absolute; left: 60px; right: 60px; bottom: 300px; text-align: center; opacity: 0; }
.sub { font: 700 58px/1.5 M, L; color: #fff; text-shadow: 0 0 12px rgba(0,0,0,.9), 0 4px 0 rgba(0,0,0,.6); }
.host { position: absolute; left: 70px; bottom: 90px; width: 600px; height: 150px; }
.host > div { position: absolute; inset: 0; display: flex; align-items: center; gap: 22px; opacity: 0; }
.host img { width: 140px; height: 140px; border-radius: 50%; object-fit: cover; border: 6px solid #fff; }
.host b { font: 700 36px L; }
.wave { display: flex; gap: 8px; align-items: center; height: 60px; }
.wave i { width: 10px; height: 60px; border-radius: 10px; background: #ffd23f; animation: wave .8s ease-in-out infinite; transform-origin: center; }
.wave i:nth-child(2) { animation-delay: -.2s; } .wave i:nth-child(3) { animation-delay: -.45s; } .wave i:nth-child(4) { animation-delay: -.65s; } .wave i:nth-child(5) { animation-delay: -.1s; }
.talk { opacity: 0; }
.flash { position: absolute; inset: 0; background: #fff; opacity: 0; }
.in { animation: rise .7s cubic-bezier(.2,.8,.2,1) both; }
.pop { animation: pop .6s cubic-bezier(.3,1.6,.5,1) both; }
@keyframes scene { 0% { opacity: 0; transform: scale(1.06); filter: blur(12px); } 6% { opacity: 1; transform: scale(1); filter: blur(0); }
  93% { opacity: 1; transform: none; filter: blur(0); } 100% { opacity: 0; transform: translateX(-120px); filter: blur(8px); } }
@keyframes show { 0%, 100% { opacity: 0; } 4%, 96% { opacity: 1; } }
@keyframes sub { 0% { opacity: 0; transform: translateY(16px); } 10% { opacity: 1; transform: none; } 92% { opacity: 1; } 100% { opacity: 0; } }
@keyframes zoom { from { transform: scale(1); } to { transform: scale(1.14); } }
@keyframes rise { from { opacity: 0; transform: translateY(70px); filter: blur(6px); } to { opacity: 1; transform: none; filter: blur(0); } }
@keyframes pop { from { opacity: 0; transform: scale(.2) rotate(-20deg); } to { opacity: 1; transform: scale(1) rotate(var(--r, 0deg)); } }
@keyframes line { from { transform: scaleX(0); } to { transform: scaleX(1); } }
@keyframes grow { from { transform: scaleX(0); } to { transform: scaleX(1); } }
@keyframes flash { 0% { opacity: 0; } 30% { opacity: .25; } 100% { opacity: 0; } }
@keyframes float { from { transform: translateY(0); } to { transform: translateY(-2000px); } }
@keyframes drift { to { transform: translate(-200px, 300px); } }
@keyframes drift2 { to { transform: translate(200px, -300px); } }
@keyframes wave { 0%, 100% { transform: scaleY(.25); } 50% { transform: scaleY(1); } }
@keyframes drive { from { transform: translateX(-30px); } to { transform: translateX(30px); } }
${sceneCss}${hostCss}${flashCss}${talkCss}
</style></head><body>
<div class="bg"><span class="glow g1"></span><span class="glow g2"></span>${dots}</div>
${scenes.map((s, i) => `<section class="scene s${i}">${sceneHtml(s, i)}</section>`).join("\n")}
<div class="pbar"><i></i></div>
<div class="top"><img src="data:image/png;base64,${b64("assets/logo-word-white.png")}" alt=""></div>
<div class="host">${scenes.map((s, i) => photoKinds.has(s.kind) || !FACE ? "" : `<div class="h${i}"><img src="${FACE}" alt=""><b>ADS BOX</b><span class="wave talk talk${i}"><i></i><i></i><i></i><i></i><i></i></span></div>`).join("")}</div>
${subtitles(scenes)}
${scenes.slice(1).map((s, i) => `<div class="flash f${i}"></div>`).join("")}
</body></html>`;
}

// Soft background music made by ffmpeg: a slow four-chord pad, kept well under the voice.
function music(total, out) {
  const t = "mod(t,16)";
  const root = `if(lt(${t},4),220,if(lt(${t},8),174.61,if(lt(${t},12),196,164.81)))`;
  const env = "pow(sin(PI*mod(t,4)/4),0.6)";
  const expr = `0.11*${env}*(sin(2*PI*${root}*t)+0.7*sin(2*PI*${root}*1.2599*t)+0.6*sin(2*PI*${root}*1.4983*t)+0.35*sin(2*PI*${root}*0.5*t))`;
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", `aevalsrc='${expr}':s=44100:d=${(total + 1).toFixed(2)}`,
    "-af", `lowpass=f=1800,afade=t=in:d=1.5,afade=t=out:st=${Math.max(0, total - 2).toFixed(2)}:d=2,volume=0.55`, out]);
}

function audio(scenes, total, dir, out) {
  const whoosh = path.join(dir, "whoosh.wav"), pop = path.join(dir, "pop.wav"), bed = path.join(dir, "music.wav");
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "anoisesrc=d=0.55:c=pink:a=0.6",
    "-af", "highpass=f=500,lowpass=f=3500,afade=t=in:d=0.25,afade=t=out:st=0.25:d=0.3,volume=0.3", whoosh]);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "sine=f=660:d=0.14",
    "-af", "asetrate=44100*1.6,aresample=44100,afade=t=out:st=0.02:d=0.12,volume=0.22", pop]);
  music(total, bed);
  const clips = [[bed, 0]];
  scenes.forEach((s, i) => {
    if (i > 0) clips.push([whoosh, Math.max(0, s.start - 0.2)]);
    s.pops.forEach((p) => clips.push([pop, p]));
    if (s.voice) clips.push([s.voice, s.start + LEAD]);
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
  if (!src) { console.error("usage: node tools/video_story.js videos/story.json [out.mp4] [--no-voice] [--stills DIR]"); process.exit(2); }
  const story = JSON.parse(fs.readFileSync(src, "utf8"));
  if (story.photo === false) FACE = "";  // no owner photo in this video
  const outArg = process.argv[3] && !process.argv[3].startsWith("--") ? process.argv[3] : null;
  const out = outArg || story.out || src.replace(/\.json$/, ".mp4");
  const stills = arg("--stills");
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "adsbox-story-"));
  const frames = path.join(work, "frames"); fs.mkdirSync(frames);

  const scenes = story.scenes.concat([{ kind: "outro" }]);
  if (!process.argv.includes("--no-voice") && !stills) voice(scenes.filter((s) => s.say), story.voice || "km-KH-PisethNeural", path.join(work, "voice"));
  const total = timeline(scenes);
  const html = page(scenes, total);

  const { chromium } = require("playwright");
  let browser;
  try { browser = await chromium.launch(); } catch (e) { browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }); }
  const pg = await browser.newPage({ viewport: { width: W, height: H } });
  await pg.setContent(html, { waitUntil: "load" });
  await pg.evaluate(() => document.fonts.ready);
  const seek = (ms) => pg.evaluate((ms) => document.getAnimations().forEach((a) => { a.pause(); a.currentTime = ms; }), ms);
  if (stills) {
    fs.mkdirSync(stills, { recursive: true });
    for (const [i, s] of scenes.entries()) {
      await seek((s.start + s.dur * 0.82) * 1000);
      await pg.screenshot({ path: path.join(stills, `scene-${i + 1}.jpg`), type: "jpeg", quality: 80 });
    }
    await browser.close();
    fs.rmSync(work, { recursive: true, force: true });
    console.log(`Stills saved in ${stills} (${total.toFixed(1)}s in all)`);
    return;
  }
  const n = Math.round(total * FPS);
  for (let f = 0; f < n; f++) {
    await seek((f * 1000) / FPS);
    await pg.screenshot({ path: path.join(frames, String(f).padStart(5, "0") + ".jpg"), type: "jpeg", quality: 92 });
  }
  await browser.close();

  const wav = path.join(work, "audio.wav");
  audio(scenes, total, work, wav);
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", path.join(frames, "%05d.jpg"), "-i", wav,
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "medium", "-crf", "20", "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart", out]);
  fs.rmSync(work, { recursive: true, force: true });
  console.log(`Video made: ${out} (${total.toFixed(1)}s${scenes[0].voice ? ", with voice" : ", no voice"})`);
})();
