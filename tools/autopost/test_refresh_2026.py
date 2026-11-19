"""2026 Knowledge Refresh gate (COO, 19 Nov 2026): inside 19 Nov - 31 Dec only COO-approved drafts are published."""
import json, os, shutil, subprocess, sys, tempfile, unittest
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(os.path.dirname(HERE))
DRAFT = os.path.join(ROOT, "content/autopost/prewritten/refresh-2026/2026-11-23.json")

def plan(date):
    out = tempfile.mktemp(suffix=".json")
    r = subprocess.run([sys.executable, os.path.join(HERE, "plan.py"), "--now", f"{date}T07:00:00+07:00", "--out", out],
                       capture_output=True, text=True, cwd=ROOT)
    return r.returncode, r.stdout, (json.load(open(out)) if r.returncode == 0 else None)

class Refresh(unittest.TestCase):
    def test_unapproved_draft_is_not_published(self):
        code, msg, _ = plan("2026-11-23")
        self.assertEqual(code, 3); self.assertIn("waiting for COO approval", msg)

    def test_day_without_draft_publishes_nothing(self):
        code, msg, _ = plan("2026-12-15")
        self.assertEqual(code, 3); self.assertIn("not written yet", msg)

    def test_approved_draft_is_used_unchanged(self):
        backup = DRAFT + ".bak"; shutil.copy(DRAFT, backup)
        try:
            d = json.load(open(DRAFT)); d.update(approved_by="test", approved_at="2026-11-19T22:00:00+07:00")
            json.dump(d, open(DRAFT, "w"), ensure_ascii=False)
            code, _, brief = plan("2026-11-23")
            self.assertEqual(code, 0)
            self.assertTrue(brief["prewritten_draft"].endswith("refresh-2026/2026-11-23.json"))
        finally:
            shutil.move(backup, DRAFT)

if __name__ == "__main__":
    unittest.main()
