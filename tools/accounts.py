"""Facebook Pages and TikTok accounts for sale (content/accounts.json, edited in the admin panel).

Staff paste only the link. When the site is built on GitHub (after every save, and once a day), this reads
the public name, follower count and profile picture from the link and keeps them in content/account-cache.json,
so the site still shows the last known details if Facebook or TikTok can't be reached.

- Facebook: the public link-preview data that Facebook gives to link crawlers (og:title, og:description
  "12,345 followers") and the profile picture. Facebook does not share the cover photo publicly, so the cover is
  either uploaded in the admin panel or made from the profile picture (enlarged and blurred).
- TikTok: the public profile page data (nickname, followerCount, avatar). TikTok profiles have no cover.

Manual "name" / "followers" in the admin panel always win over what is read automatically.
"""
import datetime, io, json, os, re, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PIC_DIR = os.path.join("assets", "accounts")
CACHE = os.path.join(ROOT, "content", "account-cache.json")
REFRESH_HOURS = 12
FB_UA = "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)"
BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"


def platform(url):
    host = urllib.parse.urlparse(url or "").netloc.lower()
    if host.endswith("facebook.com") or host.endswith("fb.com"): return "facebook"
    if host.endswith("tiktok.com"): return "tiktok"
    return ""


def key_for(url):
    """A stable file-safe id for a link: the Facebook profile id / page name, or the TikTok @handle."""
    u = urllib.parse.urlparse(url or "")
    q = urllib.parse.parse_qs(u.query)
    if q.get("id"): return "fb-" + re.sub(r"\D", "", q["id"][0])
    path = [p for p in u.path.split("/") if p]
    if platform(url) == "tiktok":
        h = next((p for p in path if p.startswith("@")), "")
        return ("tt-" + re.sub(r"[^\w.-]", "", h[1:]).lower()) if h else ""
    if path and path[0] in ("people", "p") and len(path) >= 3: return "fb-" + re.sub(r"\D", "", path[2])
    if path and path[0] == "p" and len(path) == 2: return "fb-" + re.sub(r"\D", "", path[1].rsplit("-", 1)[-1])
    return ("fb-" + re.sub(r"[^\w.-]", "", path[0]).lower()) if path else ""


def parse_count(s):
    """'10,431' -> 10431, '21K' -> 21000, '1.2M' -> 1200000."""
    s = str(s or "").strip().replace(",", "").replace(" ", "")
    m = re.fullmatch(r"(\d+(?:\.\d+)?)([KkMm]?)", s)
    if not m: return None
    n = float(m.group(1)) * {"": 1, "k": 1000, "m": 1000000}[m.group(2).lower()]
    return int(round(n))


def parse_facebook(html):
    import html as H
    meta = {}
    for tag in re.findall(r"<meta\s[^>]*>", html):
        prop = re.search(r'property="(og:[a-z:_]+)"', tag); content = re.search(r'content="([^"]*)"', tag)
        if prop and content and prop.group(1) not in meta: meta[prop.group(1)] = H.unescape(content.group(1))
    name = (meta.get("og:title") or "").strip()
    m = re.search(r"([\d,.]+\s*[KkMm]?)\s+followers", meta.get("og:description", "")) or re.search(r"([\d,.]+\s*[KkMm]?)\s+followers", html)
    followers = parse_count(m.group(1)) if m else None
    if not name or name.lower() in ("facebook", "log in or sign up to view", "log into facebook"): return None
    return {"name": name, "followers": followers, "picture_url": meta.get("og:image") or ""}


def parse_tiktok(html):
    m = re.search(r'"followerCount":(\d+)', html)
    if not m: return None
    nick = re.search(r'"nickname":"((?:[^"\\]|\\.)*)"', html)
    av = re.search(r'"avatarLarger":"((?:[^"\\]|\\.)*)"', html) or re.search(r'"avatarMedium":"((?:[^"\\]|\\.)*)"', html)
    dec = lambda s: json.loads('"' + s + '"')
    return {"name": dec(nick.group(1)) if nick else "", "followers": int(m.group(1)), "picture_url": dec(av.group(1)) if av else ""}


def fetch(url, ua, timeout=20):
    req = urllib.request.Request(url, headers={"User-Agent": ua, "Accept-Language": "en-US,en;q=0.9"})
    with urllib.request.urlopen(req, timeout=timeout) as r: return r.read()


def read_link(url):
    """Live lookup. Returns {name, followers, picture_url} or None. Network errors return None."""
    kind = platform(url)
    try:
        if kind == "facebook":
            # web.facebook.com / m.facebook.com links are read through www.facebook.com (same page).
            url = re.sub(r"^https://(web|m|mbasic)\.facebook\.com/", "https://www.facebook.com/", url)
            return parse_facebook(fetch(url, FB_UA).decode("utf-8", "replace"))
        if kind == "tiktok": return parse_tiktok(fetch(url, BROWSER_UA).decode("utf-8", "replace"))
    except Exception as ex:
        print(f"Account lookup failed for {url}: {type(ex).__name__}")
    return None


