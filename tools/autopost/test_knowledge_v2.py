#!/usr/bin/env python3
"""Tests for the Knowledge v2 rules (owner-approved 15 Nov 2026): pillar tags, the v2 30-day plan,
the data policy (no auto-written case studies) and the signature series. Run:
    python3 tools/autopost/test_knowledge_v2.py

Works on a temporary copy of content/, so nothing in the real site changes.
"""
import copy, json, os, shutil, sys, tempfile, unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import common as C
import publish as P
import plan as PL

SAMPLE = P.load(os.path.join(HERE, "fixtures", "sample-draft.json"))
NOW = "2026-11-17T07:00"  # morning slot window


class V2(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        shutil.copytree(os.path.join(C.ROOT, "content"), os.path.join(self.tmp, "content"))
        self.saved = (C.ROOT, C.AUTO, C.ARTICLES, C.DRY_RUNS)
        C.ROOT = self.tmp; C.AUTO = os.path.join(self.tmp, "content", "autopost")
        C.ARTICLES = os.path.join(self.tmp, "content", "articles"); C.DRY_RUNS = os.path.join(C.AUTO, "dry-runs")
        # Old plan days 1-3 were published before v2 (no plan_id): they must not count as v2 days.
        C.save_json("history.json", {"runs": [
            {"date": "2026-11-1%d" % (2 + i), "slot": "morning", "status": "published", "plan_day": i, "category": "analytics"}
            for i in (1, 2, 3)]})
        s = C.load_json("settings.json"); s.update(enabled=True, mode="dry_run"); s["morning"]["enabled"] = True
        C.save_json("settings.json", s)

    def tearDown(self):
        C.ROOT, C.AUTO, C.ARTICLES, C.DRY_RUNS = self.saved
        shutil.rmtree(self.tmp)

    def plan(self, now=NOW):
        out = os.path.join(self.tmp, "brief.json")
        sys.argv = ["plan.py", "--now", now, "--out", out]
        code = PL.main()
        return code, (P.load(out) if code == 0 else None)

    def mark_done(self, *days):
        h = C.history()
        for d in days:
            h["runs"].append({"date": "2026-11-01", "slot": "evening", "status": "published", "plan_day": d, "plan_id": "knowledge-v2"})
        C.save_json("history.json", h)

    def test_old_plan_days_do_not_block_v2(self):
        code, b = self.plan()
        self.assertEqual(code, 0)
        self.assertEqual(b["plan_topic"]["day"], 1)
        self.assertEqual(b["plan_topic"]["plan_id"], "knowledge-v2")

    def test_brief_uses_pillar_tag_and_series(self):
        self.mark_done(1)
        b = self.plan()[1]
        self.assertEqual(b["plan_topic"]["day"], 2)
        self.assertEqual(b["tag"], "ចំណេញពិត")
        self.assertEqual(b["series"], "ចំណេញពិតប៉ុន្មាន?")

    def test_owner_content_days_are_skipped_without_prewritten(self):
        self.mark_done(1, 2, 3, 4, 5)
        self.assertEqual(self.plan()[1]["plan_topic"]["day"], 7)  # day 6 (Behind ADS BOX) waits for owner facts
        self.mark_done(*[d for d in range(7, 31) if d not in (6, 11, 16, 17, 18, 25, 27, 29)])
        self.assertEqual(self.plan()[0], 3)  # only owner-content and future-window days left: nothing auto-written

    def test_no_case_study_topic_reaches_the_writer(self):
        self.mark_done(*range(1, 31))
        h = C.history(); h["runs"] = [r for r in h["runs"] if r.get("plan_day") not in (18, 25, 27)]; C.save_json("history.json", h)
        self.assertEqual(self.plan()[0], 3)

    def errs(self, brief, **change):
        d = copy.deepcopy(SAMPLE); d.update(change)
        return P.validate(d, brief, C.settings())

    def test_case_study_tag_and_words_rejected_for_auto_articles(self):
        b = self.plan()[1]
        e = self.errs(b, tag=P.CASE_TAG)
        self.assertIn("tag: not an allowed tag", e)
        e = self.errs(b, body=SAMPLE["body"] + "\n\nករណីសិក្សា៖ ហាងមួយ")
        self.assertTrue(any(x.startswith("data policy") for x in e))
        e = self.errs(b, title="Case Study៖ លទ្ធផលពិតរបស់ហាងមួយ ពីការ Boost Post")
        self.assertTrue(any(x.startswith("data policy") for x in e))

    def test_case_study_tag_allowed_only_for_prewritten(self):
        b = self.plan()[1]; b["prewritten_draft"] = "content/autopost/prewritten/x.json"
        e = self.errs(b, tag=P.CASE_TAG)
        self.assertNotIn("tag: not an allowed tag", e)
        self.assertFalse(any(x.startswith("data policy") for x in self.errs(b, body=SAMPLE["body"] + "\n\nCase Study")))

    def test_series_must_match_plan(self):
        self.mark_done(1)
        b = self.plan()[1]
        self.assertIn("series: copy plan_topic.series exactly", self.errs(b, series=""))
        self.assertIn("series: must be empty or one of " + ", ".join(P.SERIES), self.errs(b, series="x"))
        self.assertFalse(any(x.startswith("series") for x in self.errs(b, series="ចំណេញពិតប៉ុន្មាន?")))

    def test_series_written_to_front_matter(self):
        self.mark_done(1)
        b = self.plan()[1]
        d = copy.deepcopy(SAMPLE); d.update(series="ចំណេញពិតប៉ុន្មាន?", tag=b["tag"])
        text = P.article_file(d, b, "2026-11-17T07:00:00+07:00")
        self.assertIn('series: "ចំណេញពិតប៉ុន្មាន?"', text)
        d["series"] = ""
        self.assertNotIn("series:", P.article_file(d, b, "2026-11-17T07:00:00+07:00"))


if __name__ == "__main__":
    unittest.main()
