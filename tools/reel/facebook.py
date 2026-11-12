#!/usr/bin/env python3
"""Publish an ADS BOX video to the owner's Facebook Page as a Reel, only after the owner taps "Publish" in Telegram.

  python3 tools/reel/facebook.py check                       Page reachable with the token? (prints the Page name only)
  python3 tools/reel/facebook.py publish SLUG MP4 [--draft]  upload MP4 as a Reel with the script's facebook_caption
  python3 tools/reel/facebook.py poll                        handle "Publish" taps from Telegram (run every few minutes)

Secrets (environment only, never printed): FB_PAGE_ID, FB_PAGE_TOKEN (system-user token; the Page token is fetched from it),
TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID / TELEGRAM_VIDEO_CHAT_ID. Taps are accepted only from those chats.
"""
import json, os, subprocess, sys, time, urllib.parse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C  # noqa: E402
import deliver  # noqa: E402

GRAPH = "https://graph.facebook.com/v23.0"
PAGE_ID = os.environ.get("FB_PAGE_ID", "").strip()
SYS_TOKEN = os.environ.get("FB_PAGE_TOKEN", "").strip()
CHATS = {deliver.CHAT} if deliver.CHAT else set()  # the chat the videos are sent to (deliver.tg always answers there)


def note(level, msg):
    """GitHub annotation (visible without the log); secrets are scrubbed."""
    for s in (SYS_TOKEN, os.environ.get("TELEGRAM_BOT_TOKEN", "")):
        if s:
            msg = msg.replace(s, "***")
    print(f"::{level}::{msg}")


def curl(args):
    r = subprocess.run(["curl", "-sS", "--max-time", "600", *args], capture_output=True, text=True)
    try:
        return json.loads(r.stdout or "{}")
    except json.JSONDecodeError:
        return {"error": {"message": (r.stdout or r.stderr)[:300]}}


def graph(method, path, params):
    if method == "GET":
        return curl([f"{GRAPH}/{path}?{urllib.parse.urlencode(params)}"])
    return curl(["-X", "POST", f"{GRAPH}/{path}", *sum((["--form-string", f"{k}={v}"] for k, v in params.items()), [])])


def page_token():
    if not (PAGE_ID and SYS_TOKEN):
        raise SystemExit("FB_PAGE_ID / FB_PAGE_TOKEN are not set.")
    r = graph("GET", PAGE_ID, {"fields": "name,access_token", "access_token": SYS_TOKEN})
    if r.get("error") or not r.get("access_token"):
        raise SystemExit(f"Facebook did not give a Page token: {(r.get('error') or {}).get('message', 'no access_token')}")
    return r["name"], r["access_token"]


def set_cover(vid, pt, thumb):
    """Use our 1080x1920 thumbnail as the Reel's cover (otherwise Facebook shows the first frame, the logo intro)."""
    if not thumb or not os.path.exists(thumb):
        return {"skipped": "no thumbnail file"}
    r = curl(["-X", "POST", f"{GRAPH}/{vid}/thumbnails", "-F", f"access_token={pt}", "-F", "is_preferred=true", "-F", f"source=@{thumb}"])
    if r.get("error"):
        note("warning", f"cover for {vid} not set: {(r['error'] or {}).get('message')}")
    return r


def get_thumb(slug):
    path = f"/tmp/{slug}-thumb.jpg"
    ok = subprocess.run(["gh", "release", "download", "video-archive", "-p", f"{slug}-thumb.jpg", "-O", path, "--clobber"],
                        capture_output=True).returncode == 0
    return path if ok else None


