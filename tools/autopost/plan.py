#!/usr/bin/env python3
"""Decide whether a knowledge article is due now and write the brief for the writer.

  python3 tools/autopost/plan.py --out brief.json            # use the current time in Cambodia
  python3 tools/autopost/plan.py --now 2026-10-25T06:55 ...  # pretend it is this time (tests)
  python3 tools/autopost/plan.py --slot evening ...          # force a slot (manual run / tests)

Exit codes: 0 = brief written, 3 = nothing to do (paused, not due, already published), 1 = error.
"""
import argparse, datetime, json, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C

RULES = [
    "Write in natural, professional Khmer that a Cambodian shop owner reads easily on a phone. Short paragraphs (1-3 sentences). Use everyday words; English only for common platform terms (Facebook, Boost Post, Live, TikTok, Messenger, Ads Manager).",
    "Length: about 300-600 Khmer words (roughly {min_k}-{max_k} Khmer characters in the body).",
    "Structure: a hook in the first paragraph; a clear problem or opportunity; 3-6 practical steps or tips under '## ' headings (or a numbered list); one concrete example for a Cambodian online seller; a short natural call to action at the end.",
    "Educate first. Mention ADS BOX only in the closing call to action, unless the category is the ADS BOX System. Link the call to action to /#services, /#adsbox-system or https://t.me/vannakdm.",
    "You may add one internal link to a related earlier article from 'related_articles' using /knowledge/<slug>/. No external links other than https://t.me/vannakdm and https://adsbox.biz/.",
    "State only facts about ADS BOX that appear in 'facts'. No other prices, discounts, packages, client counts, statistics or features. If unsure, leave ADS BOX out.",
    "Examples must be clearly illustrative (\"ឧទាហរណ៍\" / a sample shop) with no real business or person names, and no claims that ADS BOX achieved a result for anyone.",
    "Never promise or guarantee orders, sales or results. Never give advice that breaks Facebook or TikTok rules (fake accounts, fake likes or comments, buying accounts).",
    "Do not repeat a title, angle or main advice from 'recent_titles'. Choose a clearly different angle; the suggested angle is a starting point.",
    "No keyword stuffing: the primary keyword appears naturally in the title, the first paragraph and at most 2-3 more times.",
]

SCHEMA = {
    "title": "Khmer headline, 20-90 characters, attractive and specific (no clickbait, no ALL CAPS)",
    "slug": "lowercase English words joined by '-', 3-60 characters, describing the topic, e.g. reply-faster-on-messenger",
    "summary": "1-2 Khmer sentences (40-220 characters) shown on cards",
    "seo_title": "Khmer search title, at most 60 characters, includes the primary keyword (site name is added automatically)",
    "seo_description": "Khmer meta description, 70-160 characters, says what the reader will learn",
    "primary_keyword": "the main search phrase in Khmer or Khmer+English, e.g. Boost Post សម្រាប់ផេកថ្មី",
    "keywords": "list of 3-8 related search phrases (strings)",
    "tag": "copy the 'tag' given in the brief",
    "category": "copy the 'category.id' given in the brief",
    "emoji": "exactly 3 emoji separated by spaces, for the auto-generated cover",
    "image_prompt": "English prompt for a featured image (photo or illustration) that fits the article; no text in the image, no real people's faces or brands",
    "image_alt": "Khmer description of that featured image, 10-150 characters",
    "body": "the article in Markdown: paragraphs, '## ' headings, '-' or '1.' lists, **bold**, [links](/#services). No '# ' heading (the title is shown separately)."
}


def read(p):
    with open(p, encoding="utf-8") as f: return f.read()


def pick_category(slot, cats, hist, arts):
    """Least recently used category for this slot; ties keep the configured order."""
    last = {}
    for r in hist["runs"]:
        if r.get("status") in ("published", "dry_run") and r.get("category"):
            last[r["category"]] = max(last.get(r["category"], ""), r.get("date", ""))
    for a in arts:
        if a["category"]: last[a["category"]] = max(last.get(a["category"], ""), a["date"])
    options = cats[slot]
    return sorted(options, key=lambda c: (last.get(c["id"], ""), options.index(c)))[0]


