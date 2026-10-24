"""Shared helpers for the daily knowledge auto-publishing system.

Files it works with (all editable in the admin panel, Pages CMS):
  content/autopost/settings.json    on/off switches, times, limits
  content/autopost/categories.json  the rotating topic categories for each slot
  content/autopost/facts.md         the only facts articles may state about ADS BOX
  content/autopost/history.json     one record per scheduled slot (published, failed, dry run)
"""
import datetime, json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
AUTO = os.path.join(ROOT, "content", "autopost")
ARTICLES = os.path.join(ROOT, "content", "articles")
DRY_RUNS = os.path.join(AUTO, "dry-runs")
SLOTS = ("morning", "evening")
# Cambodia uses UTC+7 all year (no daylight saving), so a fixed offset is exact and needs no tz database.
TZ = datetime.timezone(datetime.timedelta(hours=7), "Asia/Phnom_Penh")
KHMER = re.compile(r"[ក-៿᧠-᧿]")
LATIN = re.compile(r"[A-Za-z]")


def load_json(name, default=None):
    path = os.path.join(AUTO, name)
    if not os.path.exists(path): return default
    with open(path, encoding="utf-8") as f: return json.load(f)


def save_json(name, data):
    path = os.path.join(AUTO, name)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2); f.write("\n")


def settings():
    s = load_json("settings.json", {}) or {}
    s.setdefault("enabled", True); s.setdefault("mode", "dry_run")
    for slot, t in (("morning", "07:00"), ("evening", "17:00")):
        s.setdefault(slot, {}); s[slot].setdefault("enabled", True); s[slot].setdefault("time", t)
    for k, v in (("early_minutes", 15), ("late_minutes", 90), ("alert_after_minutes", 50), ("max_attempts", 3),
                 ("min_khmer_chars", 1300), ("max_khmer_chars", 3800)):
        s.setdefault(k, v)
    return s


def history():
    h = load_json("history.json", {"runs": []}) or {"runs": []}
    h.setdefault("runs", [])
    return h


def now_local(iso=None):
    if iso:
        d = datetime.datetime.fromisoformat(iso)
        if d.tzinfo is None: d = d.replace(tzinfo=TZ)
        return d.astimezone(TZ)
    return datetime.datetime.now(TZ)


def slot_time(s, slot, day):
    hh, mm = (int(x) for x in str(s[slot]["time"]).split(":"))
    return datetime.datetime.combine(day, datetime.time(hh, mm), TZ)


def slot_record(h, date, slot, statuses=("published",)):
    for r in reversed(h["runs"]):
        if r.get("date") == date and r.get("slot") == slot and r.get("status") in statuses: return r
    return None


def read_front_matter(path):
    import yaml
    with open(path, encoding="utf-8") as f: text = f.read()
    m = re.match(r"^---\s*\n(.*?)\n---\s*\n?(.*)$", text, re.S)
    if not m: return {}, text
    return yaml.safe_load(m.group(1)) or {}, m.group(2)


def existing_articles():
    """Every article in content/articles (published or draft), newest first."""
    out = []
    if not os.path.isdir(ARTICLES): return out
    for name in os.listdir(ARTICLES):
        if not name.endswith(".md"): continue
        fm, body = read_front_matter(os.path.join(ARTICLES, name))
        d = fm.get("date"); d = d.isoformat()[:10] if hasattr(d, "isoformat") else str(d or "")[:10]
        out.append({"slug": name[:-3], "title": str(fm.get("title") or ""), "date": d, "tag": str(fm.get("tag") or ""),
                    "category": str(fm.get("category") or ""), "primary_keyword": str(fm.get("primary_keyword") or ""),
                    "summary": str(fm.get("summary") or ""), "body": body})
    return sorted(out, key=lambda a: a["date"], reverse=True)


def norm(s):
    return re.sub(r"[\s\W_]+", "", str(s).lower())


def shingles(s, n):
    s = norm(s)
    return {s[i:i + n] for i in range(max(1, len(s) - n + 1))} if s else set()


def similarity(a, b, n=3):
    A, B = shingles(a, n), shingles(b, n)
    return len(A & B) / len(A | B) if A and B else 0.0
