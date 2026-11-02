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
KIRI_VOICES = ["Chanda", "Bora", "Arun", "Sophon", "Dara"]  # Kiri's male Khmer voices
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
    only_kiri = os.environ.get("VT_KIRI_ONLY") == "true"
    kiri_voices = [v.strip() for v in os.environ.get("VT_KIRI_VOICES", "").split(",") if v.strip()] or KIRI_VOICES
    instruction = os.environ.get("VT_INSTRUCTION", "").strip()
    title = os.environ.get("VT_LABEL", "").strip()
    for n, (name, rate, pitch, pause) in enumerate([] if only_kiri else VARIANTS, 1):
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
    # Kiri TTS through its API (key from the KIRI_API_KEY secret, never printed); same script, default settings.
    key = os.environ.get("KIRI_API_KEY", "").strip()
    if key:
        vids = {}
        try:  # voice ids, for the report
            vl = json.loads(subprocess.run(["curl", "-sS", "https://api.kiritts.com/v1/voices", "-H", "Authorization: Bearer " + key],
                                           capture_output=True, text=True).stdout or "{}")
            for x in (vl.get("data") or vl.get("voices") or (vl if isinstance(vl, list) else [])):
                vids[str(x.get("name"))] = x.get("id") or x.get("voice_id")
        except Exception:
            pass
        for i, v in enumerate(kiri_voices, len(labels) + 1):
            f = os.path.join(out, f"{i:02d}-kiri-{v.lower()}.mp3")
            raw = f + ".wav"
            req = {"model": "kiritts", "input": TEXT, "voice": v, "response_format": "wav", "speed": 1.0}
            if instruction:
                req["instructions"] = instruction[:100]
            body = json.dumps(req)
            code = subprocess.run(["curl", "-sS", "--max-time", "120", "-o", raw, "-w", "%{http_code}", "https://api.kiritts.com/v1/audio/speech",
                                   "-H", "Authorization: Bearer " + key, "-H", "Content-Type: application/json", "--data-binary", body],
                                  capture_output=True, text=True).stdout.strip()
            if code != "200":
                detail = open(raw, encoding="utf-8", errors="replace").read()[:200] if os.path.exists(raw) else ""
                print(f"::error::Kiri {v}: HTTP {code} {detail} | voices this key can use: {', '.join(sorted(vids))[:600]}")
                continue
            ff("-i", raw, "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", "44100", "-b:a", "192k", f)
            secs = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", raw], text=True))
            print(f"::notice::Kiri {v}: HTTP 200, voice id {vids.get(v, 'n/a')}, {secs:.2f}s, instruction "
                  + (f"sent ({len(instruction[:100])} chars) and accepted" if instruction else "none"))
            labels.append({"file": os.path.basename(f), "provider": "Kiri TTS (KiriTTS-1, API)", "voice": f"{v} (male, Khmer)",
                           "title": title,
                           "variant": ("Speed 1.0x · style instruction: " + instruction[:100]) if instruction
                           else "Default settings: speed 1.0x, no style instruction. Same script as every sample."})
    else:
        print("::warning::KIRI_API_KEY is not set: Kiri samples skipped")
    extra = os.path.join(C.VIDEOS, "voice-tests", "samples")
    for x in C.read_json(os.path.join(extra, "labels.json"), []) or []:
        dst = os.path.join(out, x["file"])
        if x.get("url"):  # a sample made on the provider's own website: download it, then the same loudness as the others
            raw = dst + ".src"
            code = ""
            for t in range(8):
                code = subprocess.run(["curl", "-sSL", "-A", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130 Safari/537.36",
                                       "-H", "Referer: https://www.kiritts.com/dashboard?locale=en", "-H", "Accept: */*", "-H", "Range: bytes=0-",
                                       "-H", "Sec-Fetch-Dest: audio", "-H", "Sec-Fetch-Mode: no-cors", "-H", "Sec-Fetch-Site: same-origin",
                                       "-H", "Accept-Language: en-US,en;q=0.9,km;q=0.8", "-o", raw, "-w", "%{http_code}", x["url"]],
                                      capture_output=True, text=True).stdout.strip()
                if code in ("200", "206") and os.path.getsize(raw) > 20000:
                    code = "200"
                    break
                print(f"{x['file']}: HTTP {code}, retrying")
                import time; time.sleep(10)
            if code != "200":
                print(f"::error::{x['file']}: provider answered HTTP {code}; sample skipped")
                continue
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
        head = f"🎙 <b>{deliver.e(x['title'])}</b>" if x.get("title") else f"🎙 <b>Voice sample {n}/{len(labels)}</b>"
        cap = (f"{head} · {secs:.1f}s\n"
               f"🏢 Provider: {deliver.e(x['provider'])}\n🗣 Voice: {deliver.e(x['voice'])}\n⚙️ {deliver.e(x['variant'])}")
        r = deliver.tg("sendAudio", {"caption": cap, "parse_mode": "HTML", "title": x.get("title") or f"ADS BOX voice test {n} · {x['voice']}",
                                     "performer": x["provider"]}, {"audio": (os.path.join(out, x["file"]), x["file"])})
        if not r.get("ok"):
            raise SystemExit(f"Telegram refused sample {n}: {r.get('description')}")
        ids.append(r["result"]["message_id"])
        print(f"Sent sample {n}: message {r['result']['message_id']}")
    C.write_json(os.path.join(out, "sent.json"), {"message_ids": ids, "count": len(ids)})


if __name__ == "__main__":
    cmd, out = sys.argv[1], sys.argv[2]
    try:
        asyncio.run(make(out)) if cmd == "make" else send(out)
    except BaseException as ex:  # shown as a GitHub annotation (no secrets in it)
        import traceback
        msg = traceback.format_exc().strip().splitlines()[-3:]
        print("::error::" + " | ".join(m.strip() for m in msg)[:900])
        raise
