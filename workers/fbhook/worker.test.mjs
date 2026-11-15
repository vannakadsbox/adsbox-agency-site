// Tests for the Facebook publish Worker. Run: node --test workers/fbhook/worker.test.mjs  (no network: fetch is faked)
import test from "node:test";
import assert from "node:assert/strict";
import worker, { handleUpdate } from "./worker.js";

const env = { TELEGRAM_BOT_TOKEN: "tok", WEBHOOK_SECRET: "s3cret", ALLOWED_CHAT_IDS: "-1001, 555", GITHUB_TOKEN: "ghp",
  GITHUB_REPO: "vannakadsbox/adsbox-agency-site", GITHUB_WORKFLOW: "facebook.yml", GITHUB_REF: "main" };
let calls = [], ghStatus = 204;
globalThis.fetch = async (url, init) => {
  calls.push({ url: String(url), body: init?.body ? JSON.parse(init.body) : null, headers: init?.headers });
  return String(url).includes("api.github.com") ? new Response(null, { status: ghStatus }) : new Response("{}", { status: 200 });
};
const tap = (data = "fbpub:real-profit-per-order", chat = -1001, mid = 42) =>
  ({ update_id: 1, callback_query: { id: "q1", data, message: { message_id: mid, chat: { id: chat } } } });
const gh = () => calls.filter((c) => c.url.includes("api.github.com"));
test.beforeEach(() => { calls = []; ghStatus = 204; });

test("a tap starts the workflow for that one video", async () => {
  assert.equal(await handleUpdate(tap(), env), "started");
  assert.deepEqual(gh().map((c) => c.body), [{ ref: "main", inputs: { action: "tap", slug: "real-profit-per-order", chat: "-1001", message_id: "42" } }]);
  assert.ok(gh()[0].url.endsWith("/repos/vannakadsbox/adsbox-agency-site/actions/workflows/facebook.yml/dispatches"));
  assert.ok(calls.some((c) => c.url.includes("answerCallbackQuery")));
});

test("taps from other chats are refused", async () => {
  assert.equal(await handleUpdate(tap(undefined, 999), env), "forbidden-chat");
  assert.equal(gh().length, 0);
});

test("other buttons, messages and bad slugs are ignored", async () => {
  assert.equal(await handleUpdate(tap("other"), env), "ignored");
  assert.equal(await handleUpdate(tap("fbpub:../x"), env), "bad-slug");
  assert.equal(await handleUpdate({ update_id: 2, message: { text: "hi" } }, env), "ignored");
  assert.equal(gh().length, 0);
});

test("a failed start is reported in Telegram", async () => {
  ghStatus = 403;
  assert.equal(await handleUpdate(tap(), env), "dispatch-failed");
  assert.ok(calls.some((c) => c.url.includes("sendMessage")));
});

const post = (secret, body = tap()) => worker.fetch(new Request("https://w/telegram", {
  method: "POST", headers: { "X-Telegram-Bot-Api-Secret-Token": secret, "Content-Type": "application/json" }, body: JSON.stringify(body) }), env);

test("wrong secret is rejected, right secret accepted", async () => {
  assert.equal((await post("nope")).status, 401);
  assert.equal(gh().length, 0);
  assert.equal((await post("s3cret")).status, 200);
  assert.equal(gh().length, 1);
});

test("health check", async () => {
  assert.equal((await worker.fetch(new Request("https://w/healthz"), env)).status, 200);
  assert.equal((await worker.fetch(new Request("https://w/healthz"), {})).status, 503);
});
