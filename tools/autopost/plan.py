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
    # Knowledge rules approved by the owner on 11-12 Nov 2026 (Knowledge Center audit, Phase 2 and the 30-day plan).
    "TOPIC: write the article for 'plan_topic' (title idea, format, CTA and note). You may polish the title (keep the meaning), but keep the topic, the format and the CTA. Category and tag come from the brief.",
    "Write in natural Khmer that a Cambodian shop owner understands on first reading on a phone: talk like an experienced consultant, use «បងៗ», short paragraphs (1-3 sentences), everyday words; English only for platform terms and metric names (Boost Post, Live, Messenger, Ads Manager, Cost per Order, Conversion Rate...). Clothes are counted with «ឈុត», never «ដុំ».",
    "Length: about 300-600 Khmer words (roughly {min_k}-{max_k} Khmer characters in the body).",
    "Structure for practical articles: a problem the seller recognises → why it happens → what to check → what to do → a labelled example with numbers → mistakes to avoid → a short checklist (lines starting with '- ☐ ') → «## សរុបមួយប្រយោគ» → «### បងអាចធ្វើថ្ងៃនេះ» with 3-4 '- ☐ ' actions → the learning-path and related-article lines → the CTA paragraph last. Short formats (script pack, template, FAQ) may skip parts. Use '## ' headings.",
    "FORMAT: follow plan_topic.format. Never write a plain '៥ គន្លឹះ…' numbered-tips article. Script packs give copy-ready messages; metric explainers go formula → labelled example → how to judge it against the shop's OWN last 7 days and own profit per order → what moves it → what to do; calculators show each step of the sum; decision trees use 'បើ … → …' lines.",
    "MONEY FUNNEL: every article about money uses the same funnel: លុយចាយ → Message → Order → Confirmed → Delivered → Paid → Profit. Never treat Orders as profit. Keep contribution profit (before fixed costs) separate from net profit, and say which one a number is.",
    "NUMBERS: there is no universal 'good' Cost per Message, Cost per Order or conversion rate. Compare with the shop's own numbers. Any guideline number is labelled 'guideline ដែល ADS BOX ណែនាំ មិនមែនជាច្បាប់របស់ Meta / Facebook ទេ'. Any assumed cost (delivery, packaging, return fee) is labelled as an assumption ('ឧទាហរណ៍នេះសន្មត់ថា…'). Check every sum before writing it.",
    "EXAMPLES: every invented shop or figure is introduced with «**ឧទាហរណ៍សម្រាប់បង្ហាញវិធីគណនា** (មិនមែនទិន្នន័យអតិថិជនពិត)». Never use the word «ករណីសិក្សា». No client names, client results, testimonials or real-business names.",
    "CLAIMS: no «យើងឃើញញឹកញាប់», no 'Facebook នឹង…' promises, no guaranteed orders; prefer «អាច», «បង្កើនឱកាស», «ជួយកាត់បន្ថយ». Only state Facebook/TikTok features you are sure of; otherwise give general advice. Never advise anything that breaks platform rules (fake accounts, bought likes or reviews).",
    "LINKS: near the end add one line «**បន្ទាប់ក្នុងផ្លូវរៀន៖** [title](/knowledge/<slug>/)» when an obvious next step exists, and one line «**អត្ថបទពាក់ព័ន្ធ៖** » with 2-4 links separated by ' · ', chosen ONLY from 'all_articles' (exact slugs). In the body you may link the funnel article /knowledge/cost-per-message-vs-cost-per-order/ where it helps.",
    "CTA: the last paragraph is the CTA named in plan_topic.cta: one soft bridge line (e.g. «បើបងអនុវត្តរួច តែមិនមានពេលតាមដាន…»), then the service, written fresh, with only facts and prices from 'facts', linking https://t.me/vannakdm (services) or https://adsbox.biz/ (System). Educate first; mention ADS BOX nowhere else unless the category is the ADS BOX System. 'system-soft' means one gentle line only, no selling.",
    "CAMBODIA: write for Cambodian online sellers (often selling clothes or cosmetics by Facebook posts and Live, Messenger-first, COD, delivery companies, Phnom Penh vs province delivery, $ prices). Connect to a near selling moment (12.12, payday, Khmer New Year) only when plan_topic says so or it fits naturally.",
    "SEO: a problem-first title with words sellers type; one primary keyword used naturally in the title, first paragraph and at most 2-3 more times; seo_title at most 60 characters.",
    "Do not repeat a title, angle or main advice from 'recent_titles' or 'last_7_days'; where the topic is close to an older article, take the new angle in plan_topic and link the older article instead of repeating it.",
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


