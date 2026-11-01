#!/usr/bin/env python3
"""Check a video script against the rules and save it, which starts the video workflow on GitHub.

  python3 tools/reel/check.py --brief /tmp/reel-brief.json --script /tmp/reel-script.json [--save] [--push]
  python3 tools/reel/check.py --note no-article|failed --reason "..." [--push]

Exit 0: valid (and saved / pushed).  Exit 2: problems, printed one per line; fix the script and run again.
Exit 3: this article already has a video script (duplicate); nothing saved.
Exit 1: git problem.
--note leaves a small note for the workflow so the owner gets a Telegram message (no new article, or the script failed).
"""
import argparse, json, os, re, subprocess, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C  # noqa: E402

ROLES = {"hook", "problem", "tip", "example", "summary", "cta"}
BAD_IN_LINES = re.compile(r"[#*→•_`<>\[\]{}|~]|https?://")
EMOJI = re.compile("[\U0001F300-\U0001FAFF☀-➿️]")
BRAND = re.compile(r"ADS\s*BOX|adsbox", re.I)
PERSONA = re.compile(r"ខ្ញុំឈ្មោះ|ខ្ញុំជាបុគ្គលិក|បុគ្គលិក ADS BOX|ខ្ញុំធ្វើការនៅ ADS BOX")


# The animated scene templates (tools/reel/scenes.js) and what each needs: field -> (kind, max characters or (min, max) items).
VISUALS = {
    "question": {"title": ("text", 24), "bubbles": ("texts", (2, 5), 26)},
    "chat": {"with?": ("text", 16), "messages": ("msgs", (2, 5), 34)},
    "leaving": {"post_title": ("text", 20), "confusing": ("text", 26), "caption": ("text", 28)},
    "dashboard": {"title": ("text", 26), "metrics": ("pairs", (3, 3), 10), "alert": ("text", 28), "next?": ("text", 24)},
    "compare": {"bad": ("text", 30), "good": ("text", 30)},
    "checklist": {"bad?": ("text", 22), "items": ("texts", (2, 4), 32), "mark?": ("text", 1)},
    "story": {"scene?": ("text", 8), "mood?": ("text", 8), "title?": ("text", 24), "bubbles?": ("texts", (0, 5), 16)},
    "flow": {"steps": ("steps", (2, 4), 30)},
    "orders": {"title?": ("text", 20), "rows": ("rows", (2, 4), 12)},
    "sticker": {"name": ("text", 16), "phone": ("text", 16), "address": ("text", 22), "items": ("text", 20)},
    "deadline": {"bad": ("text", 22), "good": ("text", 32), "result?": ("text", 24)},
    "delivery": {"rows": ("pairs", (2, 3), 22), "total?": ("pair", 26)},
    "caption": {"page?": ("text", 16), "lines": ("texts", (3, 6), 34), "highlight?": ("texts", (0, 4), 12), "stamp?": ("text", 12)},
    "takeaway": {"quote": ("text", 46)},
    "cta": {"services?": ("texts", (2, 4), 24), "url?": ("text", 24)},  # no services = "follow ADS BOX" card (education first)
}


