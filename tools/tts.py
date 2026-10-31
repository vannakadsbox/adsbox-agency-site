#!/usr/bin/env python3
"""Khmer voice for the article videos (used by tools/video.js), with Microsoft's free neural voices via edge-tts.

  python3 tools/tts.py VOICE OUT_DIR TEXT1 [TEXT2 ...]   writes OUT_DIR/0.mp3, 1.mp3, ... and prints their lengths as JSON

Voices: km-KH-SreymomNeural (woman, default) or km-KH-PisethNeural (man).
"""
import asyncio, json, os, subprocess, sys

import edge_tts


async def say(text, voice, out):
    for attempt in range(3):
        try:
            await edge_tts.Communicate(text, voice, rate=os.environ.get("TTS_RATE", "-4%"), pitch=os.environ.get("TTS_PITCH", "+0Hz")).save(out)
            if os.path.getsize(out) > 0:
                return
        except Exception as ex:
            err = ex
        await asyncio.sleep(2 * (attempt + 1))
    raise SystemExit(f"Voice failed: {err}")


def length(path):
    out = subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path], text=True)
    return float(out.strip())


async def main():
    voice, out_dir, texts = sys.argv[1], sys.argv[2], sys.argv[3:]
    os.makedirs(out_dir, exist_ok=True)
    lengths = []
    for i, t in enumerate(texts):
        f = os.path.join(out_dir, f"{i}.mp3")
        await say(t, voice, f)
        lengths.append(length(f))
    print(json.dumps(lengths))


if __name__ == "__main__":
    asyncio.run(main())
