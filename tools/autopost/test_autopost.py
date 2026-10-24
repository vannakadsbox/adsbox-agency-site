#!/usr/bin/env python3
"""Tests for the knowledge auto-publisher. Run:  python3 tools/autopost/test_autopost.py

Works on a temporary copy of content/, so nothing in the real site changes.
"""
import copy, datetime, json, os, shutil, subprocess, sys, tempfile, unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import common as C
import publish as P
import plan as PL
import alert as A

SAMPLE = P.load(os.path.join(HERE, "fixtures", "sample-draft.json"))


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        shutil.copytree(os.path.join(C.ROOT, "content"), os.path.join(self.tmp, "content"))
        self.saved = (C.ROOT, C.AUTO, C.ARTICLES, C.DRY_RUNS)
        C.ROOT = self.tmp; C.AUTO = os.path.join(self.tmp, "content", "autopost")
        C.ARTICLES = os.path.join(self.tmp, "content", "articles"); C.DRY_RUNS = os.path.join(C.AUTO, "dry-runs")
        C.save_json("history.json", {"runs": []})

    def tearDown(self):
        C.ROOT, C.AUTO, C.ARTICLES, C.DRY_RUNS = self.saved
        shutil.rmtree(self.tmp)

    def set(self, **kw):
        s = C.load_json("settings.json"); s.update(kw); C.save_json("settings.json", s)

    def plan(self, now, slot=None):
        out = os.path.join(self.tmp, "brief.json")
        argv = ["plan.py", "--now", now, "--out", out] + (["--slot", slot] if slot else [])
        sys.argv = argv
        code = PL.main()
        return code, (P.load(out) if code == 0 else None)

    def publish(self, brief, draft, **flags):
        bp, dp = os.path.join(self.tmp, "b.json"), os.path.join(self.tmp, "d.json")
        for p_, v_ in ((bp, brief), (dp, draft)):
            with open(p_, "w", encoding="utf-8") as f: json.dump(v_, f, ensure_ascii=False)
        class Args: pass
        a = Args(); a.draft = dp; a.record_failure = flags.get("fail"); a.attempts = flags.get("attempts", 1); a.dry_run = False
        return P.apply(a, brief, C.settings())


class Timing(Base):
    def test_slots(self):
        self.assertEqual(self.plan("2026-10-25T06:44")[0], 3)            # too early
        self.assertEqual(self.plan("2026-10-25T06:45")[1]["slot"], "morning")
        self.assertEqual(self.plan("2026-10-25T08:30")[1]["slot"], "morning")
        self.assertEqual(self.plan("2026-10-25T08:31")[0], 3)            # past the window: no catch-up
        self.assertEqual(self.plan("2026-10-25T16:52")[1]["slot"], "evening")
        self.assertEqual(self.plan("2026-10-25T23:59")[0], 3)

    def test_utc_input_is_converted(self):
        # 00:00 UTC is 07:00 in Phnom Penh
        self.assertEqual(self.plan("2026-10-25T00:00+00:00")[1]["slot"], "morning")
        self.assertEqual(self.plan("2026-10-25T10:05+00:00")[1]["slot"], "evening")

    def test_paused_and_disabled(self):
        self.set(enabled=False); self.assertEqual(self.plan("2026-10-25T07:00")[0], 3)
        self.set(enabled=True, morning={"enabled": False, "time": "07:00"}); self.assertEqual(self.plan("2026-10-25T07:00")[0], 3)
        self.assertEqual(self.plan("2026-10-25T17:00")[0], 0)

    def test_changed_time(self):
        self.set(evening={"enabled": True, "time": "18:30"})
        self.assertEqual(self.plan("2026-10-25T17:00")[0], 3)
        self.assertEqual(self.plan("2026-10-25T18:20")[1]["slot"], "evening")


