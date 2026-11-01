#!/usr/bin/env python3
"""Find and download real B-roll footage for each scene of a video script.

  python3 tools/reel/broll.py SCRIPT.json OUT_DIR          writes OUT_DIR/broll.json and the clips
  python3 tools/reel/broll.py --check                      tests the Pixabay key and connection (exit 0 = OK)

Source: Pixabay Videos API (PIXABAY_API_KEY), the primary provider. Pexels (PEXELS_API_KEY) is used only if Pixabay
finds nothing for a scene and that key is set. Scenes with no footage are filled by the renderer (a neighbouring
scene's clip, or the branded ADS BOX animation), never with unrelated clips.

Pixabay rules followed here:
- Rate limit 100 requests per 60 seconds: requests are spaced out and the X-RateLimit headers are respected.
- Search results are cached for 24 hours (.cache/footage/, kept between runs by the workflow) and reused.
- Videos are downloaded to the runner (no hotlinking), only the few clips a video needs (one per spoken line),
  at a size that fits 1080x1920 (no 4K mass downloads).
- Pixabay Content License: free for commercial use, attribution not required; clips are edited into a new work,
  never redistributed on their own. The source pages are recorded in videos/log.json.
broll.json: {"scenes": [[clip, ...], ...]}. Exit 4 if no footage key is set, 5 if nothing was found at all.
"""
import hashlib, json, os, sys, time, urllib.error, urllib.parse, urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C  # noqa: E402

UA = "ADSBOX-video/1.0 (+https://adsbox.agency)"
CACHE = os.path.join(C.ROOT, ".cache", "footage")
CACHE_HOURS = 24
MAX_BYTES = 30_000_000  # skip very large originals; a 1080p rendition is plenty for a 9:16 crop
_last = [0.0]


def fetch_json(url, headers=None, tries=3):
    for i in range(tries):
        wait = 0.7 - (time.time() - _last[0])  # stay far below 100 requests / minute
        if wait > 0:
            time.sleep(wait)
        _last[0] = time.time()
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, **(headers or {})})
            with urllib.request.urlopen(req, timeout=40) as r:
                left = r.headers.get("X-RateLimit-Remaining")
                if left is not None and int(left) < 5:
                    time.sleep(int(r.headers.get("X-RateLimit-Reset") or 30))
                return json.load(r)
        except urllib.error.HTTPError as ex:
            if ex.code in (400, 401, 403):
                raise SystemExit(f"Footage API refused the request (HTTP {ex.code}): check the key.")
            print(f"Footage search failed (HTTP {ex.code}); retry {i + 1}", file=sys.stderr)
            time.sleep(10 if ex.code == 429 else 3 * (i + 1))
        except Exception as ex:
            print(f"Footage search failed ({type(ex).__name__}); retry {i + 1}", file=sys.stderr)
            time.sleep(3 * (i + 1))
    return None


def cached(name, url, headers=None):
    """Search results reused for 24 hours (Pixabay asks API users to cache requests)."""
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, hashlib.sha1(name.encode()).hexdigest() + ".json")
    if os.path.exists(path) and time.time() - os.path.getmtime(path) < CACHE_HOURS * 3600:
        return C.read_json(path)
    data = fetch_json(url, headers)
    if data is not None:
        C.write_json(path, data)
    return data


# --- Providers: each returns [{id, link, width, height, duration, page, author, source}] in relevance order -------
def pixabay(q, key):
    params = {"key": key, "q": q[:100], "per_page": 20, "safesearch": "true", "video_type": "film", "lang": "en"}
    data = cached("pixabay:" + q.lower(), "https://pixabay.com/api/videos/?" + urllib.parse.urlencode(params)) or {}
    out = []
    for h in data.get("hits") or []:
        if (h.get("duration") or 0) < 3:
            continue
        files = [f for f in (h.get("videos") or {}).values() if f and f.get("url") and f.get("width")]
        # Smallest rendition whose short side reaches 1080 (a sharp 9:16 crop) within the size cap; else the biggest under the cap.
        good = [f for f in files if min(f["width"], f["height"]) >= 1080 and (f.get("size") or 0) <= MAX_BYTES]
        small = [f for f in files if (f.get("size") or 0) <= MAX_BYTES]
        f = min(good, key=lambda f: f["width"] * f["height"]) if good else (max(small, key=lambda f: f["width"] * f["height"]) if small else None)
        if not f:
            continue
        out.append({"id": f"pixabay-{h['id']}", "link": f["url"], "width": f["width"], "height": f["height"], "duration": h.get("duration"),
                    "page": h.get("pageURL"), "author": h.get("user"), "source": "Pixabay", "portrait": f["height"] > f["width"]})
    out.sort(key=lambda v: not v["portrait"])  # stable: portrait clips first, otherwise Pixabay's relevance order
    return out


