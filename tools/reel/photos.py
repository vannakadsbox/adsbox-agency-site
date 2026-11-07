#!/usr/bin/env python3
"""Realistic AI photos for the "photo" video style (owner, 7 Nov 2026: style C, real-looking photos, less cartoon).

  python3 tools/reel/photos.py check                    can we generate an image? (writes /tmp/photo-check.jpg)
  python3 tools/reel/photos.py make SCRIPT.json OUT_DIR one 1080x1920 JPEG per scene that has a "photo" prompt
                                                        -> OUT_DIR/<scene index>.jpg and OUT_DIR/photos.json

Uses Cloudflare Workers AI (FLUX.1 schnell) on the account's free daily allowance. Secrets come from the
environment only and are never printed: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN (or CF_AI_TOKEN).
Every prompt gets a style suffix: documentary photo of a small Cambodian online shop, no text, no logos, no
recognisable real people. If generation fails for a scene, the renderer falls back to the animated visual.
"""
import base64, json, os, subprocess, sys, time, urllib.error, urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C  # noqa: E402

ACC = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "").strip()
TOKEN = (os.environ.get("CF_AI_TOKEN") or os.environ.get("CLOUDFLARE_API_TOKEN") or "").strip()
MODEL = "@cf/black-forest-labs/flux-1-schnell"
STYLE = (", realistic smartphone documentary photo, small online shop in Phnom Penh Cambodia, natural window light, "
         "warm tones, shallow depth of field, vertical composition, no text, no letters, no logos, no watermark, "
         "no recognisable real person, no signs, no price tags, no writing on any object, hands and products in focus")


def note(level, msg):
    if TOKEN:
        msg = msg.replace(TOKEN, "***")
    print(f"::{level}::{msg}")


STYLE3D = (", glossy 3D render, soft clay style, single object centred, isolated on a pure white background, soft shadow, "
           "bright colours with navy blue and yellow accents, no text, no letters, no logos")


def gen(prompt, out, seed=7, style=None):
    if not (ACC and TOKEN):
        raise RuntimeError("CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN are not set")
    body = json.dumps({"prompt": (prompt.strip().rstrip(".") + (style or STYLE))[:2000], "steps": 8}).encode()
    req = urllib.request.Request(f"https://api.cloudflare.com/client/v4/accounts/{ACC}/ai/run/{MODEL}", data=body,
                                 headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"})
    last = None
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                d = json.loads(r.read())
            img = (d.get("result") or {}).get("image")
            if not img:
                raise RuntimeError(json.dumps(d.get("errors") or d)[:300])
            raw = out + ".raw"
            with open(raw, "wb") as f:
                f.write(base64.b64decode(img))
            # FLUX returns a square image: scale up and crop to 1080x1920 (centre).
            vf = "scale=900:900:flags=lanczos" if style else "scale=1920:1920:flags=lanczos,crop=1080:1920,eq=saturation=1.05"
            subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", raw, "-vf", vf, "-q:v", "3", out], check=True)
            os.remove(raw)
            return out
        except urllib.error.HTTPError as e:
            last = f"HTTP {e.code}: {e.read()[:300].decode('utf-8', 'replace')}"
            if e.code in (401, 403):
                break
        except Exception as e:  # noqa: BLE001
            last = str(e)
        time.sleep(4 * (attempt + 1))
    raise RuntimeError(last)


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "check":
        note("notice", f"CF_AI_TOKEN set: {bool(os.environ.get('CF_AI_TOKEN', '').strip())}, account id set: {bool(ACC)} (length {len(ACC)})")
        try:
            req = urllib.request.Request("https://api.cloudflare.com/client/v4/user/tokens/verify", headers={"Authorization": f"Bearer {TOKEN}"})
            with urllib.request.urlopen(req, timeout=30) as r:
                note("notice", f"token verify: {json.loads(r.read()).get('result', {}).get('status')}")
        except urllib.error.HTTPError as e:
            note("warning", f"token verify HTTP {e.code}: {e.read()[:200].decode('utf-8', 'replace')}")
        try:
            gen("a woman's hands packing a folded t-shirt into a parcel next to a smartphone", "/tmp/photo-check.jpg")
            note("notice", "AI photos OK: generated /tmp/photo-check.jpg")
            return 0
        except Exception as e:  # noqa: BLE001
            note("error", f"AI photo generation failed: {e}")
            return 1
    if cmd == "make":
        script, outdir = C.read_json(sys.argv[2]), sys.argv[3]
        os.makedirs(outdir, exist_ok=True)
        made, failed, icons = {}, [], {}
        for i, sc in enumerate(script.get("scenes", [])):
            q = (sc.get("icon3d") or "").strip()
            if q:
                try:
                    icons[str(i)] = gen(q, os.path.join(outdir, f"icon{i}.jpg"), style=STYLE3D)
                except Exception as e:  # noqa: BLE001
                    note("warning", f"scene {i + 1}: 3D picture not made ({e})")
            p = (sc.get("photo") or "").strip()
            if not p:
                continue
            try:
                made[str(i)] = gen(p, os.path.join(outdir, f"{i}.jpg"), seed=11 + i)
            except Exception as e:  # noqa: BLE001
                failed.append(i)
                note("warning", f"scene {i + 1}: photo not made ({e}); the animated visual is used instead")
        with open(os.path.join(outdir, "photos.json"), "w") as f:
            json.dump(made, f)
        with open(os.path.join(outdir, "icons.json"), "w") as f:
            json.dump(icons, f)
        note("notice", f"AI photos: {len(made)} made, {len(failed)} failed; 3D pictures: {len(icons)}")
        return 0
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main())
