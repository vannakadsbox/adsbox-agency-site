#!/usr/bin/env python3
"""Tests for the Knowledge v2 daily writer: weekly rotation (owner-approved 16 Nov 2026), pillar tags,
data policy (no auto-written case studies / invented processes), duplicate guard and series. Run:
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
MON, TUE, SUN1, SUN2, SAT_1212 = "2026-11-23", "2026-11-24", "2026-11-29", "2026-12-06", "2026-12-12"


class Rotation(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        shutil.copytree(os.path.join(C.ROOT, "content"), os.path.join(self.tmp, "content"))
        self.saved = (C.ROOT, C.AUTO, C.ARTICLES, C.DRY_RUNS)
        C.ROOT = self.tmp; C.AUTO = os.path.join(self.tmp, "content", "autopost")
        C.ARTICLES = os.path.join(self.tmp, "content", "articles"); C.DRY_RUNS = os.path.join(C.AUTO, "dry-runs")
        C.save_json("history.json", {"runs": [{"date": "2026-11-13", "slot": "morning", "status": "published", "plan_day": 1}]})
        s = C.load_json("settings.json"); s.update(enabled=True, mode="dry_run", rotation_start=MON); s["morning"]["enabled"] = True
        C.save_json("settings.json", s)

    def tearDown(self):
        C.ROOT, C.AUTO, C.ARTICLES, C.DRY_RUNS = self.saved
        shutil.rmtree(self.tmp)

    def pick(self, date):
        return PL.rotation_topic(date, C.history(), C.existing_articles(), C.settings())

    def plan(self, date):
        out = os.path.join(self.tmp, "brief.json")
        sys.argv = ["plan.py", "--now", f"{date}T07:00", "--out", out]
        code = PL.main()
        return code, (P.load(out) if code == 0 else None)

    def done(self, *ids):
        h = C.history()
        h["runs"] += [{"date": "2026-11-01", "slot": "morning", "status": "published", "topic_id": i} for i in ids]
        C.save_json("history.json", h)

    def rot(self):
        return C.load_json("rotation.json")

    def save_rot(self, r):
        C.save_json("rotation.json", r)

    def test_weekday_decides_category_and_pillar(self):
        t = self.pick(MON)[0]
        self.assertEqual((t["rotation_category"], t["topic_id"], t["tag"]), ("boost-post", "bp-max-cpo-calculator", "Boost → Order → ចំណេញ"))
        t = self.pick(TUE)[0]
        self.assertEqual((t["rotation_category"], t["tag"]), ("boost-live", "Live → Order"))

    def test_nothing_before_rotation_start(self):
        t, _, msg = self.pick("2026-11-20")
        self.assertIsNone(t); self.assertIn("starts on", msg)

    def test_brief_has_every_planning_field(self):
        code, b = self.plan(MON)
        self.assertEqual(code, 0)
        for k in ("topic", "category", "pillar", "format", "reader_problem", "kpi", "cta", "related",
                  "not_duplicate_of", "requires_real_data", "requires_coo_approval"):
            self.assertIn(k, b["plan_topic"], k)
        self.assertEqual(b["tag"], "Boost → Order → ចំណេញ")
        self.assertEqual(b["category"]["id"], "boost-post")
        self.assertTrue(any("MONEY FUNNEL AND TERMS" in r and "Refused Parcel Loss" in r for r in b["rules"]))
        self.assertTrue(any(r.startswith("ADS BOX POINT OF VIEW (optional)") for r in b["rules"]))

    def test_used_topic_never_reused(self):
        self.done("bp-max-cpo-calculator")
        self.assertEqual(self.pick(MON)[0]["topic_id"], "bp-likes-vs-orders")

    def test_coo_topic_falls_back_without_approval(self):
        self.done("ex-where-100-went")
        t, notes, _ = self.pick(SUN2)
        self.assertEqual(t["topic_id"], "ex-300-budget-review")
        self.assertTrue(any("COO-confirmed facts" in n for n in notes))

    def test_unapproved_prewritten_is_ignored_and_approved_one_runs(self):
        self.done("ex-where-100-went")
        r = self.rot(); r["queues"]["adsbox-expertise"][1]["prewritten"] = "content/autopost/prewritten/pm.json"; self.save_rot(r)
        os.makedirs(os.path.join(self.tmp, "content", "autopost", "prewritten"), exist_ok=True)
        path = os.path.join(self.tmp, "content", "autopost", "prewritten", "pm.json")
        json.dump({"title": "x"}, open(path, "w"))                                   # no approval record
        self.assertEqual(self.pick(SUN2)[0]["topic_id"], "ex-300-budget-review")
        json.dump({"title": "x", "approved_by": "COO", "approved_at": "2026-11-20"}, open(path, "w"))
        self.assertEqual(self.pick(SUN2)[0]["topic_id"], "ex-pm-morning-check")

    def test_real_data_needs_source_and_client_permission(self):
        r = self.rot(); q = r["queues"]["adsbox-expertise"]
        bench = next(t for t in q if t["topic_id"] == "ex-cpo-benchmark"); bench["prewritten"] = "content/autopost/prewritten/b.json"
        r["queues"]["adsbox-expertise"] = [bench]; self.save_rot(r)
        os.makedirs(os.path.join(self.tmp, "content", "autopost", "prewritten"), exist_ok=True)
        path = os.path.join(self.tmp, "content", "autopost", "prewritten", "b.json")
        base = {"approved_by": "COO", "approved_at": "2026-11-20"}
        for extra, expect in (({}, "ex-delivery-success-rate"),
                              ({"data_source": "client_permitted"}, "ex-delivery-success-rate"),
                              ({"data_source": "client_permitted", "client_permission": "confirmed"}, "ex-cpo-benchmark"),
                              ({"data_source": "adsbox_own"}, "ex-cpo-benchmark")):
            json.dump(dict(base, **extra), open(path, "w"))
            self.assertEqual(self.pick(SUN1)[0]["topic_id"], expect, extra)

    def test_window_topic_goes_first_inside_its_dates_only(self):
        self.assertNotEqual(self.pick("2026-12-05")[0]["topic_id"], "ds-1212-continue")
        self.assertEqual(self.pick(SAT_1212)[0]["topic_id"], "ds-1212-continue")

    def test_too_similar_topic_is_skipped_and_noted(self):
        r = self.rot(); r["queues"]["boost-post"][0]["topic"] = "សារថោក Order ច្រើន តែចុងខែលុយមិនសល់? គណនាពីលុយចាយ Boost ដល់ចំណេញពិត"
        self.save_rot(r)
        t, notes, _ = self.pick(MON)
        self.assertEqual(t["topic_id"], "bp-likes-vs-orders")
        self.assertTrue(any(n.startswith("Skipped 'bp-max-cpo-calculator'") for n in notes))

    def test_empty_category_uses_its_fallback_never_old_generic(self):
        r = self.rot(); r["queues"]["boost-tiktok"] = []; self.save_rot(r)
        t, notes, _ = self.pick("2026-11-25")
        self.assertEqual(t["rotation_category"], "boost-post")
        r["queues"] = {k: [] for k in r["queues"]}; self.save_rot(r)
        code, _ = self.plan("2026-11-25")
        self.assertEqual(code, 3)

    def test_queue_low_is_noted(self):
        r = self.rot(); r["queues"]["boost-post"] = r["queues"]["boost-post"][:3]; self.save_rot(r)
        self.assertTrue(any("left after today" in n for n in self.pick(MON)[1]))

    # Validator (publish.py)
    def errs(self, brief, **change):
        d = copy.deepcopy(SAMPLE); d.update(change)
        return P.validate(d, brief, C.settings())

    def test_case_study_tag_and_words_rejected_for_auto_articles(self):
        b = self.plan(MON)[1]
        self.assertIn("tag: not an allowed tag", self.errs(b, tag=P.CASE_TAG))
        self.assertTrue(any(x.startswith("data policy") for x in self.errs(b, body=SAMPLE["body"] + "\n\nករណីសិក្សា៖ ហាងមួយ")))

    def test_case_study_tag_allowed_only_for_prewritten(self):
        b = self.plan(MON)[1]; b["prewritten_draft"] = "content/autopost/prewritten/x.json"
        self.assertNotIn("tag: not an allowed tag", self.errs(b, tag=P.CASE_TAG))

    def test_run_record_keeps_topic_id(self):
        b = self.plan(MON)[1]
        class A: pass
        a = A(); a.record_failure = "test"; a.attempts = 1; a.draft = None; a.dry_run = False
        P.apply(a, b, C.settings())
        r = C.history()["runs"][-1]
        self.assertEqual((r["topic_id"], r["rotation_category"]), ("bp-max-cpo-calculator", "boost-post"))


if __name__ == "__main__":
    unittest.main()