def pexels(q, key):
    out = []
    for orient in ("portrait", None):
        params = {"query": q, "per_page": 15, "size": "medium"}
        if orient:
            params["orientation"] = orient
        data = cached(f"pexels:{orient}:{q.lower()}", "https://api.pexels.com/videos/search?" + urllib.parse.urlencode(params),
                      {"Authorization": key}) or {}
        for v in data.get("videos") or []:
            files = [f for f in v.get("video_files", []) if f.get("file_type") == "video/mp4" and f.get("width")]
            files.sort(key=lambda f: (f["height"] <= f["width"], abs(min(f["width"], f["height"]) - 1080)))
            if files and (v.get("duration") or 0) >= 3:
                f = files[0]
                out.append({"id": f"pexels-{v['id']}", "link": f["link"], "width": f["width"], "height": f["height"], "duration": v.get("duration"),
                            "page": v.get("url"), "author": (v.get("user") or {}).get("name"), "source": "Pexels"})
        if len(out) >= 6:
            break
    return out


def download(url, path, tries=3):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=180) as r, open(path, "wb") as f:
                while True:
                    b = r.read(1 << 20)
                    if not b:
                        break
                    f.write(b)
            if os.path.getsize(path) > 50_000:
                return True
        except Exception as ex:
            print(f"Download failed ({type(ex).__name__}); retry {i + 1}", file=sys.stderr)
            time.sleep(3)
    return False


def check():
    key = os.environ.get("PIXABAY_API_KEY", "").strip()
    if not key:
        print("PIXABAY_API_KEY is not set.")
        return 4
    hits = pixabay("woman packing parcel", key)
    print(f"Pixabay OK: {len(hits)} usable clips for a test search." if hits else "Pixabay answered but returned no clips.")
    return 0 if hits else 5


def main():
    if sys.argv[1:] == ["--check"]:
        return check()
    script = C.read_json(sys.argv[1])
    out = sys.argv[2]
    os.makedirs(out, exist_ok=True)
    pxb, pxl = os.environ.get("PIXABAY_API_KEY", "").strip(), os.environ.get("PEXELS_API_KEY", "").strip()
    if not (pxb or pxl):
        print("No footage key: set the PIXABAY_API_KEY secret.", file=sys.stderr)
        return 4
    recent = set()
    for v in sorted(C.log()["videos"], key=lambda v: v.get("rendered_at", ""), reverse=True)[:15]:
        recent |= set(str(x) for x in (v.get("broll_ids") or []))
    used, result, downloads = set(), [], 0
    for i, sc in enumerate(script["scenes"]):
        want = max(2, len(sc["lines"]))  # one shot per spoken line, so the picture changes with the speech
        pools = []
        for q in sc.get("broll") or []:
            vids = pixabay(q, pxb) if pxb else []
            if not vids and pxl:
                vids = pexels(q, pxl)
            vids.sort(key=lambda v: v["id"] in recent)  # fresh clips first
            pools.append((q, vids))
        clips = []
        while len(clips) < want and any(p[1] for p in pools):
            for q, vids in pools:  # round-robin over the queries, most specific first
                while vids and vids[0]["id"] in used:
                    vids.pop(0)
                if not vids or len(clips) >= want:
                    continue
                v = vids.pop(0)
                path = os.path.join(out, f"scene{i:02d}_{len(clips)}.mp4")
                if not download(v["link"], path):
                    continue
                downloads += 1
                used.add(v["id"])
                clips.append({"file": path, **{k: v[k] for k in ("id", "width", "height", "duration", "page", "author", "source")}, "query": q})
                print(f"Scene {i + 1}: '{q}' -> {v['source']} {v['id']} ({v['width']}x{v['height']}, {v['duration']}s)")
        if not clips:
            print(f"Scene {i + 1}: no footage found (the renderer will use a neighbouring clip or the branded animation).")
        result.append(clips)
    C.write_json(os.path.join(out, "broll.json"), {"scenes": result, "source": "pixabay" if pxb else "pexels"})
    print(f"Footage: {downloads} clips downloaded for {sum(1 for r in result if r)}/{len(result)} scenes.")
    return 0 if any(result) else 5


if __name__ == "__main__":
    sys.exit(main())
