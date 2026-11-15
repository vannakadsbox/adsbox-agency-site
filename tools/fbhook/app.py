#!/usr/bin/env python3
"""ADS BOX Facebook publish webhook (runs on Render).

Telegram calls this service only when someone taps a button on a video message. A tap on
"✅ Publish ទៅ Facebook Page" (callback data "fbpub:<slug>") from the ADS BOX video chat starts the
"Facebook publish" GitHub workflow for that one video (action "tap"). Nothing else is done here: the
Facebook token, the video files and the upload all stay in GitHub, and GitHub runs only when a video is
tapped (no more polling every 20 minutes).

Environment (set in the Render dashboard; never printed):
  TELEGRAM_BOT_TOKEN       the ADS BOX bot token (to answer the tap)
  TELEGRAM_WEBHOOK_SECRET  random string; Telegram sends it in X-Telegram-Bot-Api-Secret-Token
  ALLOWED_CHAT_IDS         comma-separated chat ids whose taps are accepted (the video chat)
  GITHUB_TOKEN             fine-grained token with "Actions: read and write" on vannakadsbox/adsbox-agency-site only
  GITHUB_REPO              default vannakadsbox/adsbox-agency-site
  GITHUB_WORKFLOW          default facebook.yml
  GITHUB_REF               default main
  SET_WEBHOOK_ON_START     "true" = on start, point the bot's button taps at this service (RENDER_EXTERNAL_URL/telegram).
                           Leave empty until the owner approves the switch; delete the webhook to go back to polling.

Only Python's standard library is used. Health check: GET /healthz.
"""
import hmac, json, os, re, sys, threading, time, urllib.error, urllib.parse, urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
SECRET = os.environ.get("TELEGRAM_WEBHOOK_SECRET", "").strip()
CHATS = {c.strip() for c in os.environ.get("ALLOWED_CHAT_IDS", "").split(",") if c.strip()}
GH_TOKEN = os.environ.get("GITHUB_TOKEN", "").strip()
GH_REPO = os.environ.get("GITHUB_REPO", "vannakadsbox/adsbox-agency-site").strip()
GH_WORKFLOW = os.environ.get("GITHUB_WORKFLOW", "facebook.yml").strip()
GH_REF = os.environ.get("GITHUB_REF", "main").strip()
SLUG = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")

_seen = {}  # update_id -> time; Telegram may resend an update if we answer slowly (e.g. after a cold start)
_lock = threading.Lock()


def log(msg):
    for s in (TOKEN, GH_TOKEN, SECRET):
        if s:
            msg = msg.replace(s, "***")
    print(time.strftime("%Y-%m-%d %H:%M:%S"), msg, flush=True)


