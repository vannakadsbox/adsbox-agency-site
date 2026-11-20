#!/usr/bin/env python3
"""2026 Knowledge Refresh draft writer helper (19 Nov - 31 Dec 2026).

The owner gave a blanket approval on 20 Nov 2026 for the remaining Refresh drafts, provided every draft
passes the validator. This script only prepares briefs, validates and saves drafts; the writing itself is
done by the scheduled "Refresh draft writer" session.

  python3 tools/autopost/refresh_writer.py next [--days 6] [--max 3]     # dates that still need a draft
  python3 tools/autopost/refresh_writer.py brief --date 2026-12-02 --out /tmp/rbrief.json
  python3 tools/autopost/refresh_writer.py check --date 2026-12-02 --draft /tmp/rdraft.json
  python3 tools/autopost/refresh_writer.py save  --date 2026-12-02 --draft /tmp/rdraft.json [--push]

Exit codes: 0 ok, 2 validation failed, 3 nothing to do, 1 error.
"""
import argparse, datetime as dt, json, os, re, shutil, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
CAL = os.path.join(ROOT, "content/autopost/refresh2026.json")
DRAFTS = os.path.join(ROOT, "content/autopost/prewritten/refresh-2026")
ARTS = os.path.join(ROOT, "content/articles")
TZ = dt.timezone(dt.timedelta(hours=7))
APPROVAL = {"approved_by": "Owner (blanket approval for the 2026 Refresh plan)",
            "approved_at": "2026-11-20T20:16:00+07:00",
            "approval_note": "Owner, 20 Nov 2026 20:16: «continue … until the plan is finished and Live». Written by the Refresh draft writer under that approval; validator passed before commit."}

RULES = [
    "Write exactly the calendar day: final_topic, style and new_angle. The article must answer a genuinely different question from every article in existing_articles and every draft in other_refresh_drafts: different question, business situation, reader problem, analysis, example, decision and lesson. A different title alone is not enough.",
    "STYLE — use the day's style as the article's shape: Problem Story (realistic seller situation → diagnosis), One Big Question (the whole article answers one question; give the short answer early), Numbers First (open with example numbers, then teach how to think), Compare Two Sellers (Seller A vs Seller B side by side), Decision Scenario (situation + options A/B/C/D, the reader chooses, then the reasoning), Find the Mistake (seller scenarios; the reader looks for the mistake before the answer), Checklist / Self Audit (items the reader ticks, each with what to do if 'no').",
    "DO NOT use the old website article format: no «Checklist រហ័ស», no «សរុបមួយប្រយោគ», no «បងអាចធ្វើថ្ងៃនេះ», no «បន្ទាប់ក្នុងផ្លូវរៀន», no «អត្ថបទពាក់ព័ន្ធ» line, no repeated intro or conclusion formula. Vary openings and endings from other_refresh_drafts.",
    "EXAMPLES: every invented number sits under «**ឧទាហរណ៍សម្រាប់បង្ហាញវិធីគណនា** (មិនមែនទិន្នន័យអតិថិជនពិត)។» and every invented shop story opens with «**រឿងឧទាហរណ៍** (មិនមែនអតិថិជនពិត)». Never present an example as a real client or as ADS BOX results; never write «ករណីសិក្សា» or 'case study'. Never turn an example into a promise of results.",
    "MATHS: check every sum before writing it. Money terms: Revenue = sales; Gross Profit = Revenue − Product Cost; Contribution Profit = Gross − Packing − Delivery − Refused Parcel Loss − Ad Cost; Net Profit = Contribution − Rent − Salaries − Fixed Costs. Never mix them up; say «Contribution Profit» when rent and salaries are not deducted.",
    "NO new statistics presented as facts, no Meta/Facebook/TikTok rule or policy claims, no claims about how an algorithm works. If you give a guideline, say it is a guideline.",
    "Do not invent ADS BOX processes, features, reports or results. Only facts in `facts` may be used about ADS BOX.",
    "CTA: one soft closing line. Educate first, help the reader decide, then at most a soft invitation. Do not repeat the closing line or the same linked article of the last 7 drafts in other_refresh_drafts. No service price unless the article is directly about that service. An internal Knowledge link is a valid closing line in the Refresh period.",
    "LINKS: only /knowledge/<slug>/ links whose slug is in existing_articles, or https://t.me/vannakdm. Use older articles as links, never as the main substance.",
    "LANGUAGE: plain, natural Khmer for online sellers reading on a phone («បង/បងៗ»); English only for the usual terms (Boost, Order, Cost per Order, Message, Live, TikTok, Post, Revenue, Contribution Profit). Clothes are counted with «ឈុត». 1300-5000 Khmer characters. The primary_keyword appears 1-6 times in the body.",
    "DATES: 12 Dec is the 12.12 sale day; 29-31 Dec are year-end topics. Write for the publish date.",
]


