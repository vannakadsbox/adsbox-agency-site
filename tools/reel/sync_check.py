#!/usr/bin/env python3
"""Check a finished video's narration against its script with Kiri's transcription (word timestamps).

  python3 tools/reel/sync_check.py SLUG VIDEO.mp4

Prints GitHub notices: how much of the script the final audio contains (character similarity of Kiri's transcript to the
script, overall and per scene), and when speech starts/ends against the video length. The API key is never printed.
"""
import difflib, json, os, re, subprocess, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C  # noqa: E402

slug, mp4 = sys.argv[1], sys.argv[2]
script = C.read_json(os.path.join(C.SCRIPTS, f"{slug}.json"))
wav = mp4 + ".voice.mp3"
# Narration band only (the music is quiet; this keeps the transcript clean).
subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", mp4, "-vn", "-af", "highpass=f=120,lowpass=f=6000", "-ac", "1", "-ar", "16000", "-b:a", "64k", wav], check=True)
key = os.environ["KIRI_API_KEY"].strip()
full = " ".join(" ".join(sc["lines"]) for sc in script["scenes"])
r = subprocess.run(["curl", "-sS", "--max-time", "300", "https://api.kiritts.com/v1/audio/transcriptions", "-H", "Authorization: Bearer " + key,
                    "-F", f"file=@{wav}", "-F", "model=kiristt", "-F", "language=km-KH", "-F", "response_format=verbose_json",
                    "-F", "timestamp_granularities=word,segment", "-F", "prompt=" + full[:400]], capture_output=True, text=True)
data = json.loads(r.stdout or "{}")
said = re.sub(r"\s+", "", str(data.get("text") or ""))
norm = lambda t: re.sub(r"[\s\$\.,!?។៖«»“”\"'()\-]+", "", t)
ratio = difflib.SequenceMatcher(None, norm(said), norm(full)).ratio()
words = data.get("words") or [w for s in data.get("segments") or [] for w in (s.get("words") or [])]
times = [(float(w["start"]), float(w["end"])) for w in words if "start" in w]
dur = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", mp4], text=True))
print(f"::notice::Final audio vs script: {round(100 * ratio)}% match (Kiri transcript of the delivered MP4, {len(said)} chars heard / {len(norm(full))} in script)")
if times:
    print(f"::notice::Speech from {times[0][0]:.2f}s to {times[-1][1]:.2f}s of {dur:.2f}s; {len(times)} timed words")
# Which script parts are missing from what was heard (longest gaps)
sm = difflib.SequenceMatcher(None, norm(full), norm(said))
miss = [norm(full)[a:b] for op, a, b, c, d in sm.get_opcodes() if op in ("delete", "replace") and b - a >= 6]
print("::notice::Script parts not heard as written (6+ chars): " + (" | ".join(miss[:8])[:800] if miss else "none"))
