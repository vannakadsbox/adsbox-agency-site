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
    "TOPIC: write today's topic from the weekly rotation ('plan_topic': topic, category, pillar, format, reader_problem, kpi, cta, related, not_duplicate_of). You may polish the title (keep the meaning), but keep the topic, the format, the KPI and the CTA type. Category and tag come from the brief.",
    "BUSINESS QUESTION: the article must clearly answer at least one of: how much money is spent · how many Orders it brings · what the Cost per Order is · whether it is profitable · when to continue · when to stop · which number to watch · what to do next. Use plan_topic.kpi with a formula or a labelled example.",
    "Write in natural Khmer that a Cambodian shop owner understands on first reading on a phone: talk like an experienced consultant, use «បងៗ», short paragraphs (1-3 sentences), everyday words; English only for platform terms and metric names (Boost Post, Live, Messenger, Ads Manager, Cost per Order, Conversion Rate...). Clothes are counted with «ឈុត», never «ដុំ».",
    "Length: about 300-600 Khmer words (roughly {min_k}-{max_k} Khmer characters in the body).",
    "Structure for practical articles: a problem the seller recognises → why it happens → what to check → what to do → a labelled example with numbers → mistakes to avoid → a short checklist (lines starting with '- ☐ ') → «## សរុបមួយប្រយោគ» → «### បងអាចធ្វើថ្ងៃនេះ» with 3-4 '- ☐ ' actions → the learning-path and related-article lines → the CTA paragraph last. Short formats (script pack, template, FAQ) may skip parts. Use '## ' headings.",
    "FORMAT AND STYLE: follow plan_topic.format. The three house styles (owner, 16 Nov 2026), all for the same reader, a Cambodian online seller: FAQ = 4-7 questions a seller really asks, each as a '### ' heading in the seller's words, each answered in 2-4 short sentences with a number, formula or labelled example; Myth vs Truth = 3-4 beliefs, each written «**ការយល់ខុស៖** …» then «**ការពិត៖** …» with a number or labelled example and what to do instead; Story = one invented shop (described by shop type and city only, never a personal or shop name) told problem → numbers → what they checked → what changed → lesson for you, opening with «**រឿងឧទាហរណ៍** (មិនមែនអតិថិជនពិត)». In every style, every point must lead to an Order, cost or profit result; calculations show each step of the sum. Never a plain '៥ គន្លឹះ…' list of tips.",
    "MONEY FUNNEL AND TERMS: money articles use the funnel លុយចាយ → Message → Order → Confirmed → Delivered → Paid → Profit and EXACTLY these definitions (say which one a number is): Revenue = money received from customers; Gross Profit = Revenue − Product Cost; Contribution Profit = Gross Profit − Packing − Delivery − Refused Parcel Loss − Ad Cost; Net Profit = Contribution Profit − Rent − Salaries − Fixed Costs. Never treat Orders or Revenue as profit.",
    "NUMBERS: there is no universal 'good' Cost per Message, Cost per Order or conversion rate. Compare with the shop's own numbers. Any guideline number is labelled 'guideline ដែល ADS BOX ណែនាំ មិនមែនជាច្បាប់របស់ Meta / Facebook ទេ'. Any assumed cost (delivery, packaging, return fee) is labelled as an assumption ('ឧទាហរណ៍នេះសន្មត់ថា…'). Check every sum before writing it.",
    "EXAMPLES: every invented shop or figure is introduced with «**ឧទាហរណ៍សម្រាប់បង្ហាញវិធីគណនា** (មិនមែនទិន្នន័យអតិថិជនពិត)». Never use the word «ករណីសិក្សា». No client names, client results, testimonials or real-business names.",
    "CLAIMS: no «យើងឃើញញឹកញាប់», no 'Facebook នឹង…' promises, no guaranteed orders; prefer «អាច», «បង្កើនឱកាស», «ជួយកាត់បន្ថយ». Only state Facebook/TikTok features you are sure of; otherwise give general advice. Never advise anything that breaks platform rules (fake accounts, bought likes or reviews).",
    "LINKS: near the end add one line «**បន្ទាប់ក្នុងផ្លូវរៀន៖** [title](/knowledge/<slug>/)» when an obvious next step exists, and one line «**អត្ថបទពាក់ព័ន្ធ៖** » with 2-4 links separated by ' · ', chosen ONLY from 'all_articles' (exact slugs). In the body you may link the funnel article /knowledge/cost-per-message-vs-cost-per-order/ where it helps.",
    "CTA: the last paragraph is the CTA named in plan_topic.cta, after one soft bridge line. Educational: invite the reader to do the calculation and link the matching ADS BOX article, no service pitch. Profit / Case: invite them to send their numbers or Page to https://t.me/vannakdm. Service: the fitting service with its price from 'facts' and https://t.me/vannakdm or /#services. System: https://adsbox.biz/. Only facts and prices from 'facts'; written fresh each time.",
    "CAMBODIA: write for Cambodian online sellers (often selling clothes or cosmetics by Facebook posts and Live, Messenger-first, COD, delivery companies, Phnom Penh vs province delivery, $ prices). Connect to a near selling moment (12.12, payday, Khmer New Year) only when plan_topic says so or it fits naturally.",
    "SEO: a problem-first title with words sellers type; one primary keyword used naturally in the title, first paragraph and at most 2-3 more times; seo_title at most 60 characters.",
    "Do not repeat a title, angle or main advice from 'recent_titles' or 'last_7_days'; where the topic is close to an older article, take the new angle in plan_topic and link the older article instead of repeating it.",
    # Knowledge v2 rules approved by the owner on 15 Nov 2026 (5 pillars, signature series, data policy).
    "PILLAR: the article belongs to the pillar in 'tag' and must connect clearly to Boost → Order → Cost → Profit. Never write a generic online-selling tip that does not lead back to ad spend, Orders, cost per Order or profit.",
    "ADS BOX POINT OF VIEW (optional): where it fits naturally (money, Boost and decision topics) you may use the sentence «ADS BOX មិនមើលតែចំនួន Message ឬ Like ទេ។ យើងមើលថា លុយដែលបានចំណាយ បង្កើត Order បានប៉ុន្មាន និង Cost ក្នុងមួយ Order ប៉ុន្មាន។» or a short «**របៀបដែល ADS BOX មើល៖**» paragraph, at most once. Never force it. Use only facts from `facts`.",
    "PAGE CARE: Page Care articles must link Page health to selling results (Cost per Message, Message → Order, spend at risk). State Facebook features only if certain; otherwise give general advice. Never promise that a Page or account will be restored.",
    "NO DUPLICATES: read plan_topic.related and plan_topic.not_duplicate_of first. Write only the new angle given there and link the older article for anything it already covers. Never rewrite an existing article under a new title.",
    "CTA BY TYPE: the closing CTA follows plan_topic.cta exactly in type (Educational, Profit, Service, System or Case). 80/20: about 80% useful teaching and evidence first; ADS BOX appears only in the 'របៀបដែល ADS BOX មើល' paragraph and the one closing CTA paragraph. Never put a CTA before the first useful section.",
    "DATA POLICY: never write a case study and never present invented, assumed or reconstructed client results as real. Never use the words «ករណីសិក្សា» or «Case Study» and never the tag «Case Study និងទិន្នន័យពិត». Every invented number is labelled «ឧទាហរណ៍». Do not describe ADS BOX PM workflows, AI alerts, reports or system features beyond what `facts` states.",
    "SERIES: if plan_topic.series is not empty, copy it unchanged into the 'series' field and write the article as one episode of that series (a short line near the top may name the series); otherwise leave 'series' empty.",
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
    "series": "copy plan_topic.series exactly (one of the ADS BOX signature series), or an empty string when there is none",
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


