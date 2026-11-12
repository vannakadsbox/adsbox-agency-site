#!/usr/bin/env python3
"""Voice-over lines for a finished video (owner request, 12 Nov 2026): one MP3 per line in a spec file
(videos/voiceovers/<slug>.json). Mixing onto the video is done afterwards; this only makes the voice files.

  python3 tools/reel/voiceover.py SPEC.json OUT_DIR

A speaker whose voice is "FEMALE" gets a female Kiri voice from Kiri's voice list when one exists, otherwise
Microsoft's Khmer woman voice (km-KH-SreymomNeural). OUT_DIR also gets voices.txt (Kiri's voice list as returned)
and sample-<voice>.mp3 (the first narrator line in every female voice found), so the owner can choose another.
Needs KIRI_API_KEY in the environment; it is never printed.
"""
import asyncio, json, os, re, subprocess, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import voice  # noqa: E402

KEY = os.environ.get("KIRI_API_KEY", "").strip()


def get(path):
    r = subprocess.run(["curl", "-sS", "--max-time", "60", "-w", "\n%{http_code}", voice.KIRI + path,
                        "-H", "Authorization: Bearer " + KEY], capture_output=True, text=True)
    body, _, code = r.stdout.rpartition("\n")
    return code.strip(), body


def kiri_voices(out):
    found, log = [], []
    for path in ("/voices", "/audio/voices", "/models"):
        code, body = get(path)
        log.append(f"GET {path} -> HTTP {code}\n{body[:4000]}\n")
        if code == "200":
            try:
                data = json.loads(body)
            except ValueError:
                continue
            items = data.get("voices") or data.get("data") or [] if isinstance(data, dict) else data
            for v in items if isinstance(items, list) else []:
                if isinstance(v, dict):
                    name = v.get("name") or v.get("id") or v.get("voice_id")
                    gender = str(v.get("gender") or v.get("sex") or v.get("labels", {}).get("gender", "") if isinstance(v.get("labels"), dict) else v.get("gender") or "").lower()
                    found.append((str(name), gender))
    open(os.path.join(out, "voices.txt"), "w").write("\n".join(log))
    return found


def edge(text, out):
    tmp = out + ".raw.mp3"
    asyncio.run(voice.speak(text, "km-KH-SreymomNeural", tmp))
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", tmp, "-af", "atempo=0.95,loudnorm=I=-16:TP=-1.5:LRA=7",
                    "-ar", "44100", "-ac", "1", "-b:a", "192k", out], check=True)
    os.remove(tmp)


def say(text, name, instruction, out):
    if name == "edge:Sreymom":
        return edge(text, out)
    os.environ["KIRI_INSTRUCTION"] = instruction or ""
    voice.kiri_speak(text, name, out)


def main():
    spec, out = json.load(open(sys.argv[1], encoding="utf-8")), sys.argv[2]
    os.makedirs(out, exist_ok=True)
    os.environ["VOICE_FINISH"] = ""
    voices = kiri_voices(out)
    not_khmer = {"Meilin", "Hoa", "Xiaoyu", "Ava", "Linh", "Olivia", "Emma", "Sota"}  # Chinese, Vietnamese, English, Japanese
    female = [n for n, g in voices if (g.startswith("f") or g == "woman") and n not in not_khmer]
    print("Kiri voices:", voices, "| female:", female)
    first = next(l for l in spec["lines"] if spec["voices"][l["who"]]["voice"] == "FEMALE") if any(
        v["voice"] == "FEMALE" for v in spec["voices"].values()) else None
    if first:
        for n in female + ["edge:Sreymom"]:
            f = os.path.join(out, f"sample-{re.sub(r'[^A-Za-z0-9]+', '', n)}.mp3")
            try:
                voice.kiri_speak.match = None
                say(first["text"], n, spec["voices"][first["who"]].get("instruction"), f)
                print(f"SAMPLE {n}: {voice.length(f):.2f}s, transcript match {voice.kiri_speak.match}")
            except BaseException as ex:  # noqa: BLE001
                print(f"sample {n} failed: {ex}")
    pick = {}
    for who, v in spec["voices"].items():
        pick[who] = (os.environ.get("FEMALE_VOICE") or (female[0] if female else "edge:Sreymom")) if v["voice"] == "FEMALE" else v["voice"]
    print("Using:", pick)
    rows = []
    for l in spec["lines"]:
        f = os.path.join(out, l["id"] + ".mp3")
        say(l["text"], pick[l["who"]], l.get("instruction") or spec["voices"][l["who"]].get("instruction"), f)
        rows.append({"id": l["id"], "who": l["who"], "voice": pick[l["who"]], "seconds": round(voice.length(f), 2)})
        rows[-1]["match"] = getattr(voice.kiri_speak, "match", None)
        print(rows[-1])
    json.dump({"voices": pick, "lines": rows}, open(os.path.join(out, "lines.json"), "w"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