class Validation(Base):
    def brief(self):
        return self.plan("2026-10-25T17:00")[1]

    def errs(self, **change):
        d = copy.deepcopy(SAMPLE); d.update(change)
        return P.validate(d, self.brief(), C.settings())

    def test_sample_passes(self):
        self.assertEqual(self.errs(), [])

    def test_bad_drafts_rejected(self):
        b = SAMPLE["body"]
        cases = {
            "missing title": dict(title=""),
            "english title": dict(title="How to choose the right audience before boosting posts"),
            "bad slug": dict(slug="Choose Audience!"),
            "existing slug": dict(slug="boost-budget-new-page"),
            "seo title too long": dict(seo_title="ក" * 70),
            "too short": dict(body="\n\n".join(b.split("\n\n")[:3])),
            "too long": dict(body=b + ("\n\n" + b.split("\n\n")[2]) * 12),
            "mostly english": dict(body=b + "\n\n" + ("This paragraph is written in English only. " * 60)),
            "guarantee": dict(body=b.replace("ការកំណត់អ្នកមើលល្អ", "ADS BOX ធានាថាបងប្អូននឹងមាន Order ច្រើន។ ការកំណត់អ្នកមើលល្អ")),
            "invented price": dict(body=b + "\n\nសេវា ADS BOX មានតម្លៃត្រឹម $49 ក្នុងមួយខែ។"),
            "invented stat": dict(body=b + "\n\nអតិថិជន ADS BOX ទទួលបាន Order កើន 70%។"),
            "invented client count": dict(body=b + "\n\nADS BOX មានអតិថិជនជាង 500 នាក់។"),
            "client name": dict(body=b + "\n\nហាង Mabel បានប្រើ ADS BOX។"),
            "testimonial": dict(body=b + "\n\n«សេវាល្អណាស់» និយាយថា អតិថិជនម្នាក់របស់យើង។"),
            "result figures": dict(body=b + "\n\nថ្លៃក្នុងមួយ Order ត្រឹម $0.75 ប៉ុណ្ណោះ។"),
            "external link": dict(body=b + "\n\n[មើលនៅទីនេះ](https://example.com/page)"),
            "dead internal link": dict(body=b.replace("/knowledge/boost-budget-new-page/", "/knowledge/does-not-exist/")),
            "rule breaking": dict(body=b + "\n\nអ្នកអាចទិញ Like ដើម្បីឲ្យប៉ុស្ត៍មើលទៅល្បី។"),
            "no call to action": dict(body=b.rsplit("\n\n", 1)[0].replace("ADS BOX", "ក្រុមយើង").replace("(/#services)", "")),
            "h1 in body": dict(body="# ចំណងជើង\n\n" + b),
            "wrong tag": dict(tag="TikTok"),
            "wrong category": dict(category="captions"),
            "two emoji": dict(emoji="🎯 👥"),
            "few keywords": dict(keywords=["មួយ"]),
        }
        for name, change in cases.items():
            with self.subTest(name): self.assertTrue(self.errs(**change), f"{name} should be rejected")

    def test_negated_guarantee_allowed(self):
        b = SAMPLE["body"].replace("## សង្ខេប", "គ្មាននរណាអាចធានាចំនួន Order បានទេ ប៉ុន្តែការសាកល្បងជួយបាន។\n\n## សង្ខេប")
        self.assertEqual(self.errs(body=b), [])

    def test_confirmed_facts_allowed(self):
        b = SAMPLE["body"] + "\n\nADS BOX មានអតិថិជនជាង 120+ ហើយ Boost Post មានតម្លៃ $79 / ខែ។"
        self.assertEqual(self.errs(body=b), [])


