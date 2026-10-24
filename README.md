# ADS BOX Agency website

Public website for ADS BOX: services, knowledge articles and contact. Served by GitHub Pages at https://adsbox.agency.

## Editing

Staff edit the site in the admin panel at https://app.pagescms.org (Pages CMS). It saves to the `content/` folder:

- `content/articles/<slug>.md`: one knowledge article per file (settings at the top, Markdown body).
- `content/services.json`: service groups and services (name, description, emoji, price, poster).
- `content/promos.json`: promotions shown in the pop-up.
- Uploaded pictures go to `assets/uploads/`. The admin panel's fields are set in `.pages.yml`.

After each save, the GitHub Action in `.github/workflows/build.yml` runs `python3 tools/build.py`, which writes `articles.js`, `services.js` and `promos.js`, makes the share and service pictures, rebuilds the pages under `knowledge/`, `sitemap.xml` and `robots.txt`, and commits them. Don't edit those generated files by hand.

To build locally: `pip install pyyaml pillow`, have Playwright available for the pictures, then `python3 tools/build.py`.

- **Page text and layout:** `index.html`.

Changes pushed to `main` go live within a minute or two.