def http_json(url, data=None, headers=None, method=None):
    body = json.dumps(data).encode() if data is not None else None
    req = urllib.request.Request(url, data=body, method=method or ("POST" if body is not None else "GET"),
                                 headers={"Content-Type": "application/json", **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            raw = r.read()
            return r.status, (json.loads(raw) if raw else {})
    except urllib.error.HTTPError as e:
        return e.code, {"error": e.read()[:300].decode("utf-8", "replace")}
    except Exception as e:  # network problems are reported, never raised into the request handler
        return 0, {"error": f"{type(e).__name__}: {e}"}


def tg(method, fields):
    return http_json(f"https://api.telegram.org/bot{TOKEN}/{method}", fields)


def dispatch(slug, chat, message_id):
    """Start the GitHub workflow for one tapped video. Returns True when GitHub accepted it."""
    status, r = http_json(
        f"https://api.github.com/repos/{GH_REPO}/actions/workflows/{GH_WORKFLOW}/dispatches",
        {"ref": GH_REF, "inputs": {"action": "tap", "slug": slug, "chat": str(chat), "message_id": str(message_id)}},
        {"Authorization": f"Bearer {GH_TOKEN}", "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"})
    if status != 204:
        log(f"dispatch {slug} failed: HTTP {status} {r}")
    return status == 204


def handle_update(u, now=None):
    """Decide what to do with one Telegram update. Returns a short result string (used by the tests)."""
    now = now or time.time()
    uid = u.get("update_id")
    with _lock:
        for k in [k for k, t in _seen.items() if now - t > 3600]:
            _seen.pop(k, None)
        if uid in _seen:
            return "duplicate"
        _seen[uid] = now
    q = u.get("callback_query") or {}
    data, msg = str(q.get("data") or ""), q.get("message") or {}
    chat = str((msg.get("chat") or {}).get("id", ""))
    if not data.startswith("fbpub:"):
        return "ignored"
    if chat not in CHATS:
        tg("answerCallbackQuery", {"callback_query_id": q.get("id", ""), "text": "មិនអនុញ្ញាត"})
        return "forbidden-chat"
    slug = data.split(":", 1)[1]
    if not SLUG.match(slug):
        return "bad-slug"
    ok = dispatch(slug, chat, msg.get("message_id", ""))
    tg("answerCallbackQuery", {"callback_query_id": q.get("id", ""),
                               "text": "កំពុងបង្ហោះទៅ Facebook... (១-៥ នាទី)" if ok else "⚠️ ចាប់ផ្ដើមមិនបាន សូមសាកម្ដងទៀត"})
    if not ok:
        tg("sendMessage", {"chat_id": chat, "reply_to_message_id": msg.get("message_id"),
                           "text": f"⚠️ ចាប់ផ្ដើមបង្ហោះ {slug} មិនបាន។ សូមចុច Publish ម្ដងទៀត ឬប្រាប់ក្រុមបច្ចេកទេស។"})
        with _lock:
            _seen.pop(uid, None)  # let a retry through
    log(f"tap {slug} from chat {chat}: {'started' if ok else 'failed'}")
    return "started" if ok else "dispatch-failed"


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, text="ok"):
        b = text.encode()
        self.send_response(code)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def do_GET(self):
        if self.path in ("/healthz", "/"):
            ready = bool(TOKEN and SECRET and CHATS and GH_TOKEN)
            return self._send(200 if ready else 503, "ok" if ready else "missing configuration")
        self._send(404, "not found")

    def do_POST(self):
        if self.path != "/telegram":
            return self._send(404, "not found")
        given = self.headers.get("X-Telegram-Bot-Api-Secret-Token", "")
        if not SECRET or not hmac.compare_digest(given, SECRET):
            return self._send(401, "unauthorized")
        try:
            n = int(self.headers.get("Content-Length") or 0)
            u = json.loads(self.rfile.read(min(n, 1_000_000)) or b"{}")
        except (ValueError, json.JSONDecodeError):
            return self._send(400, "bad request")
        try:
            handle_update(u)
        except Exception as e:  # never make Telegram retry forever because of one bad update
            log(f"error: {type(e).__name__}: {e}")
        self._send(200)

    def log_message(self, fmt, *args):  # quiet access log (no tokens in paths anyway)
        pass


def set_webhook():
    base = os.environ.get("RENDER_EXTERNAL_URL", "").rstrip("/")
    if not (base and TOKEN and SECRET):
        return log("webhook not set: RENDER_EXTERNAL_URL / token / secret missing")
    status, r = tg("setWebhook", {"url": f"{base}/telegram", "secret_token": SECRET,
                                  "allowed_updates": ["callback_query"], "drop_pending_updates": False})
    log(f"setWebhook {base}/telegram: HTTP {status} {r.get('description') or r}")


def main():
    port = int(os.environ.get("PORT", "10000"))
    if os.environ.get("SET_WEBHOOK_ON_START", "").strip().lower() == "true":
        threading.Thread(target=set_webhook, daemon=True).start()
    missing = [k for k, v in (("TELEGRAM_BOT_TOKEN", TOKEN), ("TELEGRAM_WEBHOOK_SECRET", SECRET),
                              ("ALLOWED_CHAT_IDS", CHATS), ("GITHUB_TOKEN", GH_TOKEN)) if not v]
    log(f"ADS BOX Facebook publish webhook on port {port}" + (f"; missing: {', '.join(missing)}" if missing else ""))
    ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()


if __name__ == "__main__":
    sys.exit(main())
