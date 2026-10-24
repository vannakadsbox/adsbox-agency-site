// Google sign-in, signed session cookies, and the team list (emails + roles) kept in Cloudflare KV.

import { ROLES } from "./perms.js";

const SESSION_COOKIE = "adm_s";
const STATE_COOKIE = "adm_st";
const SESSION_DAYS = 7;

const enc = new TextEncoder();
const b64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = s => atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));

async function hmac(secret, text) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", key, enc.encode(text)));
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export function cookies(req) {
  const out = {};
  for (const part of (req.headers.get("Cookie") || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

const cookie = (name, value, maxAge, path = "/") =>
  `${name}=${value}; Path=${path}; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;

export async function makeSession(env, email, name) {
  const payload = b64url(enc.encode(JSON.stringify({ e: email, n: name || "", x: Date.now() + SESSION_DAYS * 864e5 })));
  return cookie(SESSION_COOKIE, `${payload}.${await hmac(env.SESSION_SECRET, payload)}`, SESSION_DAYS * 86400);
}

export const clearSession = () => cookie(SESSION_COOKIE, "", 0);

// -> { email, name } or null
export async function readSession(env, req) {
  const v = cookies(req)[SESSION_COOKIE];
  if (!v || !env.SESSION_SECRET) return null;
  const [payload, sig] = v.split(".");
  if (!payload || !sig || !safeEqual(sig, await hmac(env.SESSION_SECRET, payload))) return null;
  try {
    const s = JSON.parse(new TextDecoder().decode(Uint8Array.from(fromB64url(payload), c => c.charCodeAt(0))));
    if (!s.e || s.x < Date.now()) return null;
    return { email: s.e, name: s.n };
  } catch { return null; }
}

// ---------- team ----------

export const normEmail = e => String(e || "").trim().toLowerCase();

export async function loadTeam(env) {
  const raw = env.TEAM ? await env.TEAM.get("team") : null;
  const team = raw ? JSON.parse(raw) : { members: [] };
  team.members = (team.members || []).filter(m => m && m.email && ROLES.includes(m.role));
  return team;
}

export async function saveTeam(env, team) {
  await env.TEAM.put("team", JSON.stringify(team));
}

export async function roleOf(env, email) {
  email = normEmail(email);
  if (!email) return null;
  if (email === normEmail(env.OWNER_EMAIL)) return "owner";
  const m = (await loadTeam(env)).members.find(m => normEmail(m.email) === email);
  return m ? m.role : null;
}

// ---------- Google sign-in ----------

const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";

export function redirectUri(env, url) {
  return (env.PUBLIC_URL || url.origin).replace(/\/$/, "") + "/auth/callback";
}

export function loginRedirect(env, url) {
  const state = b64url(crypto.getRandomValues(new Uint8Array(24)));
  const q = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(env, url),
    response_type: "code",
    scope: "openid email profile",
    state, nonce: state,
    prompt: "select_account",
  });
  return new Response(null, {
    status: 302,
    headers: { Location: `${GOOGLE_AUTH}?${q}`, "Set-Cookie": cookie(STATE_COOKIE, state, 600, "/auth") },
  });
}

// -> { email, name } or throws Error with a short code
export async function finishLogin(env, req, url, fetchFn = fetch) {
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  const expected = cookies(req)[STATE_COOKIE];
  if (!code || !state || !expected || !safeEqual(state, expected)) throw new Error("bad_state");
  const r = await fetchFn(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri(env, url), grant_type: "authorization_code",
    }),
  });
  if (!r.ok) throw new Error("google_refused");
  const tok = await r.json();
  // The ID token comes straight from Google's token endpoint over TLS, so its claims can be trusted
  // after checking issuer, audience, expiry and nonce (OpenID Connect Core 3.1.3.7).
  let claims;
  try { claims = JSON.parse(new TextDecoder().decode(Uint8Array.from(fromB64url(tok.id_token.split(".")[1]), c => c.charCodeAt(0)))); }
  catch { throw new Error("bad_token"); }
  const okIss = claims.iss === "https://accounts.google.com" || claims.iss === "accounts.google.com";
  if (!okIss || claims.aud !== env.GOOGLE_CLIENT_ID || claims.exp * 1000 < Date.now() || claims.nonce !== state) throw new Error("bad_token");
  if (!claims.email || claims.email_verified !== true) throw new Error("email_not_verified");
  return { email: normEmail(claims.email), name: claims.given_name || claims.name || "" };
}

export const clearState = () => cookie(STATE_COOKIE, "", 0, "/auth");
