#!/usr/bin/env python3
"""Check a generated article and publish it (or record a failed slot).

  python3 tools/autopost/publish.py --brief brief.json --draft draft.json [--push]
      Validate the draft. If it passes: in live mode write content/articles/<slug>.md, in dry-run mode
      write content/autopost/dry-runs/<date>-<slot>.md (never shown on the website); record it in history.json.
  python3 tools/autopost/publish.py --brief brief.json --record-failure "reason" --attempts 3 [--push]
      Record that the slot failed after all attempts (this triggers the Telegram alert).
  python3 tools/autopost/publish.py --brief brief.json --draft draft.json --check
      Only validate; write nothing.

--push pulls the latest main first, re-checks that the slot is still open (so two runs can never
publish the same slot), commits and pushes, retrying if another push got there first.
Exit codes: 0 = done, 2 = draft failed validation (errors printed as JSON), 3 = slot already done, 1 = error.
"""
import argparse, datetime, json, os, re, subprocess, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C

ALLOWED_TAGS = ["Boost Post", "Boost Live", "TikTok", "លក់ Live", "ថែទាំផេក", "រចនា", "Messenger", "ចំណេះដឹង",
                "លក់អនឡាញ", "សេវាអតិថិជន", "ថវិកា និងរបាយការណ៍", "ADS BOX"]
ALLOWED_PRICES = {"79", "99", "120", "29"}      # confirmed: Boost Post $79/mo, Boost TikTok from $99/mo, Boost Live from $120/mo, System from $29/mo
ALLOWED_LINK = re.compile(r"^(/(#[a-z-]+)?$|/#[a-z-]+$|/knowledge/[a-z0-9-]+/?$|https://(www\.)?adsbox\.agency(/[\w\-/#]*)?$|https://t\.me/vannakdm/?$|https://adsbox\.biz/?$)")
CLIENT_NAMES = ["CEO Master", "Borey Chhay", "Skin Seven", "EEWS", "La Rose", "Mabel", "LS Clinic", "Kume", "Derma Beaut",
                "Naomi", "Sopheak", "S-Klean", "S&Y", "Sreyneang", "Dara Cosmetics", "Bopha Shop"]
SITE_RESULT_FIGURES = ["3,693", "3693", "$0.75", "$1.45", "41%", "$2.17", "$84.20", "$309.72"]
def promises_result(text):
    """'ធានា' (guarantee) is only allowed when negated nearby, e.g. 'មិនអាចធានា', 'គ្មាននរណាធានា'."""
    for m in re.finditer(r"ធានា|guarantee", text, re.I):
        before = text[max(0, m.start() - 14):m.start()]
        if not re.search(r"មិន|គ្មាន|\bno\b|\bnot\b|can't|cannot", before, re.I): return True
    return False
RULE_BREAK = re.compile(r"ទិញ\s*Like|ទិញ\s*Follow|ទិញ\s*គណនី|ជួលគណនី|គណនីក្លែងក្លាយ|Like\s*ក្លែងក្លាយ|fake\s+(account|like|comment|review)s?|buy\s+(likes|followers|accounts)", re.I)
TESTIMONIAL = re.compile(r"[«“\"][^»”\"]{5,}[»”\"]\s*(—|-|៖)?\s*(បាននិយាយ|និយាយថា|said)|អតិថិជនម្នាក់របស់យើង|one of our clients", re.I)


def load(p):
    with open(p, encoding="utf-8") as f: return json.load(f)


def khmer_chars(s): return len(C.KHMER.findall(s))