def load(p, default=None):
    try:
        return json.load(open(p, encoding="utf-8"))
    except FileNotFoundError:
        return default


def articles():
    out = []
    for f in sorted(os.listdir(ARTS)):
        if not f.endswith(".md"):
            continue
        s = open(os.path.join(ARTS, f), encoding="utf-8").read()
        fm = s.split("---\n", 2)[1] if s.startswith("---") else ""
        g = lambda k: (re.search(rf"^{k}:\s*(.*)$", fm, re.M) or [None, ""])[1].strip().strip('"')
        out.append({"slug": f[:-3], "title": g("title"), "summary": g("summary"), "tag": g("tag")})
    return out


def other_drafts(skip):
    out = []
    for f in sorted(os.listdir(DRAFTS)):
        if f.endswith(".json") and f[:-5] != skip:
            d = load(os.path.join(DRAFTS, f))
            paras = [p for p in d["body"].strip().split("\n\n") if p.strip()]
            out.append({"date": f[:-5], "style": d.get("style"), "title": d["title"], "slug": d["slug"],
                        "opening": paras[0][:220], "closing_line": paras[-1]})
    return out


def day(date):
    cal = load(CAL)
    d = next((x for x in cal["days"] if x["date"] == date), None)
    if not d:
        sys.exit(f"{date} is not in the Refresh calendar")
    return d


def cmd_next(a):
    cal = load(CAL); today = dt.datetime.now(TZ).date()
    todo = []
    for d in cal["days"]:
        dd = dt.date.fromisoformat(d["date"])
        if today < dd <= today + dt.timedelta(days=a.days) and d.get("draft") and not os.path.exists(os.path.join(ROOT, d["draft"])):
            todo.append(d["date"])
    todo = todo[: a.max]
    if not todo:
        print("Nothing to write: every day in the next %d days has a draft." % a.days); return 3
    print(" ".join(todo)); return 0


