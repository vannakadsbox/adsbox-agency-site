import json, re, urllib.request, urllib.parse, html
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
def get(url, ua=UA):
    try:
        r = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": ua, "Accept-Language": "en-US,en;q=0.9"}), timeout=25)
        return r.status, r.headers.get("Content-Type"), r.read()
    except Exception as e:
        return getattr(e, "code", 0), "", str(e).encode()
out = {}
for i in ["61580134710032", "61593295843002"]:
    u = f"https://www.facebook.com/profile.php?id={i}"
    s, ct, b = get("https://www.facebook.com/plugins/page.php?href=" + urllib.parse.quote(u) + "&tabs&width=500&height=200&small_header=false&adapt_container_width=true&hide_cover=false&show_facepile=false")
    h = html.unescape(b.decode("utf-8", "replace"))
    urls = sorted(set(re.findall(r'https://scontent[^"\'\s)]+', h)))
    out[i] = {"status": s, "cover_like": [x[:140] for x in urls if "30808-6" in x or "cover" in x.lower()][:3],
              "all_imgs": [x[:90] for x in urls][:8], "bg": re.findall(r"background-image:\s*url\(([^)]{0,140})", h)[:3],
              "cover_word": [m.start() for m in re.finditer("cover", h)][:5]}
    s, ct, b = get(f"https://lookaside.fbsbx.com/lookaside/crawler/media/?media_id={i}", "facebookexternalhit/1.1")
    out[i]["lookaside"] = {"status": s, "type": ct, "bytes": len(b)}
    # does a plugin image download work (would be the saved copy)?
    if out[i]["cover_like"]:
        s, ct, b = get(html.unescape(out[i]["cover_like"][0]) if False else [x for x in urls if "30808-6" in x][0]); out[i]["cover_download"] = {"status": s, "type": ct, "bytes": len(b)}
json.dump(out, open("probe/result.json", "w"), ensure_ascii=False, indent=1)