def save_pictures(key, picture_url, kind):
    """Download the profile picture once per refresh; save a square avatar and a blurred cover. Returns (avatar, cover)."""
    from PIL import Image, ImageFilter, ImageEnhance, ImageOps
    raw = fetch(picture_url, FB_UA if kind == "facebook" else BROWSER_UA)
    im = ImageOps.exif_transpose(Image.open(io.BytesIO(raw))).convert("RGB")
    side = min(im.size)
    sq = im.crop(((im.width - side) // 2, (im.height - side) // 2, (im.width + side) // 2, (im.height + side) // 2))
    os.makedirs(os.path.join(ROOT, PIC_DIR), exist_ok=True)
    av = os.path.join(PIC_DIR, key + ".webp"); cv = os.path.join(PIC_DIR, key + "-cover.webp")
    a = sq.copy(); a.thumbnail((240, 240), Image.LANCZOS); a.save(os.path.join(ROOT, av), "WEBP", quality=82, method=6)
    w, h = 960, 540
    scale = max(w / im.width, h / im.height) * 1.15
    c = im.resize((int(im.width * scale), int(im.height * scale)), Image.LANCZOS)
    c = c.crop(((c.width - w) // 2, (c.height - h) // 2, (c.width - w) // 2 + w, (c.height - h) // 2 + h))
    c = ImageEnhance.Brightness(c.filter(ImageFilter.GaussianBlur(18))).enhance(0.85)
    c.save(os.path.join(ROOT, cv), "WEBP", quality=78, method=6)
    return av.replace(os.sep, "/"), cv.replace(os.sep, "/")


def load_cache():
    try:
        with open(CACHE, encoding="utf-8") as f: return json.load(f)
    except (OSError, ValueError): return {}


def save_cache(cache):
    with open(CACHE, "w", encoding="utf-8") as f: json.dump(cache, f, ensure_ascii=False, indent=2, sort_keys=True); f.write("\n")


def refresh(items, now=None, lookup=read_link, pictures=save_pictures, force=False):
    """Update the cache for these links when it is missing or older than REFRESH_HOURS."""
    now = now or datetime.datetime.now(datetime.timezone.utc)
    cache = load_cache(); changed = False
    for it in items:
        url = str(it.get("url") or "").strip(); key = key_for(url); kind = platform(url)
        if not key or not kind: continue
        old = cache.get(key) or {}
        last = old.get("fetched_at")
        if not force and last and now - datetime.datetime.fromisoformat(last) < datetime.timedelta(hours=REFRESH_HOURS): continue
        got = lookup(url)
        if not got:
            if old: old["last_error_at"] = now.isoformat(timespec="seconds"); cache[key] = old; changed = True
            continue
        rec = {"name": got["name"] or old.get("name", ""), "followers": got["followers"] if got["followers"] is not None else old.get("followers"),
               "picture": old.get("picture", ""), "cover": old.get("cover", ""), "url": url, "platform": kind,
               "fetched_at": now.isoformat(timespec="seconds")}
        if got.get("picture_url"):
            try: rec["picture"], rec["cover"] = pictures(key, got["picture_url"], kind)
            except Exception as ex: print(f"Picture download failed for {url}: {type(ex).__name__}")
        cache[key] = rec; changed = True
        print(f"Account read: {kind} {rec['name']!r}, {rec['followers']} followers")
    if changed: save_cache(cache)
    return cache


def load(asset, optimized):
    """content/accounts.json -> data for accounts.js. asset/optimized are content.py helpers for uploaded pictures."""
    path = os.path.join(ROOT, "content", "accounts.json")
    if not os.path.exists(path): return {}
    with open(path, encoding="utf-8") as f: data = json.load(f)
    lists = {kind: data.get(kind) or {} for kind in ("facebook", "tiktok")}
    allitems = [it for l in lists.values() for it in (l.get("items") or [])]
    cache = refresh(allitems) if os.environ.get("ACCOUNTS_OFFLINE") != "1" else load_cache()
    out = {}
    for kind, l in lists.items():
        try: rate = float(l.get("price_per_1k") or 0)
        except (TypeError, ValueError): rate = 0
        items = []
        for it in l.get("items") or []:
            url = str(it.get("url") or "").strip()
            if not url.startswith("https://"): continue
            c = cache.get(key_for(url)) or {}
            name = str(it.get("name") or "").strip() or c.get("name") or ""
            try: followers = int(str(it.get("followers") or "").replace(",", "")) if str(it.get("followers") or "").strip() else c.get("followers")
            except ValueError: followers = c.get("followers")
            cover = optimized(asset(it["cover"]), (960, 540)) if it.get("cover") else c.get("cover", "")
            items.append({"name": name or key_for(url).split("-", 1)[-1], "url": url, "followers": followers or 0, "picture": c.get("picture", ""),
                          "cover": cover, "type": str(it.get("type") or "").strip(), "sold": it.get("status") == "sold",
                          "discount": max(0, min(90, int(float(it.get("discount") or 0)))),
                          "updated": (c.get("fetched_at") or "")[:10]})
        out[kind] = {"title": str(l.get("title") or "").strip(), "price_per_1k": rate, "items": items}
    return out
