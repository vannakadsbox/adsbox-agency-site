#!/usr/bin/env python3
"""Pixabay stock clips for the "clips" video style. Re-enabled by the owner on 7 Nov 2026 (reference: real moving clips mixed
with motion graphics, cuts every 2-4 seconds). Earlier history: removed on 1 Nov 2026. Runs on GitHub, never in public.

  python3 tools/reel/footage.py auto SCRIPT.json OUT_DIR    pick and download up to 2 clips per scene with "footage": {"queries": [...]}
                                                            automatically (best match, portrait first, never reused) -> OUT_DIR/footage.json

  python3 tools/reel/footage.py check                       test PIXABAY_API_KEY and the connection (exit 0 = OK)
  python3 tools/reel/footage.py search SCRIPT.json OUT_DIR  candidates for every scene with "footage": {"queries": [...]}
                                                            -> OUT_DIR/candidates.json + one contact sheet per scene
  python3 tools/reel/footage.py fetch SCRIPT.json OUT_DIR   download the clip chosen for each scene ("footage": {"id": ...})
  python3 tools/reel/footage.py report SCRIPT.json          print the Footage Selection Report (markdown)

Rules: videos/footage-guideline.json (owner-approved): 8 editorial categories mapped to Pixabay's own categories
(business, computer, people, transportation), blocked subjects, one clip per scene, never the same clip twice,
a written reason for every choice, animation when nothing fits.
                                                            -> OUT_DIR/footage.json (scene -> local file, Pixabay page, author)

How clips are chosen: search shows several candidates per scene (still frames, tags, size) on a contact sheet; a person
or the script writer looks at them and writes the chosen id into the script. Only chosen clips are downloaded.

Pixabay rules followed: requests spaced well under 100/minute and the rate-limit headers respected; search results
cached for 24 hours (.cache/pixabay); videos downloaded (no hotlinking), only the chosen clips, at about 1080p;
Pixabay Content License (free commercial use, no attribution required); clips are edited into a new work.
The API key is read from the environment and never printed.
"""
import hashlib, json, os, subprocess, sys, time, urllib.error, urllib.parse, urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C  # noqa: E402

UA = "ADSBOX-video/1.0 (+https://adsbox.agency)"
CACHE = os.path.join(C.ROOT, ".cache", "pixabay")
API = "https://pixabay.com/api/videos/"
MAX_BYTES = 40_000_000
PER_SCENE = 9
_last = [0.0]
GUIDE = C.read_json(os.path.join(C.VIDEOS, "footage-guideline.json"), {}) or {}
CATEGORIES = GUIDE.get("categories", {})
OFF_TOPIC = set(GUIDE.get("blocked_tags", []))
SHOP_WORDS = {"shop", "store", "boutique", "retail", "shopping", "business", "sale", "customer", "seller"}


def blocked(tags):
    words = {w for t in tags for w in t.split()} | set(tags)
    if words & OFF_TOPIC:
        return True
    return "fashion" in words and not (words & SHOP_WORDS)  # fashion shoots and runways, unless it is a shop


def key():
    k = os.environ.get("PIXABAY_API_KEY", "").strip()
    if not k:
        raise SystemExit("PIXABAY_API_KEY is not set.")
    return k


def get(params, tries=3):
    url = API + "?" + urllib.parse.urlencode({"key": key(), **params})
    for i in range(tries):
        wait = 0.8 - (time.time() - _last[0])
        if wait > 0:
            time.sleep(wait)
        _last[0] = time.time()
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=40) as r:
                left = r.headers.get("X-RateLimit-Remaining")
                if left is not None and int(left) < 5:
                    time.sleep(int(r.headers.get("X-RateLimit-Reset") or 30))
                return json.load(r)
        except urllib.error.HTTPError as ex:
            if ex.code in (400, 401, 403):
                raise SystemExit(f"Pixabay refused the request (HTTP {ex.code}).")
            time.sleep(10 if ex.code == 429 else 3 * (i + 1))
        except Exception:
            time.sleep(3 * (i + 1))
    return None


def cached(name, params):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, hashlib.sha1(name.encode()).hexdigest() + ".json")
    if os.path.exists(path) and time.time() - os.path.getmtime(path) < 24 * 3600:
        return C.read_json(path)
    data = get(params)
    if data is not None:
        C.write_json(path, data)
    return data


def rendition(hit):
    files = [f for f in (hit.get("videos") or {}).values() if f and f.get("url") and f.get("width")]
    good = [f for f in files if min(f["width"], f["height"]) >= 1080 and (f.get("size") or 0) <= MAX_BYTES]
    if good:
        return min(good, key=lambda f: f["width"] * f["height"])
    small = [f for f in files if (f.get("size") or 0) <= MAX_BYTES]
    return max(small, key=lambda f: f["width"] * f["height"]) if small else None


