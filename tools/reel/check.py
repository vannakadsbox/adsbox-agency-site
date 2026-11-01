#!/usr/bin/env python3
"""Check a video script against the rules and save it, which starts the video workflow on GitHub.

  python3 tools/reel/check.py --brief /tmp/reel-brief.json --script /tmp/reel-script.json [--save] [--push]
  python3 tools/reel/check.py --note no-article|failed --reason "..." [--push]

Exit 0: valid (and saved / pushed).  Exit 2: problems, printed one per line; fix the script and run again.
Exit 1: git problem.
--note leaves a small note for the workflow so the owner gets a Telegram message (no new article, or the script failed).
"""
import argparse, json, os, re, subprocess, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C  # noqa: E402

ROLES = {"hook", "problem", "tip", "example", "summary", "cta"}
BAD_IN_LINES = re.compile(r"[#*→•_`<>\[\]{}|~]|https?://")
EMOJI = re.compile("[\U0001F300-\U0001FAFF☀-➿️]")
ASCII_QUERY = re.compile(r"^[A-Za-z0-9 ,'\-]{4,80}$")
BRAND = re.compile(r"ADS\s*BOX|adsbox", re.I)
PERSONA = re.compile(r"ខ្ញុំឈ្មោះ|ខ្ញុំជាបុគ្គលិក|បុគ្គលិក ADS BOX|ខ្ញុំធ្វើការនៅ ADS BOX")


def problems(script, brief, s):
    out = []
    if not isinstance(script, dict):
        return ["The script must be one JSON object."]
    for k in ("slug", "video_title", "topic", "thumbnail_text", "description", "scenes"):
        if k not in script:
            out.append(f"Missing key: {k}")
    if out:
        return out
    if script["slug"] != brief["slug"]:
        out.append(f"slug must be {brief['slug']}")
    for k, mx in (("video_title", 70), ("thumbnail_text", 34), ("description", 600), ("topic", 300)):
        v = str(script[k]).strip()
        if not v or not C.KHMER.search(v):
            out.append(f"{k} must be Khmer text")
        if len(v) > mx:
            out.append(f"{k} is {len(v)} characters; max {mx}")
    scenes = script["scenes"]
    if not isinstance(scenes, list) or not (s["min_scenes"] <= len(scenes) <= s["max_scenes"]):
        out.append(f"Use {s['min_scenes']}-{s['max_scenes']} scenes (now {len(scenes) if isinstance(scenes, list) else 0}).")
        return out
    total, brand = 0, 0
    for i, sc in enumerate(scenes, 1):
        role = sc.get("role")
        if role not in ROLES:
            out.append(f"Scene {i}: role must be one of {sorted(ROLES)}")
        lines = sc.get("lines")
        if not isinstance(lines, list) or not (1 <= len(lines) <= 3):
            out.append(f"Scene {i}: 1-3 lines")
            continue
        for ln in lines:
            ln = str(ln)
            if not ln.strip() or not C.KHMER.search(ln):
                out.append(f"Scene {i}: every line must be Khmer speech")
            if len(ln) > 40:
                out.append(f"Scene {i}: line is {len(ln)} characters (max 40): {ln}")
            if BAD_IN_LINES.search(ln) or EMOJI.search(ln):
                out.append(f"Scene {i}: no symbols, links or emoji in lines: {ln}")
            if PERSONA.search(ln):
                out.append(f"Scene {i}: the narrator must not claim to be a named person or an ADS BOX employee")
        n = sum(C.khmer_len(x) for x in lines)
        total += n
        if any(BRAND.search(str(x)) for x in lines):
            brand += n
        kw = str(sc.get("keyword") or "")
        if len(kw) > 28:
            out.append(f"Scene {i}: keyword max 28 characters")
        if len(str(sc.get("label") or "")) > 16:
            out.append(f"Scene {i}: label max 16 characters")
        q = sc.get("broll")
        if not isinstance(q, list) or not (1 <= len(q) <= 3) or not all(ASCII_QUERY.match(str(x)) for x in q):
            out.append(f"Scene {i}: broll must be 1-3 plain English search queries")
    if scenes[0].get("role") != "hook":
        out.append("Scene 1 must be the hook")
    if BRAND.search(" ".join(scenes[0].get("lines") or [])):
        out.append("The hook must not mention ADS BOX")
    if scenes[-1].get("role") != "cta":
        out.append("The last scene must be the cta")
    if not (s["min_chars"] <= total <= s["max_chars"]):
        out.append(f"Spoken Khmer is {total} characters; keep it {s['min_chars']}-{s['max_chars']} (about 45-90 seconds).")
    if total and brand / total > s["max_brand_share"]:
        out.append(f"Scenes mentioning ADS BOX are {brand / total:.0%} of the speech; max {s['max_brand_share']:.0%}.")
    if not any(BRAND.search(" ".join(sc.get("lines") or [])) for sc in scenes[-2:]):
        out.append("Introduce ADS BOX naturally in the cta scene.")
    return out


