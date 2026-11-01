#!/usr/bin/env python3
"""Daily check after each slot: did every new article get its video? Run by the video workflow at 09:10 and 19:10.

  python3 tools/reel/watch.py [--retry]

- An article published since videos were switched on with no video sent yet -> Telegram alert (once per article).
- A video that failed and has fewer than max_attempts tries -> its render is started again (--retry, needs GH_TOKEN).
Writes videos/log.json (alerts are recorded so they are not repeated).
"""
import os, subprocess, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C  # noqa: E402
import deliver  # noqa: E402


def main():
    s = C.settings()
    if not s["enabled"]:
        print("Video automation is off.")
        return 0
    retry = "--retry" in sys.argv
    lg = C.log()
    since = str(s.get("since") or "")
    now = C.now()
    for a in C.articles():
        if (a["generated_at"] or a["date"]) < since:
            continue
        rec = next((v for v in lg["videos"] if v.get("slug") == a["slug"]), None)
        status = (rec or {}).get("status")
        if status == "sent":
            continue
        if status == "failed" and retry and int(rec.get("attempts") or 0) < int(s["max_attempts"]):
            r = subprocess.run(["gh", "workflow", "run", "reel.yml", "-f", "action=video", "-f", f"slug={a['slug']}"], capture_output=True, text=True)
            print(f"Retry {a['slug']}: {'started' if r.returncode == 0 else r.stderr.strip()}")
            continue
        if status in ("scripted", "rendering"):
            started = rec.get("render_started_at") or rec.get("scripted_at") or ""
            if started and (now - C.now().fromisoformat(started)).total_seconds() < 3 * 3600:
                continue  # still in progress
        if rec and rec.get("alerted_at"):
            continue
        what = {"failed": f"ផលិតមិនបានសម្រេច ({rec.get('attempts', 0)} ដង): {rec.get('error', '')}",
                "scripted": "Script រួច តែវីដេអូមិនទាន់ចេញ", "rendering": "កំពុងផលិតយូរពេក"}.get(status, "មិនទាន់មាន Script វីដេអូទេ")
        deliver.tg("sendMessage", {"parse_mode": "HTML", "disable_web_page_preview": "true",
                                   "text": f"⚠️ <b>អត្ថបទថ្មីមិនទាន់មានវីដេអូ</b>\n{deliver.e(a['title'])}\n{deliver.e(a['url'])}\n\nស្ថានភាព: {deliver.e(what)}"})
        rec = C.record(lg, a["slug"])
        rec.setdefault("article_title", a["title"]); rec.setdefault("article_url", a["url"])
        rec.setdefault("status", "missing")
        rec["alerted_at"] = C.iso()
        print(f"Alert sent for {a['slug']} ({status or 'no script'}).")
    C.save_log(lg)
    return 0


if __name__ == "__main__":
    sys.exit(main())
