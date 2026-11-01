#!/usr/bin/env python3
"""Voice provider test (owner, 1 Nov 2026): the same test script read by each candidate voice, each sent to Telegram
as a separate, labelled audio file. Does NOT change the production voice (videos/settings.json) or any video.

  python3 tools/reel/voice_test.py make OUT_DIR      make the Microsoft Piseth samples
  python3 tools/reel/voice_test.py send OUT_DIR      send every OUT_DIR/*.mp3 listed in OUT_DIR/labels.json, in order
Extra samples from other providers can be placed in videos/voice-tests/samples/ with videos/voice-tests/samples/labels.json.
"""
import asyncio, json, os, re, shutil, subprocess, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C  # noqa: E402
import deliver  # noqa: E402

TEXT = open(os.path.join(C.VIDEOS, "voice-tests", "script.txt"), encoding="utf-8").read().strip()
VOICE = "km-KH-PisethNeural"
# name, rate, pitch, pause between sentences (seconds; 0 = one continuous request)
VARIANTS = [
    ("Production settings now (rate +2%)", "+2%", "+0Hz", 0),
    ("Consultant tuning: medium speed (-6%), slightly deeper (-3Hz), natural pauses between sentences", "-6%", "-3Hz", 0.45),
    ("Warm & slower: -10% speed, deeper (-5Hz), longer pauses", "-10%", "-5Hz", 0.6),
]


async def tts(text, rate, pitch, out):
    import edge_tts
    for i in range(4):
        try:
            await edge_tts.Communicate(text, VOICE, rate=rate, pitch=pitch).save(out)
            if os.path.getsize(out) > 2000:
                return
        except Exception as ex:
            print("retry", ex)
        await asyncio.sleep(3 * (i + 1))
    raise SystemExit("edge-tts failed")


def ff(*a):
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *a], check=True)


async def make(out):
    os.makedirs(out, exist_ok=True)
    sentences = [s for s in re.split(r"(?<=[?។!])\s+", TEXT) if s.strip()]
    labels = []
    for n, (name, rate, pitch, pause) in enumerate(VARIANTS, 1):
        f = os.path.join(out, f"{n:02d}-azure-piseth.mp3")
        if not pause:
            raw = f + ".raw.mp3"
            await tts(TEXT, rate, pitch, raw)
        else:
            parts = []
            for i, s in enumerate(sentences):
                p = os.path.join(out, f"p{n}_{i}.mp3")
                await tts(s, rate, pitch, p)
                parts.append(p)
            sil = os.path.join(out, "sil.wav")
            ff("-f", "lavfi", "-i", f"anullsrc=r=24000:cl=mono", "-t", str(pause), sil)
            lst = os.path.join(out, f"list{n}.txt")
            with open(lst, "w") as L:
                for i, p in enumerate(parts):
                    L.write(f"file '{os.path.abspath(p)}'\n")
                    if i < len(parts) - 1:
                        L.write(f"file '{os.path.abspath(sil)}'\n")
            raw = f + ".raw.wav"
            ff("-f", "concat", "-safe", "0", "-i", lst, "-ar", "24000", "-ac", "1", raw)
        ff("-i", raw, "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", "44100", "-b:a", "192k", f)
        labels.append({"file": os.path.basename(f), "provider": "Microsoft Azure Neural TTS", "voice": VOICE, "variant": name})
    extra = os.path.join(C.VIDEOS, "voice-tests", "samples")
    for x in C.read_json(os.path.join(extra, "labels.json"), []) or []:
        dst = os.path.join(out, x["file"])
        if x.get("url"):  # a sample made on the provider's own website: download it, then the same loudness as the others
            raw = dst + ".src"
            subprocess.run(["curl", "-fsSL", "--retry", "6", "--retry-all-errors", "--retry-delay", "4", "-o", raw, x["url"]], check=True)
            ff("-i", raw, "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", "44100", "-b:a", "192k", dst)
        else:
            shutil.copy(os.path.join(extra, x["file"]), dst)
        labels.append(x)
    C.write_json(os.path.join(out, "labels.json"), labels)
    print(json.dumps(labels, ensure_ascii=False, indent=1))


def send(out):
    labels = C.read_json(os.path.join(out, "labels.json"), [])
    ids = []
    for n, x in enumerate(labels, 1):
        secs = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0",
                                              os.path.join(out, x["file"])], text=True).strip())
        cap = (f"🎙 <b>Voice sample {n}/{len(labels)}</b> · {secs:.1f}s\n"
               f"🏢 Provider: {deliver.e(x['provider'])}\n🗣 Voice: {deliver.e(x['voice'])}\n⚙️ {deliver.e(x['variant'])}")
        r = deliver.tg("sendAudio", {"caption": cap, "parse_mode": "HTML", "title": f"ADS BOX voice test {n} · {x['voice']}",
                                     "performer": x["provider"]}, {"audio": (os.path.join(out, x["file"]), x["file"])})
        if not r.get("ok"):
            raise SystemExit(f"Telegram refused sample {n}: {r.get('description')}")
        ids.append(r["result"]["message_id"])
        print(f"Sent sample {n}: message {r['result']['message_id']}")
    C.write_json(os.path.join(out, "sent.json"), {"message_ids": ids, "count": len(ids)})


if __name__ == "__main__":
    cmd, out = sys.argv[1], sys.argv[2]
    asyncio.run(make(out)) if cmd == "make" else send(out)
