#!/usr/bin/env python3
"""Tests for the Render webhook. Run:  python3 tools/fbhook/test_app.py   (no network: HTTP calls are faked)"""
import json, os, sys, threading, unittest, urllib.error, urllib.request

os.environ.update(TELEGRAM_BOT_TOKEN="tok", TELEGRAM_WEBHOOK_SECRET="s3cret", ALLOWED_CHAT_IDS="-1001,555", GITHUB_TOKEN="ghp")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import app  # noqa: E402


def tap(uid, data="fbpub:real-profit-per-order", chat=-1001, mid=42):
    return {"update_id": uid, "callback_query": {"id": f"q{uid}", "data": data, "message": {"message_id": mid, "chat": {"id": chat}}}}


class Handle(unittest.TestCase):
    def setUp(self):
        self.calls = []
        self.dispatch_status = 204
        def fake(url, data=None, headers=None, method=None):
            self.calls.append((url, data))
            return (self.dispatch_status, {}) if "api.github.com" in url else (200, {"ok": True})
        self._orig, app.http_json = app.http_json, fake
        app._seen.clear()

    def tearDown(self):
        app.http_json = self._orig

    def gh(self):
        return [d for u, d in self.calls if "api.github.com" in u]

    def test_tap_starts_workflow_for_that_video(self):
        self.assertEqual(app.handle_update(tap(1)), "started")
        self.assertEqual(self.gh(), [{"ref": "main", "inputs": {"action": "tap", "slug": "real-profit-per-order", "chat": "-1001", "message_id": "42"}}])
        self.assertTrue(any("answerCallbackQuery" in u for u, _ in self.calls))

    def test_same_update_twice_runs_once(self):
        app.handle_update(tap(2)); app.handle_update(tap(2))
        self.assertEqual(len(self.gh()), 1)

    def test_other_chat_rejected(self):
        self.assertEqual(app.handle_update(tap(3, chat=999)), "forbidden-chat")
        self.assertEqual(self.gh(), [])

    def test_other_buttons_and_bad_slugs_ignored(self):
        self.assertEqual(app.handle_update(tap(4, data="other")), "ignored")
        self.assertEqual(app.handle_update(tap(5, data="fbpub:../etc")), "bad-slug")
        self.assertEqual(app.handle_update({"update_id": 6, "message": {"text": "hi"}}), "ignored")
        self.assertEqual(self.gh(), [])

    def test_failed_dispatch_tells_owner_and_allows_retry(self):
        self.dispatch_status = 403
        self.assertEqual(app.handle_update(tap(7)), "dispatch-failed")
        self.assertTrue(any("sendMessage" in u for u, _ in self.calls))
        self.dispatch_status = 204
        self.assertEqual(app.handle_update(tap(7)), "started")


class Server(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.srv = app.ThreadingHTTPServer(("127.0.0.1", 0), app.Handler)
        cls.port = cls.srv.server_address[1]
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()
        cls._orig, app.http_json = app.http_json, lambda *a, **k: (204, {})

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown(); app.http_json = cls._orig

    def post(self, body, secret):
        req = urllib.request.Request(f"http://127.0.0.1:{self.port}/telegram", data=json.dumps(body).encode(),
                                     headers={"Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": secret})
        try:
            return urllib.request.urlopen(req).status
        except urllib.error.HTTPError as e:
            return e.code

    def test_wrong_secret_rejected(self):
        self.assertEqual(self.post(tap(10), "nope"), 401)

    def test_right_secret_accepted(self):
        self.assertEqual(self.post(tap(11), "s3cret"), 200)

    def test_health(self):
        self.assertEqual(urllib.request.urlopen(f"http://127.0.0.1:{self.port}/healthz").status, 200)


if __name__ == "__main__":
    unittest.main()
