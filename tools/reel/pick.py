#!/usr/bin/env python3
"""Pick the next article for a video and write the brief the script writer follows.

  python3 tools/reel/pick.py --out /tmp/reel-brief.json [--slug SLUG] [--force]

Exit 0: brief written.  Exit 3: nothing to do (automation off, or no article without a video); the reason is printed.
--slug picks one article (it must not already have a video unless --force). --force also ignores the on/off switch.
"""
import argparse, json, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C  # noqa: E402

SCHEMA = {
    "slug": "the article slug, exactly as in the brief",
    "video_title": "Khmer title for the video, max 70 characters, curiosity or benefit, no clickbait",
    "topic": "one or two Khmer sentences: what the viewer learns",
    "thumbnail_text": "the big words on the thumbnail: Khmer, max 34 characters",
    "description": "Khmer post caption for Reels/TikTok, 2-4 short lines plus 3-6 hashtags, max 600 characters",
    "scenes": [{
        "role": "hook | problem | tip | example | summary | cta",
        "lines": ["the spoken words, split into on-screen subtitle lines of max 40 characters each, 1-3 lines per scene"],
        "keyword": "optional: 2-6 words shown big on screen, max 28 characters (the scene's key point)",
        "label": "optional: small tag above the keyword, e.g. គន្លឹះទី ១ (max 16 characters)",
        "broll": ["2-3 English Pexels search queries for real footage that matches exactly what this scene says, most specific first"],
    }],
}

RULES = [
    "Write how a friendly, experienced Cambodian online-business consultant talks to a seller face to face: natural spoken Khmer, short sentences, never a formal speech and never reading the article.",
    "Talk to the viewer as បង / បងៗ. Use everyday words sellers use (Page, Order, Live, Boost, Inbox, Caption are fine in English letters).",
    "Scene 1 is the hook: one or two short lines that make a seller stop scrolling within 3 seconds (a common pain, a surprising mistake, or a question). Do not start with greetings or the brand.",
    "Then the problem sellers feel every day, then the practical tips with a concrete example each, then a one-line recap.",
    "Pick the 3-5 most useful points of the article; reword them as advice. Never copy article sentences word for word, and do not cover every heading.",
    "Every tip must be something the viewer can do today.",
    "The last scene (role cta) is short and natural, for example inviting them to learn more about ADS BOX at adsbox.agency. Educational first: scenes that mention ADS BOX must stay within the brand share limit.",
    "State only facts about ADS BOX found in 'facts'. No other prices, numbers, results, client names or testimonials. Never pretend the narrator is an ADS BOX employee or a real person; do not give the narrator a name.",
    "Example amounts must be clearly hypothetical, like the article's own examples.",
    "The 'lines' of a scene are exactly what the voice says, in order, split for subtitles at natural pauses (after a phrase or at ។ ? !). Max 40 characters per line. Use Khmer digits or Arabic digits consistently.",
    "No emoji, no hashtags and no symbols like →, *, # inside 'lines'. Hashtags go only in 'description'.",
    "B-roll queries are concrete and visual, in English: who, doing what, with what (e.g. 'woman packing clothing orders into boxes', 'hands typing message on smartphone', 'seller live streaming clothes with phone on tripod'). Prefer Asian people and small-shop settings. Never query brands, logos or text.",
    "Make it different from the recent videos listed in 'recent_videos' (different hook style and opening words).",
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--slug")
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args()
    s = C.settings()
    if not s["enabled"] and not (a.force or a.slug):
        print("Video automation is off (videos/settings.json enabled=false).")
        return 3
    arts = C.articles()
    used = C.used_slugs()
    if a.slug:
        pick = next((x for x in arts if x["slug"] == a.slug), None)
        if not pick:
            print(f"No published article with slug {a.slug}.")
            return 3
        if pick["slug"] in used and not a.force:
            print(f"{a.slug} already has a video. Use --force to make another.")
            return 3
    else:
        pick = next((x for x in arts if x["slug"] not in used), None)
        if not pick:
            print("No new article: every published article already has a video.")
            return 3
    recent = [{"video_title": v.get("video_title", ""), "hook": v.get("hook", "")}
              for v in sorted(C.log()["videos"], key=lambda v: v.get("scripted_at", ""), reverse=True)[:6]]
    brief = {
        "slug": pick["slug"],
        "article": {"title": pick["title"], "summary": pick["summary"], "url": pick["url"], "tag": pick["tag"],
                    "date": pick["date"], "markdown": pick["body"]},
        "facts": open(C.FACTS, encoding="utf-8").read(),
        "limits": {"scenes": [s["min_scenes"], s["max_scenes"]], "khmer_chars_spoken": [s["min_chars"], s["max_chars"]],
                   "target_seconds": "45-90", "max_brand_share": s["max_brand_share"], "max_line_chars": 40},
        "rules": RULES,
        "recent_videos": recent,
        "output_schema": SCHEMA,
        "example_style": "បងៗដែលកំពុងលក់ Online ប្រហែលជាធ្លាប់ជួបបញ្ហានេះហើយមែនទេ? មានអ្នកសួរច្រើន តែ Order មិនសូវចេញ។ (style only: never reuse these words)",
    }
    C.write_json(a.out, brief)
    print(f"Brief for {pick['slug']}: {pick['title']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