def _prewritten_ok(t):
    """An owner-approved prewritten article: the file exists and records who approved it, when, and the data source."""
    path = t.get("prewritten")
    if not path or not os.path.exists(os.path.join(C.ROOT, path)):
        return False
    d = read_json_safe(os.path.join(C.ROOT, path))
    if not (d.get("approved_by") and d.get("approved_at")):
        return False
    if t.get("requires_real_data"):
        src = d.get("data_source")
        if src not in ("adsbox_own", "client_permitted"):
            return False
        if src == "client_permitted" and d.get("client_permission") != "confirmed":
            return False
    return True


def refresh_topic(date):
    """content/autopost/refresh2026.json — the COO's "2026 Knowledge Refresh" (19 Nov – 31 Dec 2026).
    Inside the period a day publishes ONLY its COO-approved draft. Returns (topic or None, message or None, in_period)."""
    cal = None if os.environ.get("ADSBOX_IGNORE_REFRESH") else C.load_json("refresh2026.json", None)  # tests of the weekly rotation
    if not cal or not (cal["start"] <= date <= cal["end"]):
        return None, None, False
    day = next((d for d in cal["days"] if d["date"] == date), None)
    if not day:
        return None, f"2026 Knowledge Refresh: no article is planned for {date}.", True
    path = day.get("draft") or ""
    full = os.path.join(C.ROOT, path) if path else ""
    if not full or not os.path.exists(full):
        return None, f"2026 Knowledge Refresh: the draft for {date} («{day['topic']}») is not written yet; nothing is published.", True
    d = read_json_safe(full)
    if not (d.get("approved_by") and d.get("approved_at")):
        return None, f"2026 Knowledge Refresh: the draft for {date} («{d.get('title') or day['topic']}») is waiting for COO approval; nothing is published.", True
    t = dict(topic_id=f"refresh-{date}", category=day["category"], topic=d.get("title") or day["topic"], pillar=day["tag"],
             tag=day["tag"], format=day.get("proposed_style") or day["style"], series="", prewritten=path,
             plan_id="refresh-2026", day=date, title_idea=d.get("title") or day["topic"], rotation_category=day["category"],
             related=day.get("overlaps", []), requires_coo_approval=True)
    return t, None, True


