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
        "visual": {"type": "the animated picture for this scene (see 'visuals'), with its fields filled from what the scene says"},
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
    "The 'lines' of a scene are exactly what the voice says, in order, split for subtitles at natural pauses (after a phrase or at ។ ? !). Max 40 characters per line. Write prices with Arabic digits after $ (e.g. $15, $1.50); other numbers may use Khmer digits.",
    "No emoji, no hashtags and no symbols like →, *, # inside 'lines'. Hashtags go only in 'description'.",
    "The video is branded motion graphics, no footage. Give every scene a 'visual' from 'visuals' that SHOWS what the narration says: the hook uses 'question', the last scene 'cta'; pick before/after ('compare'), steps ('checklist'), prices and totals ('delivery' receipt or 'caption' post mock-up), deadlines ('deadline'), problems ('leaving' or 'dashboard'), the lesson ('takeaway'). Vary the types; avoid the same type twice in a row.",
    "Visual texts are short Khmer phrases taken from the narration (prices, conditions, examples); never new facts. Elements appear as each subtitle line is spoken, so order the lines to match (e.g. compare: the bad version is said before the good one).",
    "Make it different from the recent videos listed in 'recent_videos' (different hook style and opening words).",
]


def slot_of(a):
    """'morning' or 'evening' for an article, from its publish time (Phnom Penh)."""
    t = a["generated_at"]
    return "morning" if t and t[11:13] < "12" else "evening"


def no_article(s, fresh, used):
    """Nothing new to make. At the report hours, tell the owner on Telegram if this slot has no article at all."""
    now = C.now()
    slot = "morning" if now.hour < 12 else "evening"
    today = [a for a in fresh if a["generated_at"][:10] == now.strftime("%Y-%m-%d") and slot_of(a) == slot]
    if today:
        print(f"Already done: the {slot} article ({today[0]['slug']}) has its video.")
        return 3
    if now.hour not in s.get("report_hours", [8, 18]):
        print(f"No new {slot} article yet; will check again.")
        return 3
    import check  # the note is pushed so the video workflow sends it to Telegram
    note = os.path.join(C.REQUESTS, f"{now.strftime('%Y%m%d')}-{slot}-no-article.json")
    if os.path.exists(note):
        print("No new article (already reported).")
        return 3
    C.write_json(note, {"type": "no-article", "reason": f"No new {slot} article was published today, so no video was made.", "at": C.iso()})
    ok = check.push([note], f"Video: no new {slot} article")
    print(f"No new {slot} article: reported to Telegram." if ok else "No new article; the report could not be pushed.")
    return 3


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
        # Only articles published since daily videos were switched on (older ones are never picked automatically),
        # newest first, each used once.
        since = str(s.get("since") or "")
        fresh = [x for x in arts if (x["generated_at"] or x["date"]) >= since]
        pick = next((x for x in fresh if x["slug"] not in used), None)
        if not pick:
            return no_article(s, fresh, used)
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
        "visuals": {
            "question": "hook: phone with customer messages popping in, then a big question. {title, bubbles:[2-5 short customer messages]}",
            "chat": "screen demo: Messenger chat between customer and shop, message by message. {with?, messages:[2-5 x {from: customer|shop, text}]}",
            "leaving": "problem: a confusing post and customers walking away. {post_title, confusing (the unclear text), caption}",
            "dashboard": "problem with ads money: Boost results card + red alert. {title, metrics:[3 x {label, value}] (clearly a sample), alert, next?}",
            "compare": "before/after: crossed-out bad card, then the good card with a check. {bad, good}",
            "checklist": "steps or rules appearing one by one. {bad? (crossed-out), items:[2-4]}",
            "deadline": "calendar and clock: vague vs exact deadline. {bad, good, result?}",
            "delivery": "scooter + receipt with fees and total. {rows:[2-3 x {label, value}], total?:{label, value}}",
            "caption": "Facebook post mock-up typed line by line, prices highlighted. {page?, lines:[3-6], highlight?:[words], stamp?}",
            "takeaway": "the key lesson as a big quote card. {quote}",
            "cta": "ADS BOX logo, service chips and website. {services:[2-4 from the facts, e.g. Boost Post]}",
        },
        "example_style": "បងៗដែលកំពុងលក់ Online ប្រហែលជាធ្លាប់ជួបបញ្ហានេះហើយមែនទេ? មានអ្នកសួរច្រើន តែ Order មិនសូវចេញ។ (style only: never reuse these words)",
    }
    C.write_json(a.out, brief)
    print(f"Brief for {pick['slug']}: {pick['title']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
