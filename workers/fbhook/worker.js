// ADS BOX Facebook publish webhook (Cloudflare Worker).
//
// Telegram calls this Worker only when someone taps a button on a video message. A tap on
// "✅ Publish ទៅ Facebook Page" (callback data "fbpub:<slug>") from the ADS BOX video chat starts the
// "Facebook publish" GitHub workflow (action "tap") for that one video. The Facebook token, the video files
// and the upload stay in GitHub; GitHub runs only when a video is tapped.
//
// Secrets (set by .github/workflows/fbhook-deploy.yml from the repository secrets; never in this file):
//   TELEGRAM_BOT_TOKEN, WEBHOOK_SECRET, ALLOWED_CHAT_IDS (comma separated), GITHUB_TOKEN
// Plain vars (wrangler.toml): GITHUB_REPO, GITHUB_WORKFLOW, GITHUB_REF

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

async function tg(env, method, body) {
  try {
    const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    return r.ok;
  } catch { return false; }
}

async function dispatch(env, slug, chat, messageId) {
  try {
    const r = await fetch(
      `https://api.github.com/repos/${env.GITHUB_REPO}/actions/workflows/${env.GITHUB_WORKFLOW}/dispatches`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "adsbox-fb-webhook", "Content-Type": "application/json",
        },
        body: JSON.stringify({ ref: env.GITHUB_REF || "main",
          inputs: { action: "tap", slug, chat: String(chat), message_id: String(messageId) } }),
      });
    if (r.status !== 204) console.log(`dispatch ${slug} failed: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
    return r.status === 204;
  } catch (e) { console.log(`dispatch ${slug} error: ${e}`); return false; }
}

// Decide what to do with one Telegram update. Returns a short result string (used by the tests).
export async function handleUpdate(update, env) {
  const q = update.callback_query || {};
  const data = String(q.data || ""), msg = q.message || {};
  const chat = String((msg.chat || {}).id ?? "");
  if (!data.startsWith("fbpub:")) return "ignored";
  const allowed = String(env.ALLOWED_CHAT_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!allowed.includes(chat)) {
    await tg(env, "answerCallbackQuery", { callback_query_id: q.id, text: "មិនអនុញ្ញាត" });
    return "forbidden-chat";
  }
  const slug = data.slice("fbpub:".length);
  if (!SLUG.test(slug)) return "bad-slug";
  const ok = await dispatch(env, slug, chat, msg.message_id ?? "");
  await tg(env, "answerCallbackQuery", { callback_query_id: q.id,
    text: ok ? "កំពុងបង្ហោះទៅ Facebook... (១-៥ នាទី)" : "⚠️ ចាប់ផ្ដើមមិនបាន សូមសាកម្ដងទៀត" });
  if (!ok) await tg(env, "sendMessage", { chat_id: chat, reply_to_message_id: msg.message_id,
    text: `⚠️ ចាប់ផ្ដើមបង្ហោះ ${slug} មិនបាន។ សូមចុច Publish ម្ដងទៀត ឬប្រាប់ក្រុមបច្ចេកទេស។` });
  console.log(`tap ${slug} from ${chat}: ${ok ? "started" : "failed"}`);
  return ok ? "started" : "dispatch-failed";
}

function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/healthz")) {
      const ready = env.TELEGRAM_BOT_TOKEN && env.WEBHOOK_SECRET && env.ALLOWED_CHAT_IDS && env.GITHUB_TOKEN;
      return new Response(ready ? "ok" : "missing configuration", { status: ready ? 200 : 503 });
    }
    if (request.method !== "POST" || url.pathname !== "/telegram") return new Response("not found", { status: 404 });
    if (!env.WEBHOOK_SECRET || !safeEqual(request.headers.get("X-Telegram-Bot-Api-Secret-Token") || "", env.WEBHOOK_SECRET))
      return new Response("unauthorized", { status: 401 });
    let update;
    try { update = await request.json(); } catch { return new Response("bad request", { status: 400 }); }
    try { await handleUpdate(update, env); } catch (e) { console.log(`error: ${e}`); }
    return new Response("ok"); // always 200, so Telegram does not resend the same tap
  },
};
