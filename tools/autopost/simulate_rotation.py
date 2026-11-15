#!/usr/bin/env python3
"""Print what the weekly rotation would publish day by day (read-only; nothing is written).

  python3 tools/autopost/simulate_rotation.py 2026-11-23 30
"""
import datetime, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C  # noqa: E402
import plan as PL  # noqa: E402


def main():
    start = datetime.date.fromisoformat(sys.argv[1] if len(sys.argv) > 1 else "2026-11-23")
    days = int(sys.argv[2]) if len(sys.argv) > 2 else 30
    s = dict(C.settings(), mode="live", rotation_start=start.isoformat())
    hist = {"runs": []}
    arts = C.existing_articles()
    for i in range(days):
        d = (start + datetime.timedelta(days=i)).isoformat()
        t, notes, msg = PL.rotation_topic(d, hist, arts, s)
        wd = datetime.date.fromisoformat(d).strftime("%a")
        if not t:
            print(f"{d} {wd}  —  {msg}"); continue
        hist["runs"].append({"date": d, "status": "published", "topic_id": t["topic_id"], "format": t["format"]})
        print(f"{d} {wd}  {t['rotation_category']:16s} {t['format']:13s} {t['topic']}")
        for n in notes:
            print(f"{'':16}note: {n}")


if __name__ == "__main__":
    main()