def git(*args):
    return subprocess.run(["git", "-C", C.ROOT, *args], check=True, capture_output=True, text=True).stdout


def push(paths, message):
    try:
        git("add", *paths)
        git("-c", "user.name=ADS BOX video bot", "-c", "user.email=noreply@anthropic.com", "commit", "-q", "-m", message)
        for attempt in range(3):
            try:
                git("pull", "-q", "--rebase", "origin", "main")
                git("push", "-q", "origin", "HEAD:main")
                return True
            except subprocess.CalledProcessError as e:
                print(f"push attempt {attempt + 1} failed: {e.stderr.strip()}", file=sys.stderr)
        return False
    except subprocess.CalledProcessError as e:
        print(f"git failed: {e.stderr.strip()}", file=sys.stderr)
        return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--brief")
    ap.add_argument("--script")
    ap.add_argument("--save", action="store_true")
    ap.add_argument("--push", action="store_true")
    ap.add_argument("--note", choices=["no-article", "failed"])
    ap.add_argument("--reason", default="")
    a = ap.parse_args()

    if a.note:
        stamp = C.now().strftime("%Y%m%d-%H%M%S")
        path = os.path.join(C.REQUESTS, f"{stamp}-{a.note}.json")
        C.write_json(path, {"type": a.note, "reason": a.reason[:500], "at": C.iso()})
        print(f"Note written: {os.path.relpath(path, C.ROOT)}")
        if a.push and not push([path], f"Video: {a.note}"):
            return 1
        return 0

    brief = C.read_json(a.brief)
    try:
        script = C.read_json(a.script)
    except json.JSONDecodeError as e:
        print(f"The script is not valid JSON: {e}")
        return 2
    s = C.settings()
    errs = problems(script, brief, s)
    if errs:
        print("\n".join(errs))
        return 2
    total = sum(C.khmer_len(x) for sc in script["scenes"] for x in sc["lines"])
    print(f"Script OK: {len(script['scenes'])} scenes, {total} Khmer characters spoken.")
    if not a.save:
        return 0
    script["article"] = {"title": brief["article"]["title"], "url": brief["article"]["url"]}
    script["written_at"] = C.iso()
    path = os.path.join(C.SCRIPTS, f"{script['slug']}.json")
    C.write_json(path, script)
    lg = C.log()
    r = C.record(lg, script["slug"])
    r.update({"article_title": brief["article"]["title"], "article_url": brief["article"]["url"],
              "video_title": script["video_title"], "hook": " ".join(script["scenes"][0]["lines"]),
              "status": "scripted", "scripted_at": script["written_at"], "error": ""})
    C.save_log(lg)
    print(f"Saved {os.path.relpath(path, C.ROOT)}")
    if a.push and not push([path, os.path.join(C.VIDEOS, "log.json")], f"Video script: {script['video_title']}"):
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