def info(hit):
    f = rendition(hit) or {}
    tags = [t.strip().lower() for t in str(hit.get("tags") or "").split(",") if t.strip()]
    return {"id": hit["id"], "page": hit.get("pageURL"), "author": hit.get("user"), "duration": hit.get("duration"), "tags": tags,
            "width": f.get("width"), "height": f.get("height"), "url": f.get("url"), "thumb": f.get("thumbnail"),
            "views": hit.get("views"), "downloads": hit.get("downloads")}


def download(url, path, tries=3):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=180) as r, open(path, "wb") as f:
                while True:
                    b = r.read(1 << 20)
                    if not b:
                        break
                    f.write(b)
            if os.path.getsize(path) > 20_000:
                return True
        except Exception:
            time.sleep(3)
    return False


def sheet(cands, out, title):
    """Contact sheet: each candidate's still frame with its number, id, size, length and tags."""
    from PIL import Image, ImageDraw, ImageFont
    cw, ch, cols = 420, 300, 3
    rows = (len(cands) + cols - 1) // cols
    img = Image.new("RGB", (cw * cols, ch * rows + 60), (11, 20, 48))
    d = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 18)
        small = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 15)
    except OSError:
        font = small = ImageFont.load_default()
    d.text((12, 18), title[:110], fill=(255, 210, 63), font=font)
    for i, c in enumerate(cands):
        x, y = (i % cols) * cw, 60 + (i // cols) * ch
        tp = out + f".{i}.jpg"
        if c.get("thumb") and download(c["thumb"], tp):
            try:
                t = Image.open(tp).convert("RGB")
                t.thumbnail((cw - 10, ch - 70))
                img.paste(t, (x + 5, y + 5))
            except Exception:
                pass
            os.remove(tp)
        d.rectangle([x + 5, y + 5, x + 60, y + 35], fill=(255, 210, 63))
        d.text((x + 12, y + 9), f"#{i}", fill=(11, 20, 48), font=font)
        d.text((x + 8, y + ch - 62), f"id {c['id']} · {c['width']}x{c['height']} · {c['duration']}s", fill=(255, 255, 255), font=small)
        d.text((x + 8, y + ch - 40), ", ".join(c["tags"])[:52], fill=(190, 200, 230), font=small)
    img.save(out, quality=88)


def search(script_path, out):
    script = C.read_json(script_path)
    os.makedirs(out, exist_ok=True)
    result = {}
    for i, sc in enumerate(script["scenes"]):
        spec = sc.get("footage") or {}
        q = spec.get("queries") or []
        if not q:
            continue
        cat = CATEGORIES.get(spec.get("category") or "")
        if not cat:
            print(f"Scene {i + 1}: category '{spec.get('category')}' is not on the approved list; skipped.")
            continue
        seen, cands = set(), []
        for query in q:
            data = cached(f"q:{cat['pixabay']}:{query.lower()}", {"q": query[:100], "category": cat["pixabay"], "per_page": 20,
                                                               "safesearch": "true", "video_type": "film"}) or {}
            for h in data.get("hits") or []:
                c = info(h)
                if c["id"] in seen or not c["url"] or (c["duration"] or 0) < 4:
                    continue
                if blocked(c["tags"]):
                    continue
                seen.add(c["id"])
                c["query"] = query
                cands.append(c)
        # Several candidates from each query, best-known first (Pixabay relevance order is kept within a query).
        picked, per = [], max(2, PER_SCENE // max(1, len(q)))
        for query in q:
            picked += [c for c in cands if c["query"] == query][:per]
        picked = picked[:PER_SCENE]
        result[str(i)] = {"lines": sc["lines"], "category": spec["category"], "pixabay_category": cat["pixabay"], "queries": q, "candidates": picked}
        sheet(picked, os.path.join(out, f"scene{i + 1:02d}.jpg"), f"Scene {i + 1} [{spec['category']} -> {cat['pixabay']}]: " + " / ".join(q))
        print(f"Scene {i + 1}: {len(picked)} candidates for {q}")
    C.write_json(os.path.join(out, "candidates.json"), result)
    return 0 if result else 5


def fetch(script_path, out):
    script = C.read_json(script_path)
    os.makedirs(out, exist_ok=True)
    got = {}
    for i, sc in enumerate(script["scenes"]):
        fid = (sc.get("footage") or {}).get("id")
        if not fid:
            continue
        data = cached(f"id:{fid}", {"id": fid}) or {}
        hits = data.get("hits") or []
        c = info(hits[0]) if hits else None
        path = os.path.join(out, f"footage{i:02d}.mp4")
        if not c or not c["url"] or not download(c["url"], path):
            print(f"Scene {i + 1}: Pixabay clip {fid} could not be downloaded; the scene falls back to its animation.")
            continue
        got[str(i)] = {"file": path, "id": fid, "page": c["page"], "author": c["author"], "tags": c["tags"][:8],
                       "category": sc["footage"].get("category"), "reason": sc["footage"].get("reason"), "focus": sc["footage"].get("focus", 0.5),
                       "width": c["width"], "height": c["height"], "duration": c["duration"], "query": (sc["footage"].get("queries") or [""])[0]}
        print(f"Scene {i + 1}: Pixabay {fid} ({c['width']}x{c['height']}, {c['duration']}s) downloaded")
    C.write_json(os.path.join(out, "footage.json"), got)
    return 0


USED = os.path.join(C.VIDEOS, "footage-used.json")


def score(c, query):
    """Higher is better: portrait clips crop cleanly to 9:16; landscape is fine (centre crop); popular clips look better."""
    w, h = c.get("width") or 1, c.get("height") or 1
    s = 3.0 if h > w else 0.0
    s += min(2.0, (c.get("downloads") or 0) / 20000)
    s += 1.0 if (c.get("duration") or 0) >= 6 else 0.0
    words = set(query.lower().split())
    s += 0.5 * len(words & set(" ".join(c["tags"]).split()))
    return s


def auto(script_path, out):
    """Choose up to two clips per scene automatically: on topic (approved categories, blocked tags), never one used before."""
    script = C.read_json(script_path)
    os.makedirs(out, exist_ok=True)
    used = set(C.read_json(USED, []) or [])
    got, taken = {}, set()
    for i, sc in enumerate(script["scenes"]):
        spec = sc.get("footage") or {}
        q = [x for x in (spec.get("queries") or []) if str(x).strip()][:3]
        if not q:
            continue
        cat = CATEGORIES.get(spec.get("category") or "")
        cands = []
        for query in q:
            params = {"q": query[:100], "per_page": 20, "safesearch": "true", "video_type": "film"}
            if cat:
                params["category"] = cat["pixabay"]
            data = cached(f"q:{params.get('category', '')}:{query.lower()}", params) or {}
            for h in data.get("hits") or []:
                c = info(h)
                if not c["url"] or (c["duration"] or 0) < 4 or blocked(c["tags"]) or c["id"] in used or c["id"] in taken:
                    continue
                c["query"], c["score"] = query, score(c, query)
                cands.append(c)
        cands.sort(key=lambda c: -c["score"])
        picks = []
        for c in cands:
            if c["id"] in taken or any(p["id"] == c["id"] for p in picks):
                continue
            path = os.path.join(out, f"clip{i:02d}_{len(picks)}.mp4")
            if download(c["url"], path):
                picks.append({"file": path, "id": c["id"], "page": c["page"], "author": c["author"], "tags": c["tags"][:8],
                              "width": c["width"], "height": c["height"], "duration": c["duration"], "query": c["query"]})
                taken.add(c["id"])
            if len(picks) == 2:
                break
        if picks:
            got[str(i)] = picks
            print(f"Scene {i + 1}: " + ", ".join(f"Pixabay {p['id']} ({p['width']}x{p['height']}, '{p['query']}')" for p in picks))
        else:
            print(f"Scene {i + 1}: no suitable clip for {q}; the scene keeps its animation.")
    C.write_json(os.path.join(out, "footage.json"), got)
    return 0


def remember(footage_json):
    """After a video is delivered: never reuse its clips in later videos."""
    got = C.read_json(footage_json, {}) or {}
    used = C.read_json(USED, []) or []
    used += [p["id"] for v in got.values() for p in (v if isinstance(v, list) else [v]) if p["id"] not in used]
    C.write_json(USED, used[-3000:])


def report(script):
    """Footage Selection Report (markdown): every scene, its category, keywords, chosen clip and reason, or why it stays animated."""
    rows = [f"# Footage Selection Report: {script.get('video_title', script['slug'])}", "",
            "| Scene | Narration | Visual concept | Category (Pixabay) | Search keywords | Selected footage | Reason |",
            "|---|---|---|---|---|---|---|"]
    for i, sc in enumerate(script["scenes"], 1):
        f = sc.get("footage") or {}
        cat = f.get("category") or "-"
        pcat = (CATEGORIES.get(cat) or {}).get("pixabay", "-")
        sel = f"[Pixabay #{f['id']}]({f.get('page') or ''})" if f.get("id") else "ADS BOX animation (" + (sc.get("visual") or {}).get("type", "") + ")"
        why = f.get("reason") or f.get("fallback") or "Explained best by the animated template."
        rows.append(f"| {i} | {' '.join(sc['lines'])} | {f.get('concept') or (sc.get('visual') or {}).get('type', '')} | {cat} ({pcat}) | "
                    f"{', '.join(f.get('queries') or []) or '-'} | {sel} | {why} |")
    return "\n".join(rows) + "\n"


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "check":
        data = get({"q": "online shopping", "per_page": 5})
        n = len((data or {}).get("hits") or [])
        print(f"Pixabay OK: {n} clips for a test search." if n else "Pixabay answered with no clips.")
        return 0 if n else 5
    if cmd == "remember":
        remember(sys.argv[2])
        return 0
    if cmd == "auto":
        return auto(sys.argv[2], sys.argv[3])
    if cmd == "search":
        return search(sys.argv[2], sys.argv[3])
    if cmd == "report":
        print(report(C.read_json(sys.argv[2])))
        return 0
    if cmd == "fetch":
        return fetch(sys.argv[2], sys.argv[3])
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main())
