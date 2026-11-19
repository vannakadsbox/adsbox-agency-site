"""2026 Knowledge Refresh gate (COO, 19 Nov 2026): inside 19 Nov - 31 Dec only COO-approved drafts are published.
Uses a temporary draft for a day that has none (2026-12-30), so the tests do not depend on what is already published."""
import json, os, subprocess, sys, tempfile, unittest
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(os.path.dirname(HERE))
DAY = "2026-12-30"
DRAFT = os.path.join(ROOT, f"content/autopost/prewritten/refresh-2026/{DAY}.json")
SAMPLE = os.path.join(ROOT, "content/autopost/prewritten/refresh-2026/2026-11-21.json")

def plan(date):
    out = tempfile.mktemp(suffix=".json")
    r = subprocess.run([sys.executable, os.path.join(HERE, "plan.py"), "--now", f"{date}T07:00:00+07:00", "--out", out],
                       capture_output=True, text=True, cwd=ROOT)
    return r.returncode, r.stdout, (json.load(open(out)) if r.returncode == 0 else None)

def write_draft(approved):
    d = json.load(open(SAMPLE)); d.update(approved_by="test" if approved else "", approved_at="2026-12-29T22:00:00+07:00" if approved else "")
    json.dump(d, open(DRAFT, "w"), ensure_ascii=False)

class Refresh(unittest.TestCase):
    def tearDown(self):
        if os.path.exists(DRAFT): os.remove(DRAFT)

    def test_day_without_draft_publishes_nothing(self):
        code, msg, _ = plan(DAY)
        self.assertEqual(code, 3); self.assertIn("not written yet", msg)

    def test_unapproved_draft_is_not_published(self):
        write_draft(False)
        code, msg, _ = plan(DAY)
        self.assertEqual(code, 3); self.assertIn("waiting for COO approval", msg)

    def test_approved_draft_is_used_unchanged(self):
        write_draft(True)
        code, _, brief = plan(DAY)
        self.assertEqual(code, 0)
        self.assertTrue(brief["prewritten_draft"].endswith(f"refresh-2026/{DAY}.json"))

if __name__ == "__main__":
    unittest.main()
