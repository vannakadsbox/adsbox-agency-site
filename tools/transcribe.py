#!/usr/bin/env python3
"""Khmer speech to text with timings, for syncing subtitles to the owner's own voice.

  python3 tools/transcribe.py VOICE.mp3 OUT.json    writes {"segments": [{start, end, text, words: [{start, end, word}]}]}
Needs faster-whisper (pip). Uses the large-v3 model, which knows Khmer.
"""
import json, subprocess, sys

import numpy as np
from faster_whisper import WhisperModel

model = WhisperModel("large-v3", device="cpu", compute_type="int8")
# Decode with ffmpeg ourselves (avoids PyAV version problems): 16 kHz mono float samples.
pcm = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", sys.argv[1], "-f", "s16le", "-ac", "1", "-ar", "16000", "-"], capture_output=True, check=True).stdout
audio = np.frombuffer(pcm, np.int16).astype(np.float32) / 32768.0
segs, info = model.transcribe(audio, language="km", word_timestamps=True, vad_filter=True, beam_size=5)
out = {"language": info.language, "duration": info.duration, "segments": []}
for s in segs:
    out["segments"].append({"start": round(s.start, 2), "end": round(s.end, 2), "text": s.text.strip(),
                            "words": [{"start": round(w.start, 2), "end": round(w.end, 2), "word": w.word} for w in (s.words or [])]})
    print(f"{s.start:6.2f}-{s.end:6.2f} {s.text.strip()}")
json.dump(out, open(sys.argv[2], "w"), ensure_ascii=False, indent=1)