class Publishing(Base):
    def test_dry_run_does_not_publish_and_blocks_second_run(self):
        brief = self.plan("2026-10-25T17:00")[1]
        code, msg, files = self.publish(brief, SAMPLE)
        self.assertEqual(code, 0, msg); self.assertIn("dry_run", msg)
        self.assertFalse(os.path.exists(os.path.join(C.ARTICLES, SAMPLE["slug"] + ".md")))
        self.assertTrue(any(f.startswith("content/autopost/dry-runs/") for f in files))
        self.assertEqual(self.plan("2026-10-25T17:10")[0], 3)            # slot done: no second run
        self.assertEqual(self.publish(brief, SAMPLE)[0], 3)              # a concurrent run cannot add a second one

    def test_live_publish_and_duplicate_prevention(self):
        self.set(mode="live")
        brief = self.plan("2026-10-25T17:00")[1]
        code, msg, _ = self.publish(brief, SAMPLE)
        self.assertEqual(code, 0, msg)
        path = os.path.join(C.ARTICLES, SAMPLE["slug"] + ".md")
        fm, body = C.read_front_matter(path)
        self.assertEqual(fm["title"], SAMPLE["title"]); self.assertEqual(str(fm["date"]), "2026-10-25"); self.assertFalse(fm["draft"])
        self.assertEqual(fm["keywords"], SAMPLE["keywords"])
        rec = C.history()["runs"][-1]
        self.assertEqual((rec["status"], rec["url"]), ("published", "https://adsbox.agency/knowledge/choose-the-right-audience-before-boosting/"))
        self.assertEqual(self.publish(brief, SAMPLE)[0], 3)              # same slot twice -> refused
        # next day, same article again -> duplicate checks fire
        brief2 = self.plan("2026-10-26T17:00")[1]
        d2 = dict(SAMPLE, slug="choose-audience-again")
        errs = P.validate(d2, brief2, C.settings())
        self.assertTrue(any(e.startswith("duplicate") for e in errs), errs)

    def test_morning_and_evening_differ(self):
        self.set(mode="live")
        bm = self.plan("2026-10-25T07:00")[1]; be = self.plan("2026-10-25T17:00")[1]
        self.assertNotEqual(bm["category"]["id"], be["category"]["id"])
        self.publish(dict(be, slot="morning", date="2026-10-25", category={"id": "facebook-ads", "kh": "", "en": ""}, tag="Boost Post"), SAMPLE)
        be2 = self.plan("2026-10-25T17:00")[1]
        self.assertEqual(be2["must_differ_from_today"]["title"], SAMPLE["title"])

    def test_category_rotation(self):
        seen = []
        for i in range(8):
            day = (datetime.date(2026, 11, 1) + datetime.timedelta(days=i)).isoformat()
            b = self.plan(f"{day}T17:00")[1]; seen.append(b["category"]["id"])
            h = C.history(); h["runs"].append({"date": day, "slot": "evening", "status": "dry_run", "category": b["category"]["id"], "angle": b["suggested_angle"]}); C.save_json("history.json", h)
        self.assertEqual(len(set(seen)), 8, seen)                        # every evening category used once in 8 days

    def test_failure_recorded_and_alerted(self):
        brief = self.plan("2026-10-25T07:00")[1]
        old = os.path.join(self.tmp, "old.json"); C.save_json("history.json", {"runs": []}); shutil.copy(os.path.join(C.AUTO, "history.json"), old)
        code, msg, _ = self.publish(brief, None, fail="AI output failed validation 3 times", attempts=3)
        self.assertEqual(code, 0); self.assertEqual(C.history()["runs"][-1]["status"], "failed")
        os.environ.pop("TELEGRAM_BOT_TOKEN", None)
        self.assertFalse(A.new_failures(old))                            # no Telegram secrets -> exit 1 so GitHub emails

    def test_watchdog(self):
        os.environ.pop("TELEGRAM_BOT_TOKEN", None)
        self.assertTrue(A.watchdog("2026-10-25T07:30"))                  # too early to alert
        self.assertFalse(A.watchdog("2026-10-25T07:55"))                 # overdue, nothing recorded -> alert
        h = C.history(); h["runs"].append({"date": "2026-10-25", "slot": "morning", "status": "dry_run"}); C.save_json("history.json", h)
        self.assertTrue(A.watchdog("2026-10-25T07:55"))                  # done -> no alert
        self.set(enabled=False); self.assertTrue(A.watchdog("2026-10-25T17:55"))


if __name__ == "__main__":
    unittest.main(verbosity=1)
