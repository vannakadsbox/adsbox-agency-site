#!/usr/bin/env python3
"""Send a finished video (or a problem report) to Telegram and record it in videos/log.json.

  python3 tools/reel/deliver.py sent   --slug SLUG --dir OUT_DIR [--archive archive.json] [--run URL]
  python3 tools/reel/deliver.py failed --slug SLUG --step STEP --error TEXT [--run URL]
  python3 tools/reel/deliver.py note   --file videos/requests/<id>.json [--run URL]
  python3 tools/reel/deliver.py status --slug SLUG --to rendering

Needs TELEGRAM_BOT_TOKEN and TELEGRAM_VIDEO_CHAT_ID (or TELEGRAM_CHAT_ID). The token is never printed.
"sent" posts EXACTLY 3 items per video (owner, 1 Nov 2026), in this order and nothing else:
  1) the MP4 as a playable Telegram video, file name <slug>.mp4, the original file (not re-encoded)
  2) the ready-to-post Facebook caption (script "facebook_caption") as plain, copyable text
  3) the 16:9 thumbnail as a JPG file, <slug>-thumbnail.jpg (sent as a file so it is not compressed)
No reports, script, scene lists or duplicate files. Exit 1 if any of the 3 was not accepted.
"""
import argparse, html, json, os, subprocess, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C  # noqa: E402

TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
CHAT = (os.environ.get("TELEGRAM_VIDEO_CHAT_ID") or os.environ.get("TELEGRAM_CHAT_ID") or "").strip()
e = lambda s: html.escape(str(s or ""), quote=False)


def tg(method, fields, files=None):
    """Call the Bot API with curl (multipart). Returns the parsed reply; never prints the token."""
    if not (TOKEN and CHAT):
        print("Telegram is not configured (TELEGRAM_BOT_TOKEN / chat id).", file=sys.stderr)
        return {"ok": False, "description": "not configured"}
    cmd = ["curl", "-sS", "--max-time", "300", "--retry", "3", "--retry-delay", "5", "--form-string", f"chat_id={CHAT}"]
    for k, v in fields.items():
        cmd += ["--form-string", f"{k}={v}"]  # text is sent as-is (no @file or ;type= parsing)
    for k, p in (files or {}).items():
        p, name = p if isinstance(p, tuple) else (p, None)
        cmd += ["-F", f"{k}=@{p}" + (f";filename={name}" if name else "")]
    cmd.append(f"https://api.telegram.org/bot{TOKEN}/{method}")
    r = subprocess.run(cmd, capture_output=True, text=True)
    try:
        out = json.loads(r.stdout or "{}")
    except json.JSONDecodeError:
        out = {"ok": False, "description": (r.stdout or r.stderr)[:300].replace(TOKEN, "***")}
    if not out.get("ok"):
        print(f"Telegram {method} failed: {out.get('description')}", file=sys.stderr)
    return out


def chunks(text, size=3800):
    parts, cur = [], ""
    for block in text.split("\n\n"):
        if len(cur) + len(block) + 2 > size and cur:
            parts.append(cur)
            cur = ""
        cur = (cur + "\n\n" + block) if cur else block
    if cur:
        parts.append(cur)
    return parts


def script_text(script):
    rows = [f"📝 <b>Script</b> · {e(script['video_title'])}"]
    for i, sc in enumerate(script["scenes"], 1):
        head = f"<b>{i}. {e(sc['role'])}</b>" + (f" · {e(sc.get('label'))}" if sc.get("label") else "") + \
               (f" · <i>{e(sc.get('keyword'))}</i>" if sc.get("keyword") else "")
        rows.append(head + "\n" + e(" ".join(sc["lines"])))
    rows.append("📣 <b>Caption សម្រាប់បង្ហោះ</b>\n" + e(script.get("description")))
    return "\n\n".join(rows)


NAMES = {"motion_graphics": "motion graphics", "phone_chat": "phone & chat", "illustrated": "illustrated story",
         "product_dashboard": "product & dashboard demos",
         "animation": "animation", "screen_demo": "screen demos", "product_visual": "product visuals"}