def rotation_topic(date, hist, arts, s):
    """content/autopost/rotation.json (owner-approved weekly rotation, 16 Nov 2026).
    Returns (topic or None, notes, message)."""
    rot = C.load_json("rotation.json", None)
    if not rot:
        return None, [], None
    start = s.get("rotation_start")
    if start and date < start:
        return None, [], f"The weekly rotation starts on {start}."
    ok = ("published",) if s["mode"] == "live" else ("published", "dry_run")
    used = {r.get("topic_id") or (r.get("plan_day") if r.get("plan_id") == "rotation" else None)
            for r in hist["runs"] if r.get("status") in ok}
    titles = [a["title"] for a in arts]
    notes = []
    ready = lambda t: not (t.get("requires_real_data") or t.get("requires_coo_approval")) or _prewritten_ok(t)
    in_window = lambda t: not t.get("window") or t["window"][0] <= date <= t["window"][1]

    def options(cat):
        q = rot["queues"].get(cat, [])
        timely, rest = [], []
        for t in q:
            if t["topic_id"] in used or not in_window(t):
                continue
            pick = dict(t, _note=None) if ready(t) else None
            if pick is None and t.get("fallback") and t["fallback"]["topic_id"] not in used and ready(t["fallback"]):
                pick = dict(t["fallback"], fallback_for=t["topic_id"],
                            _note=f"'{t['topic_id']}' is waiting for {'approved real data' if t.get('requires_real_data') else 'COO-confirmed facts'}; "
                                  f"today's article is its fallback '{t['fallback']['topic_id']}'.")
            if pick is None:
                continue
            near = next((x for x in titles if C.similarity(pick["topic"], x) >= 0.55), None)
            if near:
                notes.append(f"Skipped '{pick['topic_id']}': too similar to the existing article «{near}».")
                continue
            (timely if t.get("window") else rest).append(pick)
        return timely + rest

    wd = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][datetime.date.fromisoformat(date).weekday()]
    cat = rot["weekday_category"][wd]
    opts = options(cat)
    if not opts:
        alt = rot.get("category_fallback", {}).get(cat)
        notes.append(f"No ready topic in '{cat}' today; using the next '{alt}' topic.")
        cat, opts = alt, options(alt) if alt else []
    if not opts:
        return None, notes, "Nothing to write: no ready topic in today's category or its fallback. Add topics to rotation.json."
    # House styles should not repeat two days in a row: skip ahead to the first topic in a different style
    # (date-window topics keep priority; if every option has yesterday's style, keep the queue order).
    last = next((r.get("format") for r in reversed(hist["runs"]) if r.get("status") in ok and r.get("format")), None)
    first = opts[0]
    if last and first.get("format") == last and not first.get("window"):
        first = next((o for o in opts if o.get("format") != last), first)
    t = dict(first)
    if t.pop("_note", None):
        notes.append(first["_note"])
    left = len(opts) - 1
    if left <= rot.get("queue_low_alert", 2):
        notes.append(f"Queue '{cat}' has {left} topic(s) left after today; please approve more.")
    t.update(plan_id="rotation", day=t["topic_id"], title_idea=t["topic"], tag=t["pillar"], rotation_category=cat)
    return t, notes, None


