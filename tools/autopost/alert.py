#!/usr/bin/env python3
"""Telegram alerts for the knowledge auto-publisher (run by .github/workflows/autopost-alerts.yml).

  python3 tools/autopost/alert.py --new-failures OLD_HISTORY.json   alert for failed slots added since OLD_HISTORY,
                                                                    and announce articles published since then
  python3 tools/autopost/alert.py --watchdog [--now ISO]           alert if a slot is overdue with no article
  python3 tools/autopost/alert.py --test                            send a test message

Needs the GitHub secrets TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID. Without them it prints the alert and exits 1,
so the workflow fails and GitHub emails the repository owner instead.
"""
import argparse, datetime, json, os, sys, urllib.parse, urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C

RUNS_URL = "https://github.com/vannakadsbox/adsbox-agency-site/actions"
SLOT_KH = {"morning": "ពេលព្រឹក", "evening": "ពេលល្ងាច"}


def send(text):
    token, chat = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip(), os.environ.get("TELEGRAM_CHAT_ID", "").strip()
    print("ALERT:\n" + text)
    if not token or not chat:
        print("TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID are not set; failing so GitHub emails the owner instead.")
        return False
    data = urllib.parse.urlencode({"chat_id": chat, "text": text, "disable_web_page_preview": "true"}).encode()
    try:
        with urllib.request.urlopen(f"https://api.telegram.org/bot{token}/sendMessage", data=data, timeout=20) as r:
            ok = json.load(r).get("ok"); print("Telegram:", "sent" if ok else "not sent"); return bool(ok)
    except Exception as ex:  # never print the token
        print("Telegram send failed:", type(ex).__name__, str(ex).replace(token, "***")); return False


def new_failures(old_path):
    try: old = json.load(open(old_path, encoding="utf-8")).get("runs", [])
    except Exception: old = []
    seen = {(r.get("date"), r.get("slot"), r.get("generated_at"), r.get("status")) for r in old}
    added = [r for r in C.history()["runs"] if (r.get("date"), r.get("slot"), r.get("generated_at"), r.get("status")) not in seen]
    fresh = [r for r in added if r.get("status") == "failed"]
    ok = True
    for r in added:
        if r.get("status") != "published": continue
        ok &= send(f"✅ ADS BOX: បានបោះពុម្ពអត្ថបទ{SLOT_KH.get(r.get('slot'), r.get('slot'))} ថ្ងៃ {r.get('date')}\n"
                   f"{r.get('title', '')}\n{r.get('url', '')}")
    for r in fresh:
        ok &= send(f"⚠️ ADS BOX: អត្ថបទ{SLOT_KH.get(r.get('slot'), r.get('slot'))} ថ្ងៃ {r.get('date')} មិនបានបោះពុម្ពទេ។\n"
                   f"Knowledge auto-post failed after {r.get('attempts')} attempt(s): {r.get('error')}\n"
                   f"Nothing was published. Check: {RUNS_URL}")
    if not fresh: print("No new failures.")
    return ok


def watchdog(now_iso=None):
    s, h = C.settings(), C.history()
    now = C.now_local(now_iso)
    if not s["enabled"]: print("Auto-publishing is paused; no watchdog alert."); return True
    ok = True
    for slot in C.SLOTS:
        if not s[slot]["enabled"]: continue
        t = C.slot_time(s, slot, now.date())
        start = t + datetime.timedelta(minutes=s["alert_after_minutes"])
        if not start <= now < start + datetime.timedelta(minutes=60): continue  # the hourly check alerts once per slot
        statuses = ("published",) if s["mode"] == "live" else ("published", "dry_run")
        if C.slot_record(h, now.date().isoformat(), slot, statuses):
            print(f"{slot}: done."); continue
        if C.slot_record(h, now.date().isoformat(), slot, ("failed",)):
            print(f"{slot}: failure already alerted."); continue
        ok &= send(f"⚠️ ADS BOX: មិនទាន់មានអត្ថបទ{SLOT_KH[slot]} ថ្ងៃ {now.date()} ទេ (ម៉ោង {s[slot]['time']})។\n"
                   f"No {slot} knowledge article was recorded {s['alert_after_minutes']} minutes after its scheduled time. "
                   f"The Claude scheduled task may not have run (paused, needs approval, or usage limit). Check the task in Claude and {RUNS_URL}")
    return ok


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--new-failures"); ap.add_argument("--watchdog", action="store_true")
    ap.add_argument("--now"); ap.add_argument("--test", action="store_true")
    a = ap.parse_args()
    if a.test: return 0 if send("✅ ADS BOX: Telegram alerts for the knowledge auto-publisher are working.") else 1
    if a.new_failures: return 0 if new_failures(a.new_failures) else 1
    if a.watchdog: return 0 if watchdog(a.now) else 1
    ap.error("choose --new-failures, --watchdog or --test")


if __name__ == "__main__":
    sys.exit(main())
