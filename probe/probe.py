import urllib.parse
import json, re, urllib.request, html
UA = {"chrome": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
      "fbhit": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)"}
def get(url, ua="chrome"):
    try:
        r = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA[ua], "Accept-Language": "en-US,en;q=0.9"}), timeout=25)
        return r.status, r.geturl(), r.read().decode("utf-8", "replace")
    except Exception as e:
        return getattr(e, "code", 0), url, str(e)[:200]
def metas(h):
    return {k: html.unescape(v)[:160] for k, v in re.findall(r'<meta[^>]+property="(og:[a-z:]+)"[^>]+content="([^"]*)"', h)}
out = {}
ids = ["61580134710032", "61593295843002"]
for i in ids:
    u = f"https://www.facebook.com/profile.php?id={i}"
    for ua in ("fbhit", "chrome"):
        s, final, h = get(u, ua)
        out[f"fb-{ua}-{i}"] = {"status": s, "final": final[:120], "len": len(h), "og": metas(h), "followers": re.findall(r"([\d,.]+K?)\s*followers", h)[:3], "login_wall": "login" in final}
    s, final, h = get("https://www.facebook.com/plugins/page.php?href=" + urllib.parse.quote(u) + "&tabs&width=340&height=130&small_header=false&hide_cover=false&show_facepile=false", "chrome")
    out[f"fb-plugin-{i}"] = {"status": s, "len": len(h), "followers": re.findall(r"([\d,.]+K?\s*(?:followers|likes))", h)[:3],
        "imgs": [x[:110] for x in re.findall(r'<img[^>]+src="([^"]+)"', h)][:4], "title": re.findall(r"<title>(.*?)</title>", h)[:1],
        "names": re.findall(r'_1drp[^>]*>([^<]+)<', h)[:2] + re.findall(r'aria-label="([^"]{3,60})"', h)[:3]}
for u in ["https://www.tiktok.com/@tiktok", "https://www.tiktok.com/@khmertvchannel"]:
    s, final, h = get(u, "chrome")
    m = re.search(r'"followerCount":(\d+)', h); a = re.search(r'"avatarLarger":"([^"]+)"', h); n = re.search(r'"nickname":"([^"]+)"', h)
    out["tt-" + u.rsplit("@", 1)[1]] = {"status": s, "len": len(h), "followers": m and m.group(1), "avatar": a and a.group(1)[:100], "nick": n and n.group(1), "og": metas(h)}
    s, final, h = get("https://www.tiktok.com/oembed?url=" + urllib.parse.quote(u), "chrome")
    out["tt-oembed-" + u.rsplit("@", 1)[1]] = {"status": s, "body": h[:400]}
import urllib.parse
json.dump(out, open("probe/result.json", "w"), ensure_ascii=False, indent=1)
