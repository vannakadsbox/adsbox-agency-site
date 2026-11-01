"""Shared helpers for the ADS BOX daily knowledge video system ("reels").

Files:
  videos/settings.json        on/off switch, daily time, voice, limits (editable in the admin panel)
  videos/log.json             one record per video: article, script, status, times, Telegram delivery, errors
  videos/scripts/<slug>.json  the conversational Khmer script for each article (written by the daily Claude task)
  videos/requests/<id>.json   small notes the daily task leaves for the video workflow (no new article, failure)
The finished MP4 and thumbnail of each video are kept in the draft GitHub release "video-archive" (never public).
"""
import datetime, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, "tools"))

VIDEOS = os.path.join(ROOT, "videos")
SCRIPTS = os.path.join(VIDEOS, "scripts")
REQUESTS = os.path.join(VIDEOS, "requests")
ARTICLES = os.path.join(ROOT, "content", "articles")
FACTS = os.path.join(ROOT, "content", "autopost", "facts.md")
SITE = "https://adsbox.agency"
TZ = datetime.timezone(datetime.timedelta(hours=7), "Asia/Phnom_Penh")
KHMER = re.compile(r"[ក-៿᧠-᧿]")

DEFAULT_SETTINGS = {
    "enabled": False,          # daily automation stays off until the owner approves the test video
    "time": "09:00",           # Phnom Penh time the daily video is made
    "voice": "km-KH-PisethNeural",
    "rate": "+2%",
    "music_volume": 0.11,
    "min_scenes": 7, "max_scenes": 12,
    "min_chars": 420, "max_chars": 1100,
    "max_brand_share": 0.2,
    "max_attempts": 3,
}


def now():
    return datetime.datetime.now(TZ)


def iso(d=None):
    return (d or now()).isoformat(timespec="seconds")


def read_json(path, default=None):
    if not os.path.exists(path):
        return default
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def write_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")
    os.replace(tmp, path)


def settings():
    s = dict(DEFAULT_SETTINGS)
    s.update(read_json(os.path.join(VIDEOS, "settings.json"), {}) or {})
    return s


def log():
    d = read_json(os.path.join(VIDEOS, "log.json"), None) or {"videos": []}
    d.setdefault("videos", [])
    return d


def save_log(d):
    write_json(os.path.join(VIDEOS, "log.json"), d)


def record(d, slug):
    for v in d["videos"]:
        if v.get("slug") == slug:
            return v
    v = {"slug": slug}
    d["videos"].append(v)
    return v


def articles():
    """Published articles, newest first: [{slug, title, summary, date, url, path}]."""
    import content  # the site's front matter reader (needs PyYAML), loaded only when articles are read
    out = []
    for name in os.listdir(ARTICLES):
        if not name.endswith(".md"):
            continue
        path = os.path.join(ARTICLES, name)
        fm, body = content.read_front_matter(path)
        if fm.get("draft") is True:
            continue
        slug = str(fm.get("slug") or name[:-3])
        out.append({"slug": slug, "title": str(fm.get("title") or slug), "summary": str(fm.get("summary") or ""),
                    "date": str(fm.get("date") or ""), "generated_at": str(fm.get("generated_at") or ""),
                    "url": f"{SITE}/knowledge/{slug}/", "path": path, "body": body, "tag": str(fm.get("tag") or "")})
    out.sort(key=lambda a: (a["date"], a["generated_at"]), reverse=True)
    return out


def used_slugs():
    """Articles that already have a script or a video (never used twice)."""
    used = {v["slug"] for v in log()["videos"] if v.get("slug")}
    if os.path.isdir(SCRIPTS):
        used |= {n[:-5] for n in os.listdir(SCRIPTS) if n.endswith(".json")}
    return used


def khmer_len(s):
    return len(KHMER.findall(s or ""))