def quality(mp4, meta):
    """Technical checks on the actual file (ffprobe / ffmpeg), each marked passed only if it was measured."""
    def run(args):
        return subprocess.run(args, capture_output=True, text=True)
    pr = run(["ffprobe", "-v", "error", "-show_entries", "stream=codec_type,codec_name,width,height,r_frame_rate,sample_rate,channels",
              "-show_entries", "format=duration", "-of", "json", mp4])
    info = json.loads(pr.stdout or "{}")
    v = next((x for x in info.get("streams", []) if x.get("codec_type") == "video"), {})
    au = next((x for x in info.get("streams", []) if x.get("codec_type") == "audio"), {})
    dur = float((info.get("format") or {}).get("duration") or 0)
    lo = run(["ffmpeg", "-hide_banner", "-i", mp4, "-af", "ebur128", "-f", "null", "-"]).stderr
    lufs = next((l.split("I:")[1].strip() for l in reversed(lo.splitlines()) if l.strip().startswith("I:")), "?")
    dec = run(["ffmpeg", "-v", "error", "-i", mp4, "-f", "null", "-"])
    ok = lambda b: "✅" if b else "❌"
    mix = meta.get("visual_mix") or {}
    rows = [
        "🔧 <b>Technical quality report</b> (measured on the delivered file)",
        f"{ok(v.get('width') == 1080 and v.get('height') == 1920)} Resolution {v.get('width')}×{v.get('height')} (9:16)",
        f"{ok(v.get('r_frame_rate') == '30/1')} Frame rate {v.get('r_frame_rate')}",
        f"{ok(v.get('codec_name') == 'h264' and au.get('codec_name') == 'aac')} Codecs {v.get('codec_name')} / {au.get('codec_name')} {au.get('sample_rate')} Hz",
        f"{ok(40 <= dur <= 95)} Duration {dur:.1f}s",
        f"{ok(not dec.stderr.strip())} Plays start to end (full decode, {'no errors' if not dec.stderr.strip() else 'errors'})",
        f"{ok(lufs != '?' and -16 <= float(lufs.split()[0]) <= -12)} Loudness {lufs} (target −14)",
        f"{ok(meta.get('subtitle_sync') == 'word')} Subtitles timed to {meta.get('subtitle_sync')} marks from the voice",
        "🎨 Visual mix (share of running time): " + " · ".join(f"{NAMES.get(k, k)} {round(100 * v)}%" for k, v in mix.items() if v),
    ]
    return "\n".join(rows), {"width": v.get("width"), "height": v.get("height"), "fps": v.get("r_frame_rate"), "duration": round(dur, 2),
                             "video_codec": v.get("codec_name"), "audio_codec": au.get("codec_name"), "loudness": lufs,
                             "decode_errors": bool(dec.stderr.strip()), "visual_mix": mix}


def caption_text(script, meta):
    """Item 1: one clean Khmer caption for sellers."""
    dur = int(round(meta.get("duration", 0)))
    return (f"🎬 <b>{e(script['video_title'])}</b>\n\n"
            f"💡 {e(script['topic'])}\n\n"
            f"📖 អានអត្ថបទពេញ 👉 {e(script['article']['url'])}\n\n"
            f"⏱ រយៈពេល {dur} វិនាទី · 📐 {e(meta.get('resolution'))}\n"
            f"🛍 គន្លឹះលក់អនឡាញពី ADS BOX")


def facebook_caption(script):
    """Item 2: the ready-to-post Facebook caption (plain text, so it copies cleanly)."""
    t = str(script.get("facebook_caption") or "").strip()
    if not t:  # older scripts: the short post caption plus the article link
        t = str(script.get("description") or "").strip() + f"\n\n📖 អានអត្ថបទពេញ៖ {script['article']['url']}"
    return t[:4096]