def plan_topic(date, hist, s):
    """content/autopost/plan30.json (owner-approved 30-day plan): the next topic not yet published.
    Topics with a 'window' [from, until] are written only inside it and go first once it opens."""
    p = C.load_json("plan30.json", None)
    if not p:
        return None
    ok = ("published",) if s["mode"] == "live" else ("published", "dry_run")
    pid = p.get("plan_id")  # runs of an older plan (no or another plan_id) do not count as done days of this plan
    done = {r.get("plan_day") for r in hist["runs"] if r.get("status") in ok and r.get("plan_id") == pid}
    # Topics that need owner-approved content (case studies, real data, Behind ADS BOX facts) wait until a prewritten file exists.
    ready = lambda t: not t.get("requires_prewritten") or (t.get("prewritten") and os.path.exists(os.path.join(C.ROOT, t["prewritten"])))
    left = [dict(t, plan_id=pid) for t in p["topics"] if t["day"] not in done and ready(t) and (not t.get("window") or t["window"][1] >= date)]
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
    notes = []
    r_topic, r_msg, in_refresh = refresh_topic(date)
    if in_refresh:
        # COO decision (19 Nov 2026): 19 Nov - 31 Dec 2026 publishes only COO-approved refresh drafts; no rotation, no auto-writing.
        if not r_topic:
            print(r_msg); return 3
        topic = r_topic
    elif C.load_json("rotation.json", None):
        topic, notes, msg = rotation_topic(date, h, arts, s)
        if not topic:
            print(msg); return 3
    else:
        topic = plan_topic(date, h, s)
    if not topic and (C.load_json("plan30.json", None) or {}).get("plan_id"):
        # Knowledge v2 (owner, 15 Nov 2026): never fall back to the old rotating generic topics.
        print("Nothing to write: every ready topic in the Knowledge plan is done; the remaining days wait for owner content "
              "(Behind ADS BOX facts, case-study permission or approved data) or for their date window. Add a new plan to continue.")
        return 3
    if topic:
        every = {c["id"]: c for x in cats.values() for c in x}
        cat = every[topic["category"]]
    else:
        cat = pick_category(slot, cats, h, arts, camp and camp.get(slot))
    other = C.slot_record(h, date, "evening" if slot == "morning" else "morning", ("published", "dry_run"))
    recent = [{"title": x["title"], "date": x["date"], "category": x["category"]} for x in arts[:60]]
    recent += [{"title": r.get("title"), "date": r.get("date"), "category": r.get("category"), "dry_run": True}
               for r in h["runs"][-30:] if r.get("status") == "dry_run" and r.get("title")]
    tag = (topic or {}).get("tag") or cat["tag"]
    related = [{"slug": x["slug"], "title": x["title"], "tag": x["tag"]} for x in arts if x["tag"] == tag][:8] or \
              [{"slug": x["slug"], "title": x["title"], "tag": x["tag"]} for x in arts[:5]]
    brief = {
        "date": date, "slot": slot, "mode": s["mode"], "max_attempts": s["max_attempts"],
        "now": now.isoformat(timespec="minutes"),
        "category": {k: cat[k] for k in ("id", "kh", "en")}, "tag": (topic or {}).get("tag") or cat["tag"], "suggested_angle": (topic["title_idea"] if topic else pick_angle(cat, h)),
        "series": (topic or {}).get("series") or "",
        "slot_focus": (f"Weekly rotation: {topic['rotation_category']} ({topic['topic_id']})" if topic.get("plan_id") == "rotation" else "Knowledge 30-day plan, day %s of 30." % topic["day"]) if topic else ("This month's focus: " + camp["goal"]) if camp else "Morning: practical education for sellers (sales, captions, customers, mistakes, trust)." if slot == "morning"
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
        "prewritten_draft": (topic or {}).get("prewritten") if (topic and (not (topic.get("requires_real_data") or topic.get("requires_coo_approval")) or _prewritten_ok(topic))) else None,
        "planner_notes": notes,
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
