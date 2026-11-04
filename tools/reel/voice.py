#!/usr/bin/env python3
"""Khmer narration for the knowledge videos, with the timing of every word for exact subtitles.

  python3 tools/reel/voice.py VOICE OUT_DIR TEXTS.json     TEXTS.json = ["scene 1 text", "scene 2 text", ...]

Writes OUT_DIR/<i>.mp3 per scene and prints JSON: [{"len": seconds, "marks": [[start_s, end_s, "word"], ...], "kind": "word"|"sentence"|"none"}].
Uses Microsoft's Khmer neural voices through edge-tts (km-KH-PisethNeural man, km-KH-SreymomNeural woman).
TTS_RATE / TTS_PITCH change speed and pitch (e.g. +2%).
VOICE "kiri:<Name>" (e.g. kiri:Sophon) uses Kiri TTS instead (KIRI_API_KEY; KIRI_INSTRUCTION = style, max 100 characters).
Kiri gives no word timing with speech, so each scene is transcribed by Kiri (word timestamps) and the spoken
timing is mapped onto the script text; if that fails the subtitles fall back to proportional timing.
"""
import asyncio, json, os, subprocess, sys

import edge_tts


async def speak(text, voice, out):
    rate, pitch = os.environ.get("TTS_RATE", "+0%"), os.environ.get("TTS_PITCH", "+0Hz")
    last = None
    for kind in ("WordBoundary", "SentenceBoundary", None):
        for attempt in range(3):
            try:
                kw = {"rate": rate, "pitch": pitch}
                if kind:
                    kw["boundary"] = kind
                try:
                    com = edge_tts.Communicate(text, voice, **kw)
                except TypeError:  # older edge-tts without the boundary option
                    kw.pop("boundary", None)
                    com = edge_tts.Communicate(text, voice, **kw)
                marks, audio = [], bytearray()
                async for ch in com.stream():
                    if ch["type"] == "audio":
                        audio += ch["data"]
                    elif ch["type"] in ("WordBoundary", "SentenceBoundary"):
                        s = ch["offset"] / 1e7
                        marks.append([round(s, 3), round(s + ch["duration"] / 1e7, 3), ch.get("text", "")])
                if not audio:
                    raise RuntimeError("no audio")
                with open(out, "wb") as f:
                    f.write(audio)
                return marks, (kind or "none").replace("Boundary", "").lower() if marks else "none"
            except Exception as ex:  # network hiccup: retry, then try the next boundary type
                last = ex
                await asyncio.sleep(2 * (attempt + 1))
    raise SystemExit(f"Voice failed: {last}")


def length(path):
    out = subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path], text=True)
    return float(out.strip())


KIRI = "https://api.kiritts.com/v1"


def kiri_speak(text, name, out):
    """One scene through the Kiri API -> MP3 at out, plus marks mapped from Kiri's own transcript of that audio."""
    key = os.environ.get("KIRI_API_KEY", "").strip()
    if not key:
        raise SystemExit("KIRI_API_KEY is not set.")
    body = {"model": "kiritts", "input": text, "voice": name, "response_format": "wav"}
    ins = os.environ.get("KIRI_INSTRUCTION", "").strip()
    if ins:
        body["instructions"] = ins[:100]
    wav = out + ".wav"
    detail = ""
    for attempt in range(6):
        code = subprocess.run(["curl", "-sS", "--max-time", "180", "-o", wav, "-w", "%{http_code}", KIRI + "/audio/speech",
                               "-H", "Authorization: Bearer " + key, "-H", "Content-Type: application/json",
                               "--data-binary", json.dumps(body)], capture_output=True, text=True).stdout.strip()
        if code == "200" and os.path.getsize(wav) > 4000:
            break
        try:
            detail = open(wav, encoding="utf-8", errors="replace").read()[:300].replace("\n", " ")
        except OSError:
            detail = ""
        print(f"Kiri speech attempt {attempt + 1}: HTTP {code} {detail}", file=sys.stderr)
        import time
        time.sleep(min(60, 8 * (attempt + 1)))
    else:
        # Shown as a GitHub annotation so the cause is visible without the log (no secrets in it).
        print(f"::error::Kiri speech failed (HTTP {code}) for: {text[:80]} | {detail}", file=sys.stderr)
        raise SystemExit(f"Kiri speech failed (HTTP {code}).")
    # Pace: 7% slower (pitch unchanged), the owner found some parts too fast.
    # Clarity and consistency: remove rumble, a little less boxiness, a little more presence, gentle compression,
    # and every scene at the same loudness so the voice never jumps between scenes.
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav, "-af",
                    "atempo=0.93,highpass=f=70,equalizer=f=280:t=q:w=1.2:g=-2,equalizer=f=3600:t=q:w=1.4:g=2.5,equalizer=f=9000:t=q:w=1:g=1,"
                    "acompressor=threshold=-21dB:ratio=2.5:attack=6:release=90:makeup=2,loudnorm=I=-16:TP=-1.5:LRA=7",
                    "-ar", "44100", "-ac", "1", "-b:a", "192k", out], check=True)
    os.remove(wav)
    marks, kind = [], "none"
    kiri_speak.match = None
    try:
        r = subprocess.run(["curl", "-sS", "--max-time", "180", KIRI + "/audio/transcriptions", "-H", "Authorization: Bearer " + key,
                            "-F", f"file=@{out}", "-F", "model=kiristt", "-F", "language=km-KH", "-F", "response_format=verbose_json",
                            "-F", "timestamp_granularities=word,segment", "-F", "prompt=" + text[:400]],
                           capture_output=True, text=True)
        data = json.loads(r.stdout or "{}")
        words = data.get("words") or [w for sg in data.get("segments") or [] for w in (sg.get("words") or [])]
        words = [(float(w["start"]), float(w["end"]), str(w.get("word") or w.get("text") or "").strip()) for w in words if "start" in w]
        words = [w for w in words if w[2]]
        import difflib, re as _re
        said = _re.sub(r"\s+", "", str(data.get("text") or "".join(w[2] for w in words)))
        want = _re.sub(r"\s+", "", text)
        kiri_speak.match = round(difflib.SequenceMatcher(None, said, want).ratio(), 3) if said else None
        if len(words) >= 2:
            total = sum(len(w[2]) for w in words)
            L, acc, pos = len(text), 0, 0
            for s, e, w in words:  # the transcript's spelling can differ; map by share of characters instead
                a = round(acc / total * L)
                acc += len(w)
                b = round(acc / total * L)
                piece = text[max(a, pos):b]
                if piece.strip():
                    marks.append([round(s, 3), round(e, 3), piece.strip()])
                pos = max(pos, b)
            kind = "transcript"
    except Exception as ex:  # timing is a nicety: never fail the voice for it
        print(f"Kiri transcript timing unavailable: {ex}", file=sys.stderr)
    return marks, kind


async def main():
    voice, out_dir = sys.argv[1], sys.argv[2]
    texts = json.load(open(sys.argv[3], encoding="utf-8"))
    os.makedirs(out_dir, exist_ok=True)
    res = []
    for i, t in enumerate(texts):
        f = os.path.join(out_dir, f"{i}.mp3")
        if voice.startswith("kiri:"):
            marks, kind = kiri_speak(t, voice.split(":", 1)[1], f)
            res.append({"len": length(f), "marks": marks, "kind": kind, "match": kiri_speak.match})
            continue
        else:
            marks, kind = await speak(t, voice, f)
        res.append({"len": length(f), "marks": marks, "kind": kind})
    print(json.dumps(res, ensure_ascii=False))


if __name__ == "__main__":
    asyncio.run(main())