def sent(a):
    script = C.read_json(os.path.join(C.SCRIPTS, f"{a.slug}.json"))
    meta = C.read_json(os.path.join(a.dir, "meta.json"), {})
    mp4 = os.path.join(a.dir, f"{a.slug}.mp4")
    thumb, cover = os.path.join(a.dir, f"{a.slug}-thumb.jpg"), os.path.join(a.dir, f"{a.slug}-cover.jpg")
    dur = int(round(meta.get("duration", 0)))
    lg = C.log()
    rec = C.record(lg, a.slug)
    items = []

    def fail(what, r):
        rec.update({"status": "failed", "error": f"Telegram {what}: {r.get('description')}", "failed_at": C.iso(), "run": a.run or "",
                    "telegram": {"ok": False, "items": items}})
        C.save_log(lg)
        return 1

    wide = os.path.join(a.dir, f"{a.slug}-thumbnail.jpg")
    if not os.path.exists(wide):
        wide = thumb
    # 1) Video: the original MP4 as a playable video (no caption)
    r = tg("sendVideo", {"supports_streaming": "true", "width": "1080", "height": "1920", "duration": str(dur),
                         "cover": "attach://coverimg", "thumbnail": "attach://thumbimg"},
           {"video": (mp4, f"{a.slug}.mp4"), "coverimg": thumb, "thumbimg": cover})
    if not r.get("ok"):
        return fail("video", r)
    v = r["result"].get("video") or {}
    items.append({"item": "video", "message_id": r["result"]["message_id"], "file_name": v.get("file_name"),
                  "file_size": v.get("file_size"), "width": v.get("width"), "height": v.get("height"), "file_id": v.get("file_id")})
    # 2) Facebook caption as plain, copyable text
    r = tg("sendMessage", {"text": facebook_caption(script), "disable_web_page_preview": "true"})
    if not r.get("ok"):
        return fail("caption", r)
    items.append({"item": "facebook_caption", "message_id": r["result"]["message_id"]})
    # 3) Thumbnail (16:9) as a file, so Telegram does not recompress it
    r = tg("sendDocument", {"disable_content_type_detection": "true"}, {"document": (wide, f"{a.slug}-thumbnail.jpg")})
    if not r.get("ok"):
        return fail("thumbnail", r)
    d = r["result"].get("document") or {}
    items.append({"item": "thumbnail", "message_id": r["result"]["message_id"], "file_name": d.get("file_name"),
                  "file_size": d.get("file_size")})
    qtext, qdata = quality(mp4, meta)  # kept in the log only; not sent to Telegram
    archive = C.read_json(a.archive, {}) if a.archive else {}
    mp4_asset = next((x for x in archive.get("assets", []) if str(x.get("name", "")).endswith(".mp4")), {})
    rec.update({
        "status": "sent", "error": "", "sent_at": C.iso(), "rendered_at": rec.get("rendered_at") or C.iso(), "run": a.run or "",
        "duration": meta.get("duration"), "size_mb": meta.get("size_mb"), "render_seconds": meta.get("render_seconds"),
        "voice": meta.get("voice"), "music": meta.get("music"), "style": meta.get("style"), "visuals": meta.get("visuals"),
        "resolution": meta.get("resolution"), "fps": meta.get("fps"), "subtitle_sync": meta.get("subtitle_sync"), "footage": [], "footage_share": 0, "stock_footage": "none (removed)",
        "telegram": {"ok": True, "message_id": items[0]["message_id"], "chat": "configured", "at": C.iso(),
                     "file_id": items[0].get("file_id"), "items": items, "sent_count": len(items),
                     "local_sizes": {"video": os.path.getsize(mp4), "thumbnail": os.path.getsize(wide)}},
        "speech_match": meta.get("speech_match"), "scene_sync": meta.get("scene_sync"),
        "archive": archive, "quality": qdata,
        "article_id": a.slug, "video_id": mp4_asset.get("id"), "video_url": mp4_asset.get("url"),
        "created_at": rec.get("created_at") or C.iso(), "telegram_status": "delivered", "production_status": "complete",
    })
    C.save_log(lg)
    print(f"Sent {a.slug} to Telegram: 3 items, messages {[x['message_id'] for x in items]}.")
    return 0


def failed(a):
    lg = C.log()
    rec = C.record(lg, a.slug)
    rec["attempts"] = int(rec.get("attempts") or 0) + 1
    rec.update({"status": "failed", "error": f"{a.step}: {a.error}"[:500], "failed_at": C.iso(), "run": a.run or "",
                "article_id": a.slug, "production_status": "failed",
                "telegram_status": "not sent" if a.step != "telegram" else "failed"})
    C.save_log(lg)
    title = rec.get("video_title") or a.slug
    tg("sendMessage", {"parse_mode": "HTML", "disable_web_page_preview": "true",
                       "text": f"⚠️ <b>ផលិតវីដេអូមិនបានសម្រេច</b>\n{e(title)}\n\nជំហាន: {e(a.step)}\nបញ្ហា: {e(a.error)[:600]}\n"
                               f"លើកទី {rec['attempts']}" + (f"\n{e(a.run)}" if a.run else "")})
    return 0


def note(a):
    try:
        n = C.read_json(a.file, {}) or {}
    except (ValueError, OSError):
        n = {"type": "failed", "reason": f"unreadable note {a.file}"}
    if n.get("type") == "no-article":
        text = "ℹ️ <b>ថ្ងៃនេះមិនមានអត្ថបទថ្មីសម្រាប់ធ្វើវីដេអូទេ</b>\nអត្ថបទទាំងអស់មានវីដេអូរួចហើយ។ មិនបានធ្វើវីដេអូពីអត្ថបទចាស់ឡើងវិញទេ។"
    else:
        text = f"⚠️ <b>ការសរសេរ Script វីដេអូមិនបានសម្រេច</b>\n{e(n.get('reason'))}"
    if a.run:
        text += f"\n{e(a.run)}"
    r = tg("sendMessage", {"text": text, "parse_mode": "HTML", "disable_web_page_preview": "true"})
    return 0 if r.get("ok") else 1


def status(a):
    lg = C.log()
    rec = C.record(lg, a.slug)
    rec["status"] = a.to
    if a.to == "rendering":
        rec["render_started_at"] = C.iso()
    C.save_log(lg)
    return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("action", choices=["sent", "failed", "note", "status"])
    ap.add_argument("--slug"); ap.add_argument("--dir"); ap.add_argument("--archive"); ap.add_argument("--run")
    ap.add_argument("--step", default=""); ap.add_argument("--error", default=""); ap.add_argument("--file"); ap.add_argument("--to")
    a = ap.parse_args()
    return {"sent": sent, "failed": failed, "note": note, "status": status}[a.action](a)


if __name__ == "__main__":
    sys.exit(main())
