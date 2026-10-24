#!/usr/bin/env python3
"""Build the site from the content/ folder: data files, pictures, knowledge article pages, sitemap.xml and robots.txt.

Run from the repo root:  python3 tools/build.py
The GitHub Action in .github/workflows/build.yml runs it after every save in the admin panel.
"""
import hashlib, html, json, os, shutil, subprocess, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = "https://adsbox.agency"
TG = "https://t.me/vannakdm"
FB = "https://www.facebook.com/adsbox.agency"
MS = "https://m.me/adsbox.agency"

import content

# Turn the content/ folder (edited in the admin panel) into articles.js, services.js and promos.js
articles, services, promos = content.write_all()

# Make the Facebook share picture for each article and the picture on each service card.
# These need Playwright; if they fail the site still builds (share.png is used instead).
for script in ("tools/covers.js", "tools/service-thumbs.js"):
    if subprocess.run(["node", script], cwd=ROOT).returncode != 0:
        print(f"Warning: {script} failed, pictures were not updated")

KH_MONTHS = ["មករា", "កុម្ភៈ", "មីនា", "មេសា", "ឧសភា", "មិថុនា", "កក្កដា", "សីហា", "កញ្ញា", "តុលា", "វិច្ឆិកា", "ធ្នូ"]
EN_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
def kh_num(n): return "".join("០១២៣៤៥៦៧៨៩"[int(c)] if c.isdigit() else c for c in str(n))
def date_kh(d): y, m, dd = d.split("-"); return f"{kh_num(int(dd))} {KH_MONTHS[int(m)-1]} {kh_num(y)}"
def date_en(d): y, m, dd = d.split("-"); return f"{int(dd)} {EN_MONTHS[int(m)-1]} {y}"
e = html.escape
def bi(kh, en, tag="span", cls=""):
    c = f' class="{cls}"' if cls else ""
    return f'<{tag}{c} data-kh="{e(kh)}" data-en="{e(en)}">{e(kh)}</{tag}>'
def variant(id): return sum(ord(c) for c in id) % 3  # same rule as tools/covers.js
def share_image(a):
    if a.get("cover"): return f"{SITE}/{a['cover']}"
    f = os.path.join(ROOT, "assets", "covers", a["id"] + ".png")
    if os.path.exists(f):  # ?v= changes when the picture changes, so Facebook fetches the new one
        return f"{SITE}/assets/covers/{a['id']}.png?v={hashlib.md5(open(f, 'rb').read()).hexdigest()[:8]}"
    return f"{SITE}/assets/share.png"
TGSVG = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21.9 4.3 18.7 19.4c-.2 1-.9 1.3-1.8.8l-4.9-3.6-2.4 2.3c-.3.3-.5.5-1 .5l.4-5 9.1-8.2c.4-.4-.1-.6-.6-.2L6.2 13 1.4 11.5c-1-.3-1-1 .2-1.5L20.5 2.9c.9-.3 1.6.2 1.4 1.4z"/></svg>'

def page(title, desc, url, og_type, main, extra_head="", image=f"{SITE}/assets/share.png"):
    return f'''<!doctype html>
<html lang="km">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{e(title)}</title>
<meta name="description" content="{e(desc)}">
<link rel="canonical" href="{url}">
<link rel="icon" type="image/png" href="/assets/favicon.png">
<meta property="og:type" content="{og_type}">
<meta property="og:site_name" content="ADS BOX">
<meta property="og:url" content="{url}">
<meta property="og:title" content="{e(title)}">
<meta property="og:description" content="{e(desc)}">
<meta property="og:image" content="{image}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#0c1430">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Kantumruy+Pro:wght@400;500;600;700&family=Sora:wght@600;700;800&display=swap">
<link rel="stylesheet" href="/assets/pages.css">
{extra_head}
</head>
<body>
<header class="hdr"><div class="wrap hdr-in">
  <a class="brand" href="/" aria-label="ADS BOX home"><img src="/assets/logo-word.png" alt="ADS BOX" width="140" height="26"></a>
  <nav class="menu" aria-label="Main">
    <a href="/" data-kh="ទំព័រដើម" data-en="Home">ទំព័រដើម</a>
    <a href="/#services" data-kh="សេវាកម្ម" data-en="Services">សេវាកម្ម</a>
    <a href="/knowledge/" data-kh="ចំណេះដឹង" data-en="Knowledge">ចំណេះដឹង</a>
  </nav>
</div></header>
<main>
{main}
</main>
<footer class="ftr"><div class="wrap ftr-in">
  <img src="/assets/logo-word-white.png" alt="ADS BOX" width="130" height="24">
  <span><a href="{TG}" target="_blank" rel="noopener">Telegram</a> · <a href="{FB}" target="_blank" rel="noopener">Facebook</a> · support@adsbox.biz</span>
  <span>© 2026 ADS BOX · Cambodia</span>
</div></footer>
<a class="float-tg" href="{TG}" target="_blank" rel="noopener" aria-label="Chat on Telegram">{TGSVG}{bi("ឆាតជាមួយយើង", "Chat with us", cls="float-label")}</a>
<script src="/assets/pages.js"></script>
</body>
</html>
'''

