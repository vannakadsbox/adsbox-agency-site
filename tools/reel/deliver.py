#!/usr/bin/env python3
"""Send a finished video (or a problem report) to Telegram and record it in videos/log.json.

  python3 tools/reel/deliver.py sent   --slug SLUG --dir OUT_DIR [--archive archive.json] [--run URL]
  python3 tools/reel/deliver.py failed --slug SLUG --step STEP --error TEXT [--run URL]
  python3 tools/reel/deliver.py note   --file videos/requests/<id>.json [--run URL]
  python3 tools/reel/deliver.py status --slug SLUG --to rendering

Needs TELEGRAM_BOT_TOKEN and TELEGRAM_VIDEO_CHAT_ID (or TELEGRAM_CHAT_ID). The token is never printed.
"sent" posts: 1) the playable video with title, topic, article link and status (cover = the thumbnail),
2) the thumbnail picture, 3) the full script and the post caption. Exit 1 if Telegram did not accept the video.
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
        cmd += ["-F", f"{k}=@{p}"]
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


def sent(a):
    script = C.read_json(os.path.join(C.SCRIPTS, f"{a.slug}.json"))
    meta = C.read_json(os.path.join(a.dir, "meta.json"), {})
    mp4 = os.path.join(a.dir, f"{a.slug}.mp4")
    thumb, cover = os.path.join(a.dir, f"{a.slug}-thumb.jpg"), os.path.join(a.dir, f"{a.slug}-cover.jpg")
    dur = int(round(meta.get("duration", 0)))
    caption = (f"🎬 <b>{e(script['video_title'])}</b>\n\n{e(script['topic'])}\n\n"
               f"📄 អត្ថបទ: {e(script['article']['url'])}\n"
               f"⏱ {dur}s · 📐 {e(meta.get('resolution'))} · {meta.get('fps')} fps · 🎨 {e(meta.get('style', 'Motion graphics'))} ({meta.get('scenes')} scenes)\n"
               f"🎙 {e(meta.get('voice'))} · 🎵 {e(meta.get('music'))}\n"
               f"💬 Subtitles: {e(meta.get('subtitle_sync'))}\n"
               f"✅ ផលិតរួច · 👀 Preview ប៉ុណ្ណោះ (មិនទាន់បង្ហោះជាសាធារណៈ)")
    r = tg("sendVideo", {"caption": caption[:1024], "parse_mode": "HTML", "supports_streaming": "true",
                         "width": "1080", "height": "1920", "duration": str(dur),
                         "cover": "attach://coverimg", "thumbnail": "attach://thumbimg"},
           {"video": mp4, "coverimg": thumb, "thumbimg": cover})
    lg = C.log()
    rec = C.record(lg, a.slug)
    if not r.get("ok"):
        rec.update({"status": "failed", "error": f"Telegram sendVideo: {r.get('description')}", "failed_at": C.iso(), "run": a.run or ""})
        C.save_log(lg)
        return 1
    msg = r["result"]
    # The original file too: Telegram's in-app player may stream a smaller copy; this one is the exact 1080x1920 MP4.
    tg("sendDocument", {"caption": f"📁 ឯកសារដើម (Original) 1080x1920 · {meta.get('size_mb')} MB", "disable_content_type_detection": "true"}, {"document": mp4})
    tg("sendPhoto", {"caption": "🖼 Thumbnail · " + script["thumbnail_text"]}, {"photo": thumb})
    if meta.get("footage"):
        rows = [f"🎞 <b>Footage report</b> · Pixabay ≈{round(100 * meta.get('footage_share', 0))}% of the video, animation for the rest"]
        for f in meta["footage"]:
            rows.append(f"Scene {f['scene']} ({e(f.get('role'))}, {f.get('seconds')}s): Pixabay #{f['id']} by {e(f.get('author'))}\n"
                        f"search: {e(f.get('query'))} · tags: {e(', '.join(f.get('tags') or [])[:80])}\n{e(f.get('page'))}")
        tg("sendMessage", {"text": "\n\n".join(rows)[:4000], "parse_mode": "HTML", "disable_web_page_preview": "true"})
    for part in chunks(script_text(script)):
        tg("sendMessage", {"text": part, "parse_mode": "HTML", "disable_web_page_preview": "true"})
    archive = C.read_json(a.archive, {}) if a.archive else {}
    mp4_asset = next((x for x in archive.get("assets", []) if str(x.get("name", "")).endswith(".mp4")), {})
    rec.update({
        "status": "sent", "error": "", "sent_at": C.iso(), "rendered_at": rec.get("rendered_at") or C.iso(), "run": a.run or "",
        "duration": meta.get("duration"), "size_mb": meta.get("size_mb"), "render_seconds": meta.get("render_seconds"),
        "voice": meta.get("voice"), "music": meta.get("music"), "style": meta.get("style"), "visuals": meta.get("visuals"),
        "resolution": meta.get("resolution"), "fps": meta.get("fps"), "subtitle_sync": meta.get("subtitle_sync"), "footage": meta.get("footage") or [], "footage_share": meta.get("footage_share", 0),
        "telegram": {"ok": True, "message_id": msg.get("message_id"), "chat": "configured", "at": C.iso(),
                     "file_id": (msg.get("video") or {}).get("file_id")},
        "archive": archive,
        "article_id": a.slug, "video_id": mp4_asset.get("id"), "video_url": mp4_asset.get("url"),
        "created_at": rec.get("created_at") or C.iso(), "telegram_status": "delivered", "production_status": "complete",
    })
    C.save_log(lg)
    print(f"Sent {a.slug} to Telegram (message {msg.get('message_id')}).")
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