def visual_problems(i, v):
    out = []
    if not isinstance(v, dict) or v.get("type") not in VISUALS:
        return [f"Scene {i}: visual.type must be one of {sorted(VISUALS)}"]
    for key, spec in VISUALS[v["type"]].items():
        opt = key.endswith("?")
        k = key.rstrip("?")
        val = v.get(k)
        if val in (None, "", []):
            if not opt:
                out.append(f"Scene {i}: visual {v['type']} needs '{k}'")
            continue
        kind = spec[0]
        if kind == "text" and (not isinstance(val, str) or len(val) > spec[1]):
            out.append(f"Scene {i}: visual.{k} must be text of max {spec[1]} characters")
        elif kind == "texts":
            lo, hi = spec[1]
            if not isinstance(val, list) or not (lo <= len(val) <= hi) or any(not isinstance(x, str) or len(x) > spec[2] for x in val):
                out.append(f"Scene {i}: visual.{k} must be {lo}-{hi} texts of max {spec[2]} characters")
        elif kind == "steps":
            lo, hi = spec[1]
            if not isinstance(val, list) or not (lo <= len(val) <= hi) or any(not isinstance(x, dict) or not x.get("text") or len(str(x["text"])) > spec[2] or len(str(x.get("label", ""))) > 16 for x in val):
                out.append(f"Scene {i}: visual.{k} must be {lo}-{hi} steps {{label? (max 16), text (max {spec[2]})}}")
        elif kind == "rows":
            lo, hi = spec[1]
            if not isinstance(val, list) or not (lo <= len(val) <= hi) or any(not isinstance(x, dict) or not x.get("name") or any(len(str(x.get(f, ""))) > spec[2] for f in ("name", "code", "qty")) for x in val):
                out.append(f"Scene {i}: visual.{k} must be {lo}-{hi} rows {{name, code, qty}} (max {spec[2]} characters each)")
        elif kind == "msgs":
            lo, hi = spec[1]
            if not isinstance(val, list) or not (lo <= len(val) <= hi) or any(
                    not isinstance(x, dict) or x.get("from") not in ("customer", "shop") or not x.get("text") or len(str(x["text"])) > spec[2] for x in val):
                out.append(f"Scene {i}: visual.{k} must be {lo}-{hi} messages {{from: customer|shop, text (max {spec[2]})}}")
        elif kind == "pairs":
            lo, hi = spec[1]
            if not isinstance(val, list) or not (lo <= len(val) <= hi) or any(
                    not isinstance(x, dict) or len(str(x.get("label", ""))) > spec[2] or not x.get("label") or len(str(x.get("value", ""))) > 9 for x in val):
                out.append(f"Scene {i}: visual.{k} must be {lo}-{hi} items {{label (max {spec[2]}), value (max 9)}}")
        elif kind == "pair" and (not isinstance(val, dict) or len(str(val.get("label", ""))) > spec[1] or len(str(val.get("value", ""))) > 9):
            out.append(f"Scene {i}: visual.{k} must be {{label (max {spec[1]}), value (max 9)}}")
    return out


def footage_problems(scenes):
    """Stock footage is removed (owner, 1 Nov 2026): a script may not ask for any clip."""
    return [f"Scene {i}: remove 'footage': ADS BOX videos use custom animation only (no stock footage)"
            for i, sc in enumerate(scenes, 1) if sc.get("footage")]


def problems(script, brief, s):
    out = []
    if not isinstance(script, dict):
        return ["The script must be one JSON object."]
    for k in ("slug", "video_title", "topic", "thumbnail_text", "description", "facebook_caption", "scenes"):
        if k not in script:
            out.append(f"Missing key: {k}")
    if out:
        return out
    if script["slug"] != brief["slug"]:
        out.append(f"slug must be {brief['slug']}")
    fb = str(script.get("facebook_caption") or "")
    if not (150 <= len(fb) <= 900) or "#" not in fb:
        out.append(f"facebook_caption is {len(fb)} characters; write a short caption (150-900 characters) of conversational Khmer ending with a few hashtags")
    for k, mx in (("video_title", 70), ("thumbnail_text", 40), ("description", 600), ("topic", 300), ("facebook_caption", 900)):
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
        out += visual_problems(i, sc.get("visual"))
    if scenes[0].get("role") != "hook":
        out.append("Scene 1 must be the hook")
    if (scenes[0].get("visual") or {}).get("type") not in ("question", "story", "chat"):
        out.append("Scene 1 (the hook) must use the 'question', 'story' or 'chat' visual")
    if (scenes[-1].get("visual") or {}).get("type") != "cta":
        out.append("The last scene must use the 'cta' visual")
    if BRAND.search(" ".join(scenes[0].get("lines") or [])):
        out.append("The hook must not mention ADS BOX")
    if scenes[-1].get("role") != "cta":
        out.append("The last scene must be the cta")
    out += footage_problems(scenes)
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
    ap.add_argument("--force", action="store_true", help="save even if the article already has a script (remake)")
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
    if a.push:  # duplicate guard: another run may have made this article's video meanwhile
        try:
            git("pull", "-q", "--rebase", "origin", "main")
        except subprocess.CalledProcessError:
            pass
        if os.path.exists(os.path.join(C.SCRIPTS, f"{script['slug']}.json")) and not a.force:
            print(f"Already done: {script['slug']} has a video script. Nothing saved.")
            return 3
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