def cmd_brief(a):
    d = day(a.date)
    facts = open(os.path.join(ROOT, "content/autopost/facts.md"), encoding="utf-8").read()
    brief = {"date": a.date, "calendar_day": d, "rules": RULES, "facts": facts,
             "existing_articles": articles(), "other_refresh_drafts": other_drafts(a.date),
             "output_schema": {"title": "Khmer title", "slug": "new lowercase-hyphen slug not in existing_articles",
                               "summary": "1-2 sentences", "seo_title": "<= 60 chars", "seo_description": "120-160 chars",
                               "primary_keyword": "", "keywords": ["5 items, first = primary_keyword"],
                               "tag": d["tag"], "category": d["category"], "emoji": "3 emoji separated by spaces",
                               "image_prompt": "English, no text, no faces, no logos", "image_alt": "Khmer", "body": "markdown",
                               "style": d["style"]},
             "save_with": f"python3 tools/autopost/refresh_writer.py save --date {a.date} --draft <file> --push"}
    json.dump(brief, open(a.out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"brief written: {a.out} ({d['final_topic']} · {d['style']})"); return 0


def finalize(date, draft_path):
    d = load(draft_path); cal_day = day(date)
    d.update(series="", refresh_date=date, data_source="example_numbers", status="approved (owner blanket approval)", **APPROVAL)
    d["tag"], d["category"], d["style"] = cal_day["tag"], cal_day["category"], cal_day["style"]
    return d, cal_day


def validate(date, d):
    errs = []
    body = d.get("body", "")
    for bad in ["Checklist រហ័ស", "សរុបមួយប្រយោគ", "បងអាចធ្វើថ្ងៃនេះ", "បន្ទាប់ក្នុងផ្លូវរៀន", "**អត្ថបទពាក់ព័ន្ធ៖**", "ករណីសិក្សា"]:
        if bad in body:
            errs.append(f"old format / forbidden text: {bad}")
    if re.search(r"\$\d", body) and "ឧទាហរណ៍" not in body:
        errs.append("numbers without an «ឧទាហរណ៍» label")
    if d["slug"] in {x["slug"] for x in articles()}:
        errs.append("slug already used by a live article")
    for o in other_drafts(date):
        if o["slug"] == d["slug"]:
            errs.append(f"slug already used by the {o['date']} draft")
    last = [p for p in body.strip().split("\n\n") if p.strip()][-1]
    for o in other_drafts(date):
        if o["closing_line"].strip() == last.strip():
            errs.append(f"closing line identical to the {o['date']} draft")
    tmp = tempfile.mkdtemp()
    real = os.path.join(DRAFTS, f"{date}.json"); backup = None
    if os.path.exists(real):
        backup = os.path.join(tmp, "backup.json"); shutil.copy(real, backup)
    json.dump(d, open(real, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    try:
        bp = os.path.join(tmp, "brief.json")
        r = subprocess.run([sys.executable, os.path.join(HERE, "plan.py"), "--now", f"{date}T06:58:00+07:00", "--out", bp],
                           capture_output=True, text=True, cwd=ROOT)
        if r.returncode != 0:
            errs.append("planner: " + (r.stdout + r.stderr).strip())
        else:
            r = subprocess.run([sys.executable, os.path.join(HERE, "publish.py"), "--brief", bp, "--draft", real, "--check"],
                               capture_output=True, text=True, cwd=ROOT)
            res = json.loads(r.stdout or "{}") if r.stdout.strip().startswith("{") else {"ok": False, "errors": [r.stdout + r.stderr]}
            errs += res.get("errors", [])
    finally:
        if backup:
            shutil.copy(backup, real)
        else:
            os.remove(real)
    return errs


def cmd_check(a):
    d, _ = finalize(a.date, a.draft)
    errs = validate(a.date, d)
    print(json.dumps({"ok": not errs, "errors": errs}, ensure_ascii=False, indent=1))
    return 0 if not errs else 2


def git(*args):
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True)


def cmd_save(a):
    d, cal_day = finalize(a.date, a.draft)
    errs = validate(a.date, d)
    if errs:
        print(json.dumps({"ok": False, "errors": errs}, ensure_ascii=False, indent=1)); return 2
    if a.push:
        git("fetch", "-q", "origin"); git("reset", "-q", "--hard", "origin/main")
    path = os.path.join(ROOT, cal_day["draft"])
    if os.path.exists(path):
        print(f"{a.date} already has a draft; not overwritten."); return 3
    json.dump(d, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    cal = load(CAL)
    for x in cal["days"]:
        if x["date"] == a.date:
            x["status"] = "approved (owner blanket approval) — draft ready"
    json.dump(cal, open(CAL, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"saved {cal_day['draft']}: {d['title']}")
    if not a.push:
        return 0
    git("add", cal_day["draft"], "content/autopost/refresh2026.json")
    msg = f"Refresh draft {a.date}: {d['title']}\n\nOwner blanket approval (20 Nov 2026); validator passed."
    r = git("-c", "user.name=ADS BOX refresh writer", "-c", "user.email=autopost@adsbox.agency", "commit", "-q", "-m", msg)
    if r.returncode:
        print(r.stdout + r.stderr); return 1
    for _ in range(3):
        if git("push", "-q", "origin", "HEAD:main").returncode == 0:
            print("pushed"); return 0
        git("pull", "-q", "--rebase", "origin", "main")
    print("push failed"); return 1


def main():
    p = argparse.ArgumentParser(); s = p.add_subparsers(dest="cmd", required=True)
    n = s.add_parser("next"); n.add_argument("--days", type=int, default=6); n.add_argument("--max", type=int, default=3)
    b = s.add_parser("brief"); b.add_argument("--date", required=True); b.add_argument("--out", required=True)
    c = s.add_parser("check"); c.add_argument("--date", required=True); c.add_argument("--draft", required=True)
    v = s.add_parser("save"); v.add_argument("--date", required=True); v.add_argument("--draft", required=True); v.add_argument("--push", action="store_true")
    a = p.parse_args()
    return {"next": cmd_next, "brief": cmd_brief, "check": cmd_check, "save": cmd_save}[a.cmd](a)


if __name__ == "__main__":
    sys.exit(main())
