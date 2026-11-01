#!/usr/bin/env python3
"""Find and download real B-roll footage from Pexels for each scene of a video script.

  python3 tools/reel/broll.py SCRIPT.json OUT_DIR      writes OUT_DIR/broll.json and the clips

Pexels videos are free to use commercially (Pexels license, no attribution needed). Needs PEXELS_API_KEY.
Each scene uses its own search queries, most specific first; a clip is never used twice in one video,
and clips used in the last 15 videos are skipped when possible. A scene with no good match gets null,
and the renderer shows a branded animated background for it instead of unrelated footage.
"""
import json, os, sys, time, urllib.parse, urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C  # noqa: E402

API = "https://api.pexels.com/videos/search"
UA = "ADSBOX-video/1.0 (+https://adsbox.agency)"


def get(url, key, tries=3):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"Authorization": key, "User-Agent": UA})
            with urllib.request.urlopen(req, timeout=40) as r:
                return json.load(r)
        except Exception as ex:  # rate limit or network: wait and retry
            print(f"Pexels search failed ({ex}); retry {i + 1}", file=sys.stderr)
            time.sleep(3 * (i + 1))
    return None


def best_file(video):
    """The mp4 closest to 1080x1920 (portrait first), not bigger than needed."""
    files = [f for f in video.get("video_files", []) if f.get("file_type") == "video/mp4" and f.get("width") and f.get("height")]
    def score(f):
        portrait = f["height"] > f["width"]
        short = min(f["width"], f["height"])
        return (0 if portrait else 1, abs(short - 1080) + (2000 if short < 700 else 0))
    files.sort(key=score)
    return files[0] if files else None


def download(url, path, tries=3):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=120) as r, open(path, "wb") as f:
                while True:
                    b = r.read(1 << 20)
                    if not b:
                        break
                    f.write(b)
            if os.path.getsize(path) > 50_000:
                return True
        except Exception as ex:
            print(f"Download failed ({ex}); retry {i + 1}", file=sys.stderr)
            time.sleep(2)
    return False


def main():
    script = C.read_json(sys.argv[1])
    out = sys.argv[2]
    os.makedirs(out, exist_ok=True)
    key = os.environ.get("PEXELS_API_KEY", "").strip()
    result = []
    if not key:
        print("PEXELS_API_KEY is not set: every scene uses the branded background.")
        C.write_json(os.path.join(out, "broll.json"), {"scenes": [None] * len(script["scenes"]), "source": "none"})
        return 0
    recent = set()
    for v in sorted(C.log()["videos"], key=lambda v: v.get("rendered_at", ""), reverse=True)[:15]:
        recent |= set(v.get("broll_ids") or [])
    used = set()
    for i, sc in enumerate(script["scenes"]):
        need = max(3.0, sum(C.khmer_len(x) for x in sc["lines"]) / 12.0)
        pick = None
        for q in sc.get("broll") or []:
            for orient in ("portrait", None):
                params = {"query": q, "per_page": 15, "size": "medium"}
                if orient:
                    params["orientation"] = orient
                data = get(API + "?" + urllib.parse.urlencode(params), key)
                vids = (data or {}).get("videos") or []
                # Fresh clips long enough for the scene first; then clips used in recent videos.
                cands = [v for v in vids if v["id"] not in used]
                cands.sort(key=lambda v: (v["id"] in recent, v.get("duration", 0) < need))
                for v in cands:
                    f = best_file(v)
                    if f:
                        pick = (v, f, q)
                        break
                if pick:
                    break
            if pick:
                break
        if not pick:
            print(f"Scene {i + 1}: no footage found; branded background.")
            result.append(None)
            continue
        v, f, q = pick
        path = os.path.join(out, f"scene{i:02d}.mp4")
        if not download(f["link"], path):
            result.append(None)
            continue
        used.add(v["id"])
        result.append({"file": path, "id": v["id"], "query": q, "page": v.get("url"), "author": (v.get("user") or {}).get("name"),
                       "width": f["width"], "height": f["height"], "duration": v.get("duration")})
        print(f"Scene {i + 1}: '{q}' -> Pexels {v['id']} ({f['width']}x{f['height']}, {v.get('duration')}s)")
    C.write_json(os.path.join(out, "broll.json"), {"scenes": result, "source": "pexels"})
    return 0


if __name__ == "__main__":
    sys.exit(main())
