#!/usr/bin/env python3
"""Khmer voice for the article videos (used by tools/video.js), with Microsoft's free neural voices via edge-tts.

  python3 tools/tts.py VOICE OUT_DIR TEXT1 [TEXT2 ...]   writes OUT_DIR/0.mp3, 1.mp3, ... and prints their lengths as JSON

Voices: km-KH-SreymomNeural (woman, default) or km-KH-PisethNeural (man).
If ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID are set (the owner's cloned voice on ElevenLabs), that voice is used instead.
ELEVENLABS_MODEL picks the model (default eleven_v3). If ElevenLabs fails, the free voice above is used.
"""
import asyncio, json, os, subprocess, sys, urllib.request

import edge_tts


def eleven(text, out):
    key, voice = os.environ.get("ELEVENLABS_API_KEY"), os.environ.get("ELEVENLABS_VOICE_ID")
    if not (key and voice):
        return False
    body = json.dumps({"text": text, "model_id": os.environ.get("ELEVENLABS_MODEL", "eleven_v3")}).encode()
    req = urllib.request.Request(f"https://api.elevenlabs.io/v1/text-to-speech/{voice}?output_format=mp3_44100_128", data=body,
                                 headers={"xi-api-key": key, "Content-Type": "application/json", "Accept": "audio/mpeg"})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=120) as r, open(out, "wb") as f:
                f.write(r.read())
            if os.path.getsize(out) > 0:
                return True
        except Exception as ex:
            print(f"ElevenLabs attempt {attempt + 1} failed: {ex}", file=sys.stderr)
    print("ElevenLabs failed; using the free voice.", file=sys.stderr)
    return False


async def say(text, voice, out):
    if eleven(text, out):
        return
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