def write(rel, content):
    path = os.path.join(ROOT, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f: f.write(content)

# Clean old generated article pages
kdir = os.path.join(ROOT, "knowledge")
if os.path.isdir(kdir): shutil.rmtree(kdir)

for i, a in enumerate(articles):
    url = f"{SITE}/knowledge/{a['id']}/"
    others = [r for r in articles if r["id"] != a["id"]]
    related = sorted(others, key=lambda r: (0 if a.get("category") and r.get("category") == a["category"] else 1 if r["tag"]["en"] == a["tag"]["en"] else 2))[:3]
    rel_html = "".join(f'<a class="card" href="/knowledge/{r["id"]}/"><span class="pill">{bi(r["tag"]["kh"], r["tag"]["en"])}</span>{bi(r["title"]["kh"], r["title"]["en"], "h3")}</a>' for r in related)
    seo_title = a.get("seo_title") or a["title"]["kh"]; seo_desc = a.get("seo_description") or a["summary"]["kh"]
    ld_obj = {"@context": "https://schema.org", "@type": "Article", "headline": a["title"]["kh"][:110], "description": seo_desc,
                     "datePublished": a["date"], "dateModified": a.get("modified") or a["date"], "inLanguage": "km", "image": share_image(a), "mainEntityOfPage": url,
                     "articleSection": a["tag"]["kh"],
                     "author": {"@type": "Organization", "name": "ADS BOX"}, "publisher": {"@type": "Organization", "name": "ADS BOX", "logo": {"@type": "ImageObject", "url": f"{SITE}/assets/logo.png"}}}
    if a.get("keywords"): ld_obj["keywords"] = ", ".join(a["keywords"])
    ld = json.dumps(ld_obj, ensure_ascii=False).replace("</", "<\\/")
    extra = f'<script type="application/ld+json">{ld}</script>\n<meta property="article:published_time" content="{a["date"]}">\n<meta property="article:section" content="{e(a["tag"]["kh"])}">'
    extra += "".join(f'\n<meta property="article:tag" content="{e(k)}">' for k in a.get("keywords", [])[:6])
    if a.get("keywords"): extra += f'\n<meta name="keywords" content="{e(", ".join(a["keywords"]))}">'
    if a.get("image_alt"): extra += f'\n<meta property="og:image:alt" content="{e(a["image_alt"])}">'

    if a.get("cover"):
        cover = f'<figure class="cover cover-img"><img src="/{e(a["cover"])}" alt="" width="1200" height="675"></figure>{bi(a["title"]["kh"], a["title"]["en"], "h1")}'
    else:
        cover = f'''<header class="cover cover-{variant(a["id"])}">
    <span class="cv-shape a"></span><span class="cv-shape b"></span><span class="cv-shape c"></span>
    <img class="cv-logo" src="/assets/logo-word-white.png" alt="" width="120" height="22">
    <span class="cv-tag">{bi(a["tag"]["kh"], a["tag"]["en"])}</span>
    {bi(a["title"]["kh"], a["title"]["en"], "h1")}
  </header>'''
    promo_html = "".join(f'''<a class="pcard" href="/#promos"><img src="/{e(pr["thumb"])}" alt="" width="540" height="540" loading="lazy"><span>{bi(pr["title"]["kh"], pr["title"]["en"], "b")}{bi(pr["price"]["kh"], pr["price"]["en"], "span", "pprice")}</span></a>''' for pr in promos)
    promo_sec = f'<section class="wrap promo-strip"><h2>{bi("ការផ្តល់ជូនពិសេស", "Promotions")}</h2><div class="pcards">{promo_html}</div></section>' if promos else ""
    main = f'''<article class="wrap article">
  <a class="back" href="/knowledge/">{bi("← ចំណេះដឹងទាំងអស់", "← All articles")}</a>
  {cover}
  <div class="meta">{'<span class="pill">' + bi(a["tag"]["kh"], a["tag"]["en"]) + '</span>' if a.get("cover") else ""}{bi(date_kh(a["date"]), date_en(a["date"]))}</div>
  {bi(a["summary"]["kh"], a["summary"]["en"], "p", "lead")}
  <div class="body">{a["html"]}</div>
  <aside class="cta-box">
    <div>{bi("ចង់បាន Order ច្រើនជាងមុន?", "Want more orders?", "strong")}{bi("ក្រុម ADS BOX ជួយគ្រប់គ្រង Boost Post និង Boost Live ឲ្យបងប្អូន ហើយផ្ញើរបាយការណ៍ចំណាយ និង Order រាល់ថ្ងៃ។", "The ADS BOX team runs your Boost Post and Boost Live and reports spend and orders every day.", "p")}</div>
    <div class="cta-btns"><a class="btn-navy" href="/#services">{bi("មើលសេវាកម្ម", "See services")}</a><a class="btn-tg" href="{TG}" target="_blank" rel="noopener">{TGSVG}{bi("ឆាតតាម Telegram", "Chat on Telegram")}</a></div>
  </aside>
  <div class="share">{bi("ចែករំលែក៖", "Share:")} <a href="https://www.facebook.com/sharer/sharer.php?u={url}" target="_blank" rel="noopener">Facebook</a> <a href="https://t.me/share/url?url={url}" target="_blank" rel="noopener">Telegram</a></div>
</article>
{promo_sec}
<section class="wrap related"><h2>{bi("អត្ថបទផ្សេងទៀត", "More articles")}</h2><div class="cards">{rel_html}</div></section>'''
    write(f"knowledge/{a['id']}/index.html", page(f"{seo_title} · ADS BOX", seo_desc, url, "article", main, extra, share_image(a)))

tags = []
for a in articles:
    if a["tag"]["en"] not in [t["en"] for t in tags]: tags.append(a["tag"])
chips = f'<button type="button" class="chip" data-tag="all" aria-pressed="true">{bi("ទាំងអស់", "All")}</button>' + "".join(
    f'<button type="button" class="chip" data-tag="{e(t["en"])}" aria-pressed="false">{bi(t["kh"], t["en"])}</button>' for t in tags)
def thumb(a):
    if a.get("cover"): src = "/" + a["cover"]
    elif os.path.exists(os.path.join(ROOT, "assets", "covers", a["id"] + ".png")): src = f"/assets/covers/{a['id']}.png"
    else: return ""
    return f'<img class="card-img" src="{e(src)}" alt="{e(a.get("image_alt") or "")}" width="1200" height="630" loading="lazy" decoding="async">'
cards = "".join(f'''<a class="card" href="/knowledge/{a["id"]}/" data-tag="{e(a["tag"]["en"])}">{thumb(a)}
  <div class="meta"><span class="pill">{bi(a["tag"]["kh"], a["tag"]["en"])}</span>{bi(date_kh(a["date"]), date_en(a["date"]))}</div>
  {bi(a["title"]["kh"], a["title"]["en"], "h3")}{bi(a["summary"]["kh"], a["summary"]["en"], "p")}</a>''' for a in articles)
main = f'''<section class="wrap list">
  {bi("ចំណេះដឹង", "Knowledge", "div", "eyebrow")}
  {bi("គន្លឹះលក់អនឡាញ ពីក្រុម ADS BOX", "Online selling tips from the ADS BOX team", "h1")}
  {bi("អត្ថបទថ្មីរៀងរាល់ថ្ងៃ អំពី Boost Post, Live, TikTok និងការថែទាំ Page។", "A new article every day on Boost Post, Live, TikTok and Page care.", "p", "lead")}
  <div class="chips" role="group" aria-label="Filter by topic">{chips}</div>
  <div class="cards grid">{cards}</div>
</section>'''
write("knowledge/index.html", page("ចំណេះដឹង · ADS BOX Knowledge", "គន្លឹះលក់អនឡាញ ពីក្រុម ADS BOX។ Online selling tips from the ADS BOX team.", f"{SITE}/knowledge/", "website", main))

urls = [(f"{SITE}/", articles[0]["date"] if articles else None), (f"{SITE}/knowledge/", articles[0]["date"] if articles else None)] + [(f"{SITE}/knowledge/{a['id']}/", a["date"]) for a in articles]
sm = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + "".join(
    f"  <url><loc>{u}</loc>" + (f"<lastmod>{d}</lastmod>" if d else "") + "</url>\n" for u, d in urls) + "</urlset>\n"
write("sitemap.xml", sm)
write("robots.txt", f"User-agent: *\nAllow: /\n\nSitemap: {SITE}/sitemap.xml\n")
print(f"Built {len(articles)} article pages, knowledge index, sitemap.xml, robots.txt")
