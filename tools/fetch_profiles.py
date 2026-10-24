#!/usr/bin/env python3
"""Read the public name, follower count, profile picture and cover picture of a Facebook Page or TikTok account
from its link. Used by the site build so staff only paste a link in the admin panel.

  python3 tools/fetch_profiles.py URL [URL ...]     print what was found (JSON)

Facebook and TikTok change their pages often and sometimes block automated readers, so every field can come
back empty; the build then keeps the last good values and anything typed in the admin panel wins.
"""
import html, json, re, sys, urllib.request

UA_BROWSER = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36"
UA_FB = "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)"


def get(url, ua, timeout=20):
    req = urllib.request.Request(url, headers={"User-Agent": ua, "Accept-Language": "en-US,en;q=0.9", "Accept": "text/html,application/xhtml+xml"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.status, r.geturl(), r.read().decode("utf-8", "replace")


def count(text):
    """'10,431' -> 10431, '21K' -> 21000, '1.2M' -> 1200000"""
    m = re.match(r"\s*([\d.,]+)\s*([KkMm]?)", text or "")
    if not m: return None
    n, suf = m.group(1), m.group(2).upper()
    if suf: return int(round(float(n.replace(",", "")) * (1000 if suf == "K" else 1000000)))
    return int(n.replace(",", "").replace(".", ""))


def meta(h, prop):
    m = re.search(r'<meta[^>]+(?:property|name)="' + re.escape(prop) + r'"[^>]+content="([^"]*)"', h) or \
        re.search(r'<meta[^>]+content="([^"]*)"[^>]+(?:property|name)="' + re.escape(prop) + r'"', h)
    return html.unescape(m.group(1)) if m else ""


def unescape_json_url(s):
    return s.encode().decode("unicode_escape").replace("\\/", "/") if s else s


def platform(url):
    if re.search(r"tiktok\.com/@", url or ""): return "tiktok"
    if re.search(r"(facebook|fb)\.com/", url or ""): return "facebook"
    return ""


def fetch_facebook(url):
    out = {"platform": "facebook", "url": url}
    for ua in (UA_FB, UA_BROWSER):
        try:
            status, final, h = get(url, ua)
        except Exception as ex:
            out["error"] = f"{type(ex).__name__}: {ex}"[:160]; continue
        title, desc, img = meta(h, "og:title"), meta(h, "og:description"), meta(h, "og:image")
        m = re.search(r"([\d.,]+\s*[KkMm]?)\s+followers", desc) or re.search(r'"follower_count"\s*:\s*(\d+)', h) or \
            re.search(r"([\d.,]+\s*[KkMm]?)\s+followers", h)
        cover = re.search(r'"cover_photo"\s*:\s*\{.*?"uri"\s*:\s*"([^"]+)"', h, re.S) or re.search(r'"coverPhoto"\s*:\s*\{.*?"uri"\s*:\s*"([^"]+)"', h, re.S) \
            or re.search(r'"cover"\s*:\s*\{[^{}]*"source"\s*:\s*"([^"]+)"', h)
        got = {"name": title, "followers": count(m.group(1)) if m else None, "picture": img,
               "cover": unescape_json_url(cover.group(1)) if cover else "", "http": status, "ua": "fb" if ua == UA_FB else "browser",
               "login_wall": "login" in final or ("Log in" in h and not title)}
        if got["name"] and got["followers"]:
            out.update(got); out.pop("error", None); return out
        out.update({k: v for k, v in got.items() if v and not out.get(k)})
    return out


def fetch_tiktok(url):
    out = {"platform": "tiktok", "url": url}
    try:
        status, final, h = get(url, UA_BROWSER)
    except Exception as ex:
        out["error"] = f"{type(ex).__name__}: {ex}"[:160]; return out
    out["http"] = status
    m = re.search(r'<script[^>]+id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>(.*?)</script>', h, re.S)
    try:
        data = json.loads(m.group(1)) if m else {}
        info = data.get("__DEFAULT_SCOPE__", {}).get("webapp.user-detail", {}).get("userInfo", {})
        user, stats = info.get("user", {}), info.get("statsV2") or info.get("stats") or {}
        out.update({"name": user.get("nickname") or user.get("uniqueId") or "", "followers": int(stats.get("followerCount") or 0) or None,
                    "picture": user.get("avatarLarger") or user.get("avatarMedium") or "", "cover": ""})
    except Exception as ex:
        out["error"] = f"parse: {type(ex).__name__}"
    if not out.get("name"):
        out["name"] = meta(h, "og:title"); out["picture"] = out.get("picture") or meta(h, "og:image")
        d = meta(h, "og:description"); m2 = re.search(r"([\d.,]+\s*[KkMm]?)\s+Followers", d)
        if m2: out["followers"] = count(m2.group(1))
    return out


def fetch(url):
    p = platform(url)
    return fetch_facebook(url) if p == "facebook" else fetch_tiktok(url) if p == "tiktok" else {"url": url, "error": "not a Facebook or TikTok link"}


if __name__ == "__main__":
    print(json.dumps([fetch(u) for u in sys.argv[1:]], ensure_ascii=False, indent=1))