def validate(d, brief, s, existing=None, history=None):
    errs = []
    def need(k, lo, hi, kind="text"):
        v = d.get(k)
        if not isinstance(v, str) or not v.strip(): errs.append(f"{k}: missing"); return ""
        if not lo <= len(v.strip()) <= hi: errs.append(f"{k}: length {len(v.strip())}, must be {lo}-{hi} characters")
        return v.strip()
    title = need("title", 20, 90); summary = need("summary", 40, 220); seo_title = need("seo_title", 15, 60)
    seo_desc = need("seo_description", 70, 160); pk = need("primary_keyword", 3, 60); alt = need("image_alt", 10, 150)
    need("image_prompt", 20, 600)
    body = d.get("body") if isinstance(d.get("body"), str) else ""
    if not body.strip(): errs.append("body: missing")
    for k, v in (("title", title), ("summary", summary), ("seo_title", seo_title), ("seo_description", seo_desc), ("image_alt", alt)):
        if v and khmer_chars(v) < 0.4 * len(re.sub(r"\s", "", v)): errs.append(f"{k}: must be written in Khmer")
    slug = d.get("slug") if isinstance(d.get("slug"), str) else ""
    if not re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+){1,9}", slug or "") or len(slug) > 60:
        errs.append("slug: use 2-10 lowercase English words joined by '-', at most 60 characters")
    elif os.path.exists(os.path.join(C.ARTICLES, slug + ".md")):
        errs.append(f"slug: '{slug}' is already used by another article; choose a different one")
    kw = d.get("keywords")
    if not isinstance(kw, list) or not 3 <= len(kw) <= 8 or not all(isinstance(x, str) and x.strip() for x in kw):
        errs.append("keywords: give a list of 3-8 phrases")
    if d.get("tag") != brief["tag"]: errs.append(f"tag: must be '{brief['tag']}'")
    if d.get("tag") not in ALLOWED_TAGS: errs.append("tag: not an allowed tag")
    if d.get("category") != brief["category"]["id"]: errs.append(f"category: must be '{brief['category']['id']}'")
    em = str(d.get("emoji") or "").split()
    if len(em) != 3: errs.append("emoji: give exactly 3 emoji separated by spaces")

    if body:
        k = khmer_chars(body)
        if not s["min_khmer_chars"] <= k <= s["max_khmer_chars"]:
            errs.append(f"body: {k} Khmer characters, must be {s['min_khmer_chars']}-{s['max_khmer_chars']} (about 300-600 Khmer words)")
        letters = k + len(C.LATIN.findall(body))
        if letters and k / letters < 0.65: errs.append("body: must be mostly Khmer (too much English)")
        if re.search(r"(?m)^#\s", body): errs.append("body: do not use a '# ' heading; the title is shown separately")
        heads = re.findall(r"(?m)^#{2,3}\s+\S", body); lists = re.findall(r"(?m)^\s*(?:[-*]|\d+[.)])\s+\S", body)
        if len(heads) < 2 and len(lists) < 3: errs.append("body: add structure (at least 2 '## ' headings or a list of steps)")
        paras = [p for p in re.split(r"\n\s*\n", body.strip()) if p.strip()]
        if len(paras) < 5: errs.append("body: too few paragraphs/blocks for a full article")
        if any(len(p) > 900 and not re.match(r"\s*(?:[-*]|\d+[.)])", p) for p in paras): errs.append("body: a paragraph is too long for mobile; split it")
        tail = "\n".join(paras[-2:])
        if not re.search(r"ADS BOX|/#services|/#adsbox-system|t\.me/vannakdm|adsbox\.biz", tail):
            errs.append("body: end with a short call to action that mentions ADS BOX or links to /#services or Telegram")
        for m in re.finditer(r"\]\(([^)\s]+)\)", body):
            if not ALLOWED_LINK.match(m.group(1)): errs.append(f"body: link not allowed: {m.group(1)}")
        for m in re.finditer(r"https?://\S+", re.sub(r"\]\([^)]*\)", "]", body)):
            if not ALLOWED_LINK.match(m.group(0).rstrip(").,។")): errs.append(f"body: bare link not allowed: {m.group(0)}")
        for m in re.finditer(r"/knowledge/([a-z0-9-]+)/?", body):
            if not os.path.exists(os.path.join(C.ARTICLES, m.group(1) + ".md")): errs.append(f"body: links to an article that does not exist: {m.group(0)}")
        if pk and body.count(pk) > 6: errs.append("body: primary keyword repeated too often (keyword stuffing)")

    text = "\n".join(str(d.get(k) or "") for k in ("title", "summary", "seo_title", "seo_description", "body"))
    if promises_result(text): errs.append("claims: do not promise or guarantee results ('ធានា'); write that results depend on the product, price and photos")
    if RULE_BREAK.search(text): errs.append("claims: advice that breaks Facebook/TikTok rules (fake or bought accounts, likes, follows)")
    if TESTIMONIAL.search(text): errs.append("claims: no testimonials or quotes from clients")
    for n in CLIENT_NAMES:
        if n.lower() in text.lower(): errs.append(f"claims: do not name real businesses or clients ({n})")
    for f in SITE_RESULT_FIGURES:
        if f in text: errs.append(f"claims: do not reuse client result figures ({f})")
    for sent in re.split(r"[។\n!?]", text):
        if not re.search(r"ADS\s*BOX|adsbox|អេដស៍ប៊ក់", sent, re.I): continue
        for amt in re.findall(r"\$\s?(\d+(?:[.,]\d+)?)|(\d+(?:[.,]\d+)?)\s?(?:ដុល្លារ|USD|\$)", sent):
            v = (amt[0] or amt[1]).replace(",", "")
            if v.split(".")[0] not in ALLOWED_PRICES or "." in v: errs.append(f"claims: price ${v} next to ADS BOX is not a confirmed price")
        if re.search(r"\d+\s?%|[០-៩]+\s?%|ភាគរយ", sent): errs.append("claims: no percentages or statistics about ADS BOX")
        for num in re.findall(r"(?<![\d$.,])(\d{2,})(?!\s?(?:ដុល្លារ|USD))", sent):
            if num not in ALLOWED_PRICES and num not in {"120"} and not re.search(r"\$\s?" + num, sent):
                errs.append(f"claims: number {num} next to ADS BOX is not a confirmed figure"); break
        if re.search(r"(?<![\d+])(\d+)\+?\s*(អតិថិជន|clients)", sent) and not re.search(r"120\+?\s*(អតិថិជន|clients)", sent):
            errs.append("claims: the only confirmed client count is 120+")

    # Duplicate checks against published articles and recent dry runs
    existing = C.existing_articles() if existing is None else existing
    history = C.history() if history is None else history
    pool = [(x["title"], x["summary"] + " " + x["body"], x["primary_keyword"], x["date"]) for x in existing]
    pool += [(r.get("title", ""), r.get("summary", ""), r.get("primary_keyword", ""), r.get("date", ""))
             for r in history["runs"][-60:] if r.get("status") in ("published", "dry_run")]
    cut = (datetime.date.fromisoformat(brief["date"]) - datetime.timedelta(days=21)).isoformat()
    for t, b, k, dt in pool:
        if title and t and C.similarity(title, t) >= 0.55: errs.append(f"duplicate: title too similar to an existing article: {t}")
        if pk and k and dt >= cut and C.norm(pk) == C.norm(k): errs.append(f"duplicate: primary keyword '{pk}' was used in the last 21 days ({t})")
        if body and b and len(b) > 400 and C.similarity(body, b, 5) >= 0.35: errs.append(f"duplicate: body too similar to: {t}")
    return sorted(set(errs), key=errs.index)


