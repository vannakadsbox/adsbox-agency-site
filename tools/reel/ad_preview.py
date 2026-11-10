#!/usr/bin/env python3
"""Assets for an ad preview (animatic): one Kiri voice file per scene and one AI photo per seller scene.

  python3 tools/reel/ad_preview.py videos/ads/boost-live-ad.json OUT_DIR

Writes OUT_DIR/v<id>.mp3, OUT_DIR/p<id>.jpg and OUT_DIR/manifest.json (durations, speech match). The host image is
never stored in this public repo: the video is put together outside the workflow from these assets.
"""
import json, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import voice, photos  # noqa: E402

ad, out = json.load(open(sys.argv[1], encoding="utf-8")), sys.argv[2]
os.makedirs(out, exist_ok=True)
os.environ["KIRI_INSTRUCTION"] = ad.get("instruction", "")
os.environ["VOICE_FINISH"] = "sample_a"
man = {"scenes": []}
for sc in ad["scenes"]:
    best = None
    for take in range(3):
        f = os.path.join(out, f"v{sc['id']}_t{take}.mp3")
        voice.kiri_speak(sc["text"], ad["voice"], f)
        m = voice.kiri_speak.match or 0
        if best is None or m > best[1]:
            best = (f, m)
        if m >= 0.85:
            break
    os.replace(best[0], os.path.join(out, f"v{sc['id']}.mp3"))
    for t in range(3):
        p = os.path.join(out, f"v{sc['id']}_t{t}.mp3")
        if os.path.exists(p):
            os.remove(p)
    row = {"id": sc["id"], "seconds": round(voice.length(os.path.join(out, f"v{sc['id']}.mp3")), 2), "match": best[1]}
    if sc.get("photo"):
        try:
            photos.gen(sc["photo"].replace("SELLER", ad["seller"]), os.path.join(out, f"p{sc['id']}.jpg"))
            row["photo"] = True
        except Exception as e:  # noqa: BLE001
            print(f"::warning::scene {sc['id']}: photo not made ({e})")
            row["photo"] = False
    man["scenes"].append(row)
    print(f"::notice::scene {sc['id']}: {row}")
json.dump(man, open(os.path.join(out, "manifest.json"), "w"), indent=1)