def pick_angle(cat, hist):
    used = [r.get("angle") for r in hist["runs"] if r.get("category") == cat["id"] and r.get("status") in ("published", "dry_run")]
    angles = cat.get("angles") or [""]
    return sorted(angles, key=lambda a: (used.count(a), angles.index(a)))[0]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--now"); ap.add_argument("--slot", choices=C.SLOTS); ap.add_argument("--date")
    ap.add_argument("--out", default="brief.json")
    a = ap.parse_args()
    s, h = C.settings(), C.history()
    now = C.now_local(a.now)
    day = datetime.date.fromisoformat(a.date) if a.date else now.date()

    if not s["enabled"]:
        print("Paused: auto-publishing is switched off in the admin panel (settings: enabled = false)."); return 3
    if a.slot:
        slot = a.slot
        if not s[slot]["enabled"]:
            print(f"The {slot} article is switched off in settings."); return 3
    else:
        slot = None
        for cand in C.SLOTS:
            if not s[cand]["enabled"]: continue
            t = C.slot_time(s, cand, day)
            if t - datetime.timedelta(minutes=s["early_minutes"]) <= now <= t + datetime.timedelta(minutes=s["late_minutes"]):
                slot = cand; break
        if not slot:
            times = ", ".join(f"{x} {s[x]['time']}" for x in C.SLOTS if s[x]["enabled"])
            print(f"Nothing due at {now:%Y-%m-%d %H:%M} Cambodia time (scheduled: {times}; window -{s['early_minutes']}/+{s['late_minutes']} min). "
                  "No catch-up publishing outside the window."); return 3
    date = day.isoformat()
    done = h and C.slot_record(h, date, slot, ("published",) if s["mode"] == "live" else ("published", "dry_run"))
    if done:
        print(f"Already done: the {slot} slot for {date} is recorded as {done['status']} ({done.get('slug')})."); return 3

    cats = C.load_json("categories.json")
    arts = C.existing_articles()
    cat = pick_category(slot, cats, h, arts)
    other = C.slot_record(h, date, "evening" if slot == "morning" else "morning", ("published", "dry_run"))
    recent = [{"title": x["title"], "date": x["date"], "category": x["category"]} for x in arts[:60]]
    recent += [{"title": r.get("title"), "date": r.get("date"), "category": r.get("category"), "dry_run": True}
               for r in h["runs"][-30:] if r.get("status") == "dry_run" and r.get("title")]
    related = [{"slug": x["slug"], "title": x["title"], "tag": x["tag"]} for x in arts if x["tag"] == cat["tag"]][:8] or \
              [{"slug": x["slug"], "title": x["title"], "tag": x["tag"]} for x in arts[:5]]
    brief = {
        "date": date, "slot": slot, "mode": s["mode"], "max_attempts": s["max_attempts"],
        "now": now.isoformat(timespec="minutes"),
        "category": {k: cat[k] for k in ("id", "kh", "en")}, "tag": cat["tag"], "suggested_angle": pick_angle(cat, h),
        "slot_focus": "Morning: practical education for sellers (sales, captions, customers, mistakes, trust)." if slot == "morning"
                      else "Evening: marketing and business improvement (ads, Live, budget, analytics, operations, team, ADS BOX).",
        "must_differ_from_today": other and {"title": other.get("title"), "category": other.get("category")},
        "recent_titles": recent,
        "related_articles": related,
        "facts": read(os.path.join(C.AUTO, "facts.md")),
        "rules": [r.format(min_k=s["min_khmer_chars"], max_k=s["max_khmer_chars"]) for r in RULES],
        "output_schema": SCHEMA,
    }
    with open(a.out, "w", encoding="utf-8") as f: json.dump(brief, f, ensure_ascii=False, indent=2)
    print(f"Due: {slot} article for {date} (mode {s['mode']}). Category: {cat['en']}. Brief written to {a.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
