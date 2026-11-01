#!/usr/bin/env python3
"""Voice notes from the owner, sent to the ADS BOX Telegram bot, become finished videos.

  python3 tools/voice_inbox.py   prints "<storyboard.json> <recording file>" lines for each new recording, and downloads them to /tmp/voice/

Only messages from TELEGRAM_CHAT_ID are used. A voice note, audio file or audio document counts as a recording.
Its caption may name the article (slug, or a link to it); otherwise the newest storyboard is used.
Storyboards live in content/videos/<slug>.json (or videos/story-<slug>.json for samples).
"""
import glob, json, os, re, sys, urllib.request

TOKEN, CHAT = os.environ["TELEGRAM_BOT_TOKEN"], str(os.environ["TELEGRAM_CHAT_ID"])
API = f"https://api.telegram.org/bot{TOKEN}"


def call(method, **params):
    data = json.dumps(params).encode()
    req = urllib.request.Request(f"{API}/{method}", data=data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)["result"]


def storyboards():
    found = {}
    for f in glob.glob("content/videos/*.json") + glob.glob("videos/story-*.json"):
        slug = os.path.basename(f)[:-5].removeprefix("story-")
        found[slug] = f
    return found


def pick(caption, boards):
    words = re.findall(r"[a-z0-9-]{3,}", (caption or "").lower())
    for w in words:
        if w in boards:
            return boards[w]
    return max(boards.values(), key=os.path.getmtime) if boards else None


def main():
    os.makedirs("/tmp/voice", exist_ok=True)
    updates = call("getUpdates", timeout=0, allowed_updates=["message"])
    boards = storyboards()
    last = None
    for u in updates:
        last = u["update_id"]
        m = u.get("message") or {}
        if str(m.get("chat", {}).get("id")) != CHAT:
            continue
        media = m.get("voice") or m.get("audio") or (m.get("document") if str((m.get("document") or {}).get("mime_type", "")).startswith("audio") else None)
        if not media:
            continue
        board = pick(m.get("caption"), boards)
        if not board:
            call("sendMessage", chat_id=CHAT, text="⚠️ មិនទាន់មាន storyboard សម្រាប់សំឡេងនេះទេ។")
            continue
        path = call("getFile", file_id=media["file_id"])["file_path"]
        out = f"/tmp/voice/{m['message_id']}{os.path.splitext(path)[1] or '.ogg'}"
        urllib.request.urlretrieve(f"https://api.telegram.org/file/bot{TOKEN}/{path}", out)
        call("sendMessage", chat_id=CHAT, reply_to_message_id=m["message_id"], text="🎙️ ទទួលបានសំឡេងហើយ! កំពុងធ្វើវីដេអូ ប្រហែល ១០ នាទី…")
        print(board, out)
    if last is not None:
        call("getUpdates", offset=last + 1, timeout=0)  # mark these as read


if __name__ == "__main__":
    sys.exit(main())