def yq(s):  # YAML double-quoted string
    return json.dumps(str(s), ensure_ascii=False)


def article_file(d, brief, now):
    fm = [("title", yq(d["title"])), ("slug", yq(d["slug"])), ("summary", yq(d["summary"])), ("tag", yq(d["tag"])),
          ("date", brief["date"]), ("emoji", yq(" ".join(str(d["emoji"]).split()))), ("cover", '""'),
          ("seo_title", yq(d["seo_title"])), ("seo_description", yq(d["seo_description"])),
          ("primary_keyword", yq(d["primary_keyword"])), ("keywords", "[" + ", ".join(yq(k.strip()) for k in d["keywords"]) + "]"),
          ("category", yq(d["category"])), ("image_alt", yq(d["image_alt"])), ("image_prompt", yq(d["image_prompt"])),
          ("source", yq(f"auto-{brief['slot']}")), ("generated_at", yq(now)), ("draft", "false")]
    return "---\n" + "".join(f"{k}: {v}\n" for k, v in fm) + "---\n" + d["body"].strip() + "\n"


def git(*args, check=True):
    r = subprocess.run(["git", *args], cwd=C.ROOT, capture_output=True, text=True)
    if check and r.returncode: raise RuntimeError(f"git {' '.join(args)} failed: {r.stderr.strip()}")
    return r