def plan_topic(date, hist, s):
    """content/autopost/plan30.json (owner-approved 30-day plan): the next topic not yet published.
    Topics with a 'window' [from, until] are written only inside it and go first once it opens."""
    p = C.load_json("plan30.json", None)
    if not p:
        return None
    ok = ("published",) if s["mode"] == "live" else ("published", "dry_run")
    done = {r.get("plan_day") for r in hist["runs"] if r.get("status") in ok}
    left = [t for t in p["topics"] if t["day"] not in done and (not t.get("window") or t["window"][1] >= date)]
    timely = [t for t in left if t.get("window") and t["window"][0] <= date]
    rest = [t for t in left if not t.get("window")]
    return (timely or rest or [None])[0]


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
    topic = plan_topic(date, h, s)
    if topic:
        every = {c["id"]: c for x in cats.values() for c in x}
        cat = every[topic["category"]]
    else:
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
        "category": {k: cat[k] for k in ("id", "kh", "en")}, "tag": cat["tag"], "suggested_angle": (topic["title_idea"] if topic else pick_angle(cat, h)),
        "slot_focus": "Knowledge 30-day plan, day %s of 30." % topic["day"] if topic else ("This month's focus: " + camp["goal"]) if camp else "Morning: practical education for sellers (sales, captions, customers, mistakes, trust)." if slot == "morning"
                      else "Evening: marketing and business improvement (ads, Live, budget, analytics, operations, team, ADS BOX).",
        "must_differ_from_today": other and {"title": other.get("title"), "category": other.get("category")},
        "recent_titles": recent,
        "last_7_days": [{"date": x["date"], "title": x["title"], "primary_keyword": x.get("primary_keyword", ""), "summary": x.get("summary", "")}
                        for x in arts if x["date"] >= (datetime.date.fromisoformat(date) - datetime.timedelta(days=7)).isoformat()]
                       + [{"date": str(v.get("sent_at", ""))[:10], "title": v.get("title") or v.get("video_title") or v.get("slug"), "video": True}
                          for v in (read_json_safe(os.path.join(C.ROOT, "videos", "log.json")).get("videos") or [])
                          if str(v.get("sent_at", ""))[:10] >= (datetime.date.fromisoformat(date) - datetime.timedelta(days=7)).isoformat()],
        "related_articles": related,
        "plan_topic": topic,
        "prewritten_draft": (topic or {}).get("prewritten"),
        "all_articles": [{"slug": x["slug"], "title": x["title"]} for x in arts],
        "facts": read(os.path.join(C.AUTO, "facts.md")),
        "rules": [r.format(min_k=s["min_khmer_chars"], max_k=s["max_khmer_chars"]) for r in RULES] + ([camp["rule"]] if camp else []),
        "campaign": camp and {"name": camp["name"], "goal": camp["goal"]},
        "output_schema": SCHEMA,
    }
    with open(a.out, "w", encoding="utf-8") as f: json.dump(brief, f, ensure_ascii=False, indent=2)
    print(f"Due: {slot} article for {date} (mode {s['mode']}). Plan day: {topic and topic['day']}. Category: {cat['en']}. Brief written to {a.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
