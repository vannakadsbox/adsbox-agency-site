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
    "NEW TOPIC EVERY DAY (owner, 9 Nov 2026): the seller problem and the main advice must be clearly different from every article in 'last_7_days' (not the same subject in other words). E.g. if a recent article was about boost spend vs orders, messages vs orders or daily numbers, do not write about counting, measuring or reporting boost results again this week. Mention a shared event (like 11.11) in at most one article every few days, not every day.",
    "Do not repeat a title, angle or main advice from 'recent_titles'. Choose a clearly different angle; the suggested angle is a starting point.",
    "STYLE (owner, 5 Nov 2026): talk like an experienced consultant chatting with a seller, in plain everyday Khmer that is understood on first reading (no bookish or figurative phrases; «បងៗ» is welcome). Open with a situation the seller recognises, often as a question. Clothes are counted with «ឈុត», never «ដុំ».",
    "VARY THE FORMAT: most recent titles use '៥ គន្លឹះ…' or '៥ ជំហាន…'. Look at 'recent_titles' and pick a different shape when that pattern dominates: a myth vs truth, a before/after, a short story of a sample shop, a 'do this, not that', a checklist before an event, a question sellers often ask, or a common mistake. Numbers in titles are fine, just not every time.",
    "CONTENT PLAN (owner, 7 Nov 2026): write for the main reader first: a Cambodian online seller (often a woman of 25-35 selling clothes or cosmetics by Facebook Live or posts) who pays for boosts and wants orders at a low cost, not likes. Rotate between these five shapes that people share and save: (1) myth vs truth, (2) what changed on Facebook or TikTok and what sellers should do (only changes you are sure of; otherwise skip this shape), (3) before/after, (4) a question sellers often ask, answered, (5) behind the scenes of how a boost is checked day by day (general practice only, no client data). End with one question readers can answer in the comments.",
    "BE TIMELY: check 'date'. If a Cambodian selling moment is within about 10 days (11.11, 12.12, payday at month end, Water Festival, Khmer New Year, Pchum Ben, year-end gifts), connect the topic to it when it fits naturally, without inventing exact holiday dates you are unsure of.",
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


def read_json_safe(p):
    try:
        with open(p, encoding="utf-8") as f:
            return json.load(f)
    except Exception:  # noqa: BLE001
        return {}


def read(p):
    with open(p, encoding="utf-8") as f: return f.read()


def campaign_for(date):
    """content/autopost/campaign.json: a dated focus (topics and call to action) the owner set; None outside its dates."""
    c = C.load_json("campaign.json", None)
    if c and c.get("from", "") <= date <= c.get("until", ""):
        return c
    return None


def pick_category(slot, cats, hist, arts, only=None):
    """Least recently used category for this slot (or the campaign's list); ties keep the configured order."""
    last = {}
    for r in hist["runs"]:
        if r.get("status") in ("published", "dry_run") and r.get("category"):
            last[r["category"]] = max(last.get(r["category"], ""), r.get("date", ""))
    for a in arts:
        if a["category"]: last[a["category"]] = max(last.get(a["category"], ""), a["date"])
    options = cats[slot]
    if slot == "morning" and not C.settings()["evening"]["enabled"]:
        # One article a day (owner, 5 Nov 2026): the morning article rotates through every topic, evening ones included.
        options = cats["morning"] + [c for c in cats.get("evening", []) if c["id"] not in {x["id"] for x in cats["morning"]}]
    if only:
        every = {c["id"]: c for x in cats.values() for c in x}
        options = [every[i] for i in only if i in every] or options
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
    camp = campaign_for(date)
    cat = pick_category(slot, cats, h, arts, camp and camp.get(slot))
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
        "slot_focus": ("This month's focus: " + camp["goal"]) if camp else "Morning: practical education for sellers (sales, captions, customers, mistakes, trust)." if slot == "morning"
                      else "Evening: marketing and business improvement (ads, Live, budget, analytics, operations, team, ADS BOX).",
        "must_differ_from_today": other and {"title": other.get("title"), "category": other.get("category")},
        "recent_titles": recent,
        "last_7_days": [{"date": x["date"], "title": x["title"], "primary_keyword": x.get("primary_keyword", ""), "summary": x.get("summary", "")}
                        for x in arts if x["date"] >= (datetime.date.fromisoformat(date) - datetime.timedelta(days=7)).isoformat()]
                       + [{"date": str(v.get("sent_at", ""))[:10], "title": v.get("title") or v.get("video_title") or v.get("slug"), "video": True}
                          for v in (read_json_safe(os.path.join(C.ROOT, "videos", "log.json")).get("videos") or [])
                          if str(v.get("sent_at", ""))[:10] >= (datetime.date.fromisoformat(date) - datetime.timedelta(days=7)).isoformat()],
        "related_articles": related,
        "facts": read(os.path.join(C.AUTO, "facts.md")),
        "rules": [r.format(min_k=s["min_khmer_chars"], max_k=s["max_khmer_chars"]) for r in RULES] + ([camp["rule"]] if camp else []),
        "campaign": camp and {"name": camp["name"], "goal": camp["goal"]},
        "output_schema": SCHEMA,
    }
    with open(a.out, "w", encoding="utf-8") as f: json.dump(brief, f, ensure_ascii=False, indent=2)
    print(f"Due: {slot} article for {date} (mode {s['mode']}). Category: {cat['en']}. Brief written to {a.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
