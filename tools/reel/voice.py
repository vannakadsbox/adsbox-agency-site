#!/usr/bin/env python3
"""Khmer narration for the knowledge videos, with the timing of every word for exact subtitles.

  python3 tools/reel/voice.py VOICE OUT_DIR TEXTS.json     TEXTS.json = ["scene 1 text", "scene 2 text", ...]

Writes OUT_DIR/<i>.mp3 per scene and prints JSON: [{"len": seconds, "marks": [[start_s, end_s, "word"], ...], "kind": "word"|"sentence"|"none"}].
Uses Microsoft's Khmer neural voices through edge-tts (km-KH-PisethNeural man, km-KH-SreymomNeural woman).
TTS_RATE / TTS_PITCH change speed and pitch (e.g. +2%).
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


async def main():
    voice, out_dir = sys.argv[1], sys.argv[2]
    texts = json.load(open(sys.argv[3], encoding="utf-8"))
    os.makedirs(out_dir, exist_ok=True)
    res = []
    for i, t in enumerate(texts):
        f = os.path.join(out_dir, f"{i}.mp3")
        marks, kind = await speak(t, voice, f)
        res.append({"len": length(f), "marks": marks, "kind": kind})
    print(json.dumps(res, ensure_ascii=False))


if __name__ == "__main__":
    asyncio.run(main())