def sync():
    git("fetch", "-q", "origin", "main"); git("reset", "-q", "--hard", "origin/main")


def apply(a, brief, s):
    """Write the article / record into the working tree. Returns (exit code, message, files)."""
    h = C.history(); now = datetime.datetime.now(C.TZ).isoformat(timespec="seconds")
    done = C.slot_record(h, brief["date"], brief["slot"], ("published",) if s["mode"] == "live" else ("published", "dry_run"))
    if done: return 3, f"Already done: {brief['slot']} {brief['date']} is {done['status']} ({done.get('slug')})", []
    rec = {"date": brief["date"], "slot": brief["slot"], "category": brief["category"]["id"], "angle": brief.get("suggested_angle"),
           "attempts": a.attempts, "generated_at": now}
    if a.record_failure is not None:
        rec.update(status="failed", error=a.record_failure[:500], failed_at=now)
        h["runs"].append(rec); h["runs"] = h["runs"][-400:]; C.save_json("history.json", h)
        return 0, f"Recorded failure for {brief['slot']} {brief['date']}", ["content/autopost/history.json"]
    d = load(a.draft)
    errs = validate(d, brief, s)
    if errs: return 2, json.dumps({"ok": False, "errors": errs}, ensure_ascii=False, indent=1), []
    rec.update(title=d["title"], slug=d["slug"], summary=d["summary"], primary_keyword=d["primary_keyword"], tag=d["tag"],
               khmer_chars=khmer_chars(d["body"]))
    text = article_file(d, brief, now)
    if s["mode"] == "live" and not a.dry_run:
        path = os.path.join(C.ARTICLES, d["slug"] + ".md"); rel = f"content/articles/{d['slug']}.md"
        rec.update(status="published", published_at=now, url=f"https://adsbox.agency/knowledge/{d['slug']}/")
    else:
        os.makedirs(C.DRY_RUNS, exist_ok=True)
        path = os.path.join(C.DRY_RUNS, f"{brief['date']}-{brief['slot']}-{d['slug']}.md"); rel = os.path.relpath(path, C.ROOT)
        rec.update(status="dry_run", file=rel)
    with open(path, "w", encoding="utf-8") as f: f.write(text)
    h["runs"].append(rec); h["runs"] = h["runs"][-400:]; C.save_json("history.json", h)
    return 0, f"{rec['status']}: {d['title']} -> {rec.get('url') or rel}", [rel, "content/autopost/history.json"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--brief", required=True); ap.add_argument("--draft")
    ap.add_argument("--record-failure"); ap.add_argument("--attempts", type=int, default=1)
    ap.add_argument("--check", action="store_true"); ap.add_argument("--push", action="store_true")
    ap.add_argument("--dry-run", action="store_true", help="never publish, even if settings say live")
    a = ap.parse_args()
    brief = load(a.brief)
    if a.record_failure is None and not a.draft: ap.error("--draft or --record-failure is required")
    if a.check:
        errs = validate(load(a.draft), brief, C.settings())
        print(json.dumps({"ok": not errs, "errors": errs}, ensure_ascii=False, indent=1)); return 2 if errs else 0
    for attempt in range(4 if a.push else 1):
        if a.push: sync()
        s = C.settings()
        if not s["enabled"] and a.record_failure is None: print("Paused in settings; nothing published."); return 3
        code, msg, files = apply(a, brief, s)
        if code or not a.push: print(msg); return code
        git("add", *files)
        git("-c", "user.name=ADS BOX auto-publisher", "-c", "user.email=autopost@adsbox.agency", "commit", "-q", "-m",
            f"Knowledge auto-post: {brief['date']} {brief['slot']} ({msg.split(':')[0]})")
        if git("push", "-q", "origin", "HEAD:main", check=False).returncode == 0:
            print(msg + "\nPushed to main; the 'Build site' action publishes it within a few minutes."); return 0
        print(f"Push was rejected (another update landed first); retrying ({attempt + 1}/3)...")
    print("Could not push after 4 tries."); return 1


if __name__ == "__main__":
    sys.exit(main())
