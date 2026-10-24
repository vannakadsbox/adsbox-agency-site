# ADS BOX Agency website

Public website for ADS BOX: services, knowledge articles and contact. Served by GitHub Pages at https://adsbox.agency.

## Editing

- **Prices and services:** edit `services.js`. Put a price in `price` (for example `"$10"`), or leave it empty to show "Ask for price".
- **Knowledge articles:** edit `articles.js` (copy an existing block, give it a new `id`, date and Khmer/English text), then run `python3 tools/build.py`. That makes the Facebook share picture for each new article in `assets/covers/`, rebuilds each article's own page under `knowledge/`, plus `sitemap.xml` and `robots.txt`. Promotions (pop-up and promo row) live in `promos.js`. Commit the generated files too.
- **Page text and layout:** `index.html`.

Changes pushed to `main` go live within a minute or two.