def publish(slug, mp4, draft=False):
    """Facebook Reels upload: start -> upload the file -> finish with the caption. Returns (video_id, url)."""
    # The publisher stays awake for ~55 minutes: fetch the latest scripts first, so a video sent after it started still
    # finds its caption (bug seen 12 Nov 2026: the tap crashed on a script added after the run began).
    subprocess.run(["git", "pull", "-q", "--rebase"], capture_output=True)
    script = C.read_json(os.path.join(C.SCRIPTS, f"{slug}.json")) or {}
    if not script:
        raise SystemExit(f"videos/scripts/{slug}.json not found")
    caption = str(script.get("facebook_caption") or script.get("description") or "").strip()
    name, pt = page_token()
    s = graph("POST", f"{PAGE_ID}/video_reels", {"upload_phase": "start", "access_token": pt})
    vid = s.get("video_id")
    if not vid:
        raise SystemExit(f"Reel start failed: {(s.get('error') or {}).get('message', s)}")
    up = curl(["-X", "POST", s.get("upload_url") or f"https://rupload.facebook.com/video-upload/v23.0/{vid}",
               "-H", f"Authorization: OAuth {pt}", "-H", "offset: 0", "-H", f"file_size: {os.path.getsize(mp4)}",
               "--data-binary", f"@{mp4}"])
    if not up.get("success"):
        raise SystemExit(f"Reel upload failed: {(up.get('error') or {}).get('message', up)}")
    f = graph("POST", f"{PAGE_ID}/video_reels", {"upload_phase": "finish", "video_id": vid, "access_token": pt,
                                                 "video_state": "DRAFT" if draft else "PUBLISHED", "description": caption})
    if not f.get("success"):
        raise SystemExit(f"Reel finish failed: {(f.get('error') or {}).get('message', f)}")
    status = {}
    for _ in range(30):  # wait for Facebook to process it (up to ~5 minutes)
        status = (graph("GET", vid, {"fields": "status", "access_token": pt}).get("status") or {})
        if status.get("video_status") in ("ready", "error") or (status.get("processing_phase") or {}).get("status") == "error":
            break
        time.sleep(10)
    cover = set_cover(vid, pt, get_thumb(slug))
    url = f"https://www.facebook.com/reel/{vid}"
    entry = {"video_id": vid, "url": url, "state": "draft" if draft else "published", "at": C.iso(),
             "page": name, "status": status.get("video_status"), "cover": "set" if cover.get("success") or cover.get("id") else "default"}
    save_fb(slug, entry)
    return vid, url, name, status


def save_fb(slug, entry):
    """Record the Facebook post in videos/log.json and push it straight away (other workflows also write the log)."""
    for attempt in range(4):
        subprocess.run(["git", "pull", "-q", "--rebase"], capture_output=True)
        lg = C.log()
        C.record(lg, slug)["facebook"] = entry
        C.save_log(lg)
        subprocess.run(["git", "-c", "user.name=ADS BOX video bot", "-c", "user.email=noreply@anthropic.com", "commit", "-q",
                        "-m", f"Video log: Facebook {slug} [skip ci]", "--", "videos/log.json"], capture_output=True)
        if subprocess.run(["git", "push", "-q"], capture_output=True).returncode == 0:
            return
        subprocess.run(["git", "reset", "-q", "--hard", "@{u}"], capture_output=True)
        time.sleep(5)


def tg(method, fields):
    return deliver.tg(method, fields)


