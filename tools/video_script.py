#!/usr/bin/env python3
"""Turn one knowledge article into the slide script for its short video (used by tools/video.js).

  python3 tools/video_script.py content/articles/<slug>.md   prints the script as JSON
"""
import json, os, re, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import content

MAX_POINTS = 5


def plain(s):
    # Drop Markdown marks and links so only the words are left.
    s = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", s)
    s = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", s)
    s = re.sub(r"[*_`>#]", "", s)
    return re.sub(r"\s+", " ", s).strip()


def first_sentence(text, limit=120):
    text = plain(text)
    m = re.match(r"(.+?[។?!])(\s|$)", text)
    s = m.group(1) if m else text
    if len(s) > limit:
        s = s[:limit].rsplit(" ", 1)[0] + "…"
    return s


def script(path):
    fm, body = content.read_front_matter(path)
    points = []
    blocks = [b.strip() for b in re.split(r"\n\s*\n", body) if b.strip()]
    for i, b in enumerate(blocks):
        h = re.match(r"^##\s+(.*)$", b)
        if not h:
            continue
        head = plain(re.sub(r"^[០-៩0-9]+[.)។]\s*", "", h.group(1)))
        nxt = next((x for x in blocks[i + 1:] if not x.startswith(("#", "-", "*", ">", "!"))), "")
        if nxt.startswith("##"):
            nxt = ""
        points.append({"head": head, "text": first_sentence(nxt) if nxt else ""})
    slug = os.path.basename(path)[:-3]
    return {
        "slug": slug,
        "title": plain(str(fm.get("title") or slug)),
        "summary": first_sentence(str(fm.get("summary") or ""), 140),
        "tag": plain(str(fm.get("tag") or "ចំណេះដឹង")),
        "emoji": content.emoji_list(fm.get("emoji")),
        "points": points[:MAX_POINTS],
        "url": "adsbox.agency/knowledge",
    }


if __name__ == "__main__":
    print(json.dumps(script(sys.argv[1]), ensure_ascii=False, indent=1))
