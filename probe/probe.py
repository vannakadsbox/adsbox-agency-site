import urllib.request
for i in ["61580134710032", "61593295843002", "61581017472166"]:
    r = urllib.request.urlopen(urllib.request.Request(f"https://lookaside.fbsbx.com/lookaside/crawler/media/?media_id={i}", headers={"User-Agent": "facebookexternalhit/1.1"}), timeout=25)
    open(f"probe/lookaside-{i}.jpg", "wb").write(r.read())
open("probe/result.json", "w").write("{}")
