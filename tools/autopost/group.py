#!/usr/bin/env python3
"""Post new knowledge articles to the ADS BOX Telegram group (run by .github/workflows/telegram-group.yml).

  python3 tools/autopost/group.py --new-since OLD.json [--new NEW.json]   post every article published between the two
  python3 tools/autopost/group.py --latest                       post the newest published article (test)
  python3 tools/autopost/group.py --find-group                   send the owner the IDs of groups the bot is in

Each post is the article's cover picture with its title, summary and link. It waits until the article page is
live on adsbox.agency first, so the link works when people tap it.

Secrets: TELEGRAM_BOT_TOKEN (the same bot as the alerts), TELEGRAM_GROUP_ID (the group), and for --find-group
TELEGRAM_CHAT_ID (the owner's chat, where the group IDs are sent). The token is never printed.
"""
import argparse, html, json, os, sys, time, uuid, urllib.parse, urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C

ROOT = C.ROOT
API = "https://api.telegram.org/bot{token}/{method}"


def token():
    t = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
    if not t: sys.exit("TELEGRAM_BOT_TOKEN is not set.")
    return t


def call(method, fields=None, files=None):
    tok = token()
    url = API.format(token=tok, method=method)
    if files:
        boundary = uuid.uuid4().hex; body = b""
        for k, v in (fields or {}).items():
            body += f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode()
        for k, (name, data, ctype) in files.items():
            body += f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"; filename="{name}"\r\nContent-Type: {ctype}\r\n\r\n'.encode() + data + b"\r\n"
        body += f"--{boundary}--\r\n".encode()
        req = urllib.request.Request(url, data=body, headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
    else:
        req = urllib.request.Request(url, data=urllib.parse.urlencode(fields or {}).encode())
    try:
        with urllib.request.urlopen(req, timeout=60) as r: return json.load(r)
    except urllib.error.HTTPError as ex:
        try: msg = json.load(ex).get("description", "")
        except Exception: msg = ""
        print(f"Telegram {method} failed: {ex.code} {msg}".replace(tok, "***")); return {"ok": False}
    except Exception as ex:
        print(f"Telegram {method} failed: {type(ex).__name__}"); return {"ok": False}


def article(slug):
    path = os.path.join(ROOT, "content", "articles", slug + ".md")
    if not os.path.exists(path): return None
    import yaml
    text = open(path, encoding="utf-8").read()
    fm = yaml.safe_load(text.split("---", 2)[1]) if text.startswith("---") else {}
    return fm or {}


def wait_live(url, minutes=12):
    """Wait until the article page answers 200 on the live site (GitHub Pages takes a minute or two)."""
    end = time.time() + minutes * 60
    while time.time() < end:
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "adsbox-telegram"}), timeout=20) as r:
                if r.status == 200: return True
        except Exception: pass
        time.sleep(30)
    return False


def caption(fm, url):
    title = html.escape(str(fm.get("title") or "").strip())
    summary = html.escape(str(fm.get("summary") or "").strip())
    tag = html.escape(str(fm.get("tag") or "").strip())
    text = f"📚 <b>{title}</b>\n\n{summary}\n\n👉 <a href=\"{html.escape(url)}\">អានអត្ថបទពេញ</a>"
    if tag: text += f"\n\n#{tag.replace(' ', '_')} · ADS BOX"
    return text[:1024]


def post(slug, url):
    group = os.environ.get("TELEGRAM_GROUP_ID", "").strip()
    if not group: print("TELEGRAM_GROUP_ID is not set yet; nothing posted."); return True
    fm = article(slug)
    if fm is None or fm.get("draft"): print(f"{slug}: no published article file; skipped."); return True
    if not wait_live(url): print(f"{slug}: page is not live yet after waiting; posting anyway.")
    cover = os.path.join(ROOT, "assets", "covers", slug + ".png")
    fields = {"chat_id": group, "caption": caption(fm, url), "parse_mode": "HTML"}
    if os.path.exists(cover):
        r = call("sendPhoto", fields, {"photo": (slug + ".png", open(cover, "rb").read(), "image/png")})
    else:
        r = call("sendMessage", {"chat_id": group, "text": fields["caption"], "parse_mode": "HTML"})
    print(f"{slug}: {'posted to the group' if r.get('ok') else 'NOT posted'}")
    return bool(r.get("ok"))


def published_since(old_path, new_path=None):
    try: old = json.load(open(old_path, encoding="utf-8")).get("runs", [])
    except Exception: old = []
    runs = json.load(open(new_path, encoding="utf-8")).get("runs", []) if new_path else C.history()["runs"]
    seen = {(r.get("date"), r.get("slot"), r.get("slug")) for r in old if r.get("status") == "published"}
    return [r for r in runs if r.get("status") == "published" and r.get("slug") and (r.get("date"), r.get("slot"), r.get("slug")) not in seen]


def find_group():
    r = call("getUpdates", {"allowed_updates": json.dumps(["message", "my_chat_member"])})
    chats = {}
    for u in r.get("result", []) if r.get("ok") else []:
        for key in ("message", "my_chat_member", "channel_post"):
            chat = (u.get(key) or {}).get("chat") or {}
            if chat.get("type") in ("group", "supergroup", "channel"): chats[chat["id"]] = chat.get("title", "")
    owner = os.environ.get("TELEGRAM_CHAT_ID", "").strip()
    if not chats:
        text = ("🔎 ADS BOX bot: មិនទាន់ឃើញ Group ទេ។ សូមបន្ថែម bot ចូល Group ហើយសរសេរ /start@ ឈ្មោះ bot ក្នុង Group "
                "រួចដំណើរការម្តងទៀត។\nNo group found yet: add the bot to the group, send a message there, then run this again.")
    else:
        text = "🔎 ADS BOX bot · Group IDs:\n" + "\n".join(f"• {t}: {i}" for i, t in chats.items()) + \
               "\n\nដាក់លេខនេះក្នុង GitHub secret TELEGRAM_GROUP_ID (រួមទាំងសញ្ញា -)"
    print(f"Found {len(chats)} group(s).")
    if owner: call("sendMessage", {"chat_id": owner, "text": text})
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--new-since"); ap.add_argument("--new", help="history.json of the commit that was built (default: current)"); ap.add_argument("--latest", action="store_true"); ap.add_argument("--find-group", action="store_true")
    a = ap.parse_args()
    if a.find_group: return 0 if find_group() else 1
    if a.latest:
        runs = [r for r in C.history()["runs"] if r.get("status") == "published" and r.get("slug")]
        if not runs: print("No published article yet."); return 0
        r = runs[-1]; return 0 if post(r["slug"], r.get("url") or f"https://adsbox.agency/knowledge/{r['slug']}/") else 1
    if a.new_since:
        new = published_since(a.new_since, a.new)
        if not new: print("No newly published articles."); return 0
        ok = True
        for r in new: ok &= post(r["slug"], r.get("url") or f"https://adsbox.agency/knowledge/{r['slug']}/")
        return 0 if ok else 1
    ap.error("choose --new-since, --latest or --find-group")


if __name__ == "__main__":
    sys.exit(main())