def poll():
    """Read button taps ("fbpub:<slug>") from Telegram and publish those videos."""
    r = tg("getUpdates", {"allowed_updates": json.dumps(["callback_query"]), "timeout": "0"})
    ups = r.get("result") or []
    last = None
    for u in ups:
        last = u["update_id"]
        q = u.get("callback_query") or {}
        data, msg = str(q.get("data") or ""), q.get("message") or {}
        chat = str((msg.get("chat") or {}).get("id", ""))
        if not data.startswith("fbpub:") or chat not in CHATS:
            continue
        slug = data.split(":", 1)[1]
        tg("answerCallbackQuery", {"callback_query_id": q.get("id", ""), "text": "កំពុងបង្ហោះទៅ Facebook..."})
        rec = next((v for v in C.log().get("videos", []) if v.get("slug") == slug), {})
        done = (rec.get("facebook") or {}).get("state") == "published"
        if done:
            url = rec["facebook"]["url"]
        else:
            mp4 = f"/tmp/{slug}.mp4"
            if subprocess.run(["gh", "release", "download", "video-archive", "-p", f"{slug}.mp4", "-O", mp4, "--clobber"]).returncode:
                tg("sendMessage", {"text": f"⚠️ រកវីដេអូ {slug} មិនឃើញ មិនទាន់បានបង្ហោះទេ។", "reply_to_message_id": str(msg.get("message_id", ""))})
                continue
            try:
                vid, url, name, status = publish(slug, mp4)
            except (SystemExit, Exception) as ex:  # any failure is reported in Telegram instead of stopping the publisher
                note("error", f"{slug}: {ex}")
                tg("sendMessage", {"text": f"⚠️ បង្ហោះទៅ Facebook មិនបានសម្រេច៖ {ex}", "reply_to_message_id": str(msg.get("message_id", ""))})
                continue
            note("notice", f"{slug}: published Reel {vid} on {name} (status {status.get('video_status')})")
        # Replace the button with a link, so it cannot be tapped twice.
        tg("editMessageReplyMarkup", {"message_id": str(msg.get("message_id", "")),
                                      "reply_markup": json.dumps({"inline_keyboard": [[{"text": "✅ បានបង្ហោះ · មើលលើ Facebook", "url": url}]]})})
        tg("sendMessage", {"text": f"✅ បានបង្ហោះទៅ Facebook Page ហើយ\n{url}", "reply_to_message_id": str(msg.get("message_id", "")),
                           "disable_web_page_preview": "true"})
    if last is not None:
        tg("getUpdates", {"offset": str(last + 1), "timeout": "0"})  # confirm, so each tap is handled once
    print(f"Handled {len(ups)} update(s).")


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    try:
        if cmd == "check":
            name, _ = page_token()
            note("notice", f"Facebook OK: the token can post to the Page '{name}'.")
            wh = tg("getWebhookInfo", {})
            if (wh.get("result") or {}).get("url"):
                note("warning", "This Telegram bot has a webhook; the Publish button cannot be read by polling.")
        elif cmd == "publish":
            vid, url, name, status = publish(sys.argv[2], sys.argv[3], draft="--draft" in sys.argv)
            note("notice", f"Reel {vid} ({'draft, not public' if '--draft' in sys.argv else 'published'}) on '{name}', status {status}")
        elif cmd == "offer":  # send an existing video's caption again, with the Publish button
            slug = sys.argv[2]
            script = C.read_json(os.path.join(C.SCRIPTS, f"{slug}.json"))
            r = tg("sendMessage", {"text": deliver.facebook_caption(script), "disable_web_page_preview": "true",
                                   "reply_markup": json.dumps({"inline_keyboard": [[{"text": "✅ Publish ទៅ Facebook Page", "callback_data": f"fbpub:{slug}"}]]})})
            note("notice" if r.get("ok") else "error", f"offer {slug}: {'sent' if r.get('ok') else r.get('description')}")
        elif cmd == "cover":  # set our thumbnail on a Reel that is already on the Page
            slug = sys.argv[2]
            rec = next((v for v in C.log().get("videos", []) if v.get("slug") == slug), {})
            vid = (rec.get("facebook") or {}).get("video_id")
            if not vid:
                raise SystemExit(f"{slug} has no Facebook video yet")
            _, pt = page_token()
            r = set_cover(vid, pt, get_thumb(slug))
            note("notice" if (r.get("success") or r.get("id")) else "error", f"cover {slug} ({vid}): {json.dumps(r)[:300]}")
        elif cmd == "status":  # what Facebook says about each Reel we posted (read-only)
            _, pt = page_token()
            for v in C.log().get("videos", []):
                fb = v.get("facebook") or {}
                if not fb.get("video_id"):
                    continue
                r = graph("GET", fb["video_id"], {"fields": "status,published,permalink_url,privacy,created_time,description",
                                                  "access_token": pt})
                info = {k: r.get(k) for k in ("published", "permalink_url", "privacy", "created_time")}
                info["status"] = r.get("status")
                info["error"] = (r.get("error") or {}).get("message")
                note("notice", f"{v['slug']} ({fb.get('state')}): {json.dumps(info, ensure_ascii=False)[:900]}")
            r = graph("GET", f"{PAGE_ID}/video_reels", {"fields": "id,created_time,permalink_url,status", "limit": "25", "access_token": pt})
            note("notice", f"Page video_reels: {json.dumps(r, ensure_ascii=False)[:2500]}")
            r = graph("GET", f"{PAGE_ID}/videos", {"fields": "id,created_time,permalink_url,published", "limit": "25", "access_token": pt})
            note("notice", f"Page videos: {json.dumps(r, ensure_ascii=False)[:2500]}")
        elif cmd == "poll":
            poll()
        elif cmd == "loop":  # stay awake and check for taps every 20 seconds (GitHub's short schedules are irregular)
            end = time.time() + 60 * float(sys.argv[2] if len(sys.argv) > 2 else 55)
            while time.time() < end:
                poll()
                time.sleep(20)
        else:
            print(__doc__)
            return 2
    except SystemExit as ex:
        note("error", str(ex))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
