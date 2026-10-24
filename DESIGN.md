# ADS BOX website design

The look of adsbox.agency, so new sections match. Values live as CSS variables at the top of `index.html` (`:root`); use the names, not raw values. Built from the site's existing brand, not copied from other sites.

## Color
| Token | Light | Dark | Role |
|---|---|---|---|
| `--bg` | #f6f8fc | #0b1222 | Page background |
| `--surface` | #ffffff | #121c33 | Cards, header, panels |
| `--fg` | #0f1a2e | #e8edf8 | Main text |
| `--muted` | #55627a | #9aa8c4 | Secondary text, labels |
| `--line` | #dfe5f0 | #24324f | Borders, dividers |
| `--chip` | #e8eefb | #1a2a4d | Pills, soft fills, hover backgrounds |
| `--navy` | #1c4b9b | — | Primary buttons (`.order`, `.btn-navy`), active tab |
| `--blue` | #0059e0 | #4d8dff | Links, numbers, eyebrow text, focus ring |
| `--ok` | #128a5a | #3ccf8e | Success, "free plan" badge |
| `--ink` | #0c1430 | — | Hero and footer background |
| Hot / badge | #c8355e | — | "ពេញនិយម", "ថ្មី", sold labels |
| Telegram | #1877ab | — | Telegram buttons |

Blue buttons on hover in dark mode use #2563d9 (white text stays above 4.5:1). Text contrast is at least 4.5:1 in both themes; check new sections with an accessibility scan.

## Typography
- Body: MiSans Khmer (self-hosted) with Kantumruy Pro / Noto Sans Khmer fallback, 16px, line height 1.7.
- Display (numbers, English headings): Sora 700–800.
- Sizes: eyebrow 13px uppercase; card title 17px; section title `clamp(24px, 3.4vw, 34px)`; banner title `clamp(26px, 3.4vw, 36px)`; big numbers 20–40px tabular.

## Spacing and shape
- Content width 1120px, side gutter 16px. Sections 64px apart (44px on phones).
- Card padding 18–22px; grid gaps 14–20px.
- Radius: 8–10px buttons and inputs, 14–18px cards, 24px banners, 999px pills.
- Shadows: soft only (`0 10px 30px rgba(10,30,80,.06)` cards; banner phone `0 30px 60px rgba(10,30,80,.35)`).

## Components
- **Feature banner** (`.appban`): 24px-radius panel, soft blue gradient (light `#eaf1ff → #f4f8ff → #e3ecff`; dark `#14214a → #121c33 → #18295a`). Left: eyebrow, bold title, one-paragraph lead, a white "get" box (`.appban-get`) holding the action. Right: tilted phone (`.phone` + `.app` dark dashboard cards) with three floating shapes. Used by the ADS BOX System section and the "ផេកខ្មែរ & ផេកប៊ូសឡាយ" tab.
- **Service card** (`.svc`): picture on top (16:9), title, short text, price line, then "លម្អិត" (outline) and "ចាប់អារម្មណ៍សេវាកម្ម" (navy). Groups show 4 cards, the rest behind a "See more" outline button.
- **Page card** (`.svc.pg`): round profile picture (first-letter fallback), type pill, two stat boxes (followers, price), "មើល Page" + order button; banner-style gradient background.
- **Tabs**: pill buttons; active = navy fill.
- **Dashboard preview** (`.app`): always dark (`#121831` background, `#7c6cff` accent, `#3ccf8e` good, `#ff6b81` alert), in both themes.

## Imagery and icons
- Real screenshots, client logos and page profile pictures over illustrations. Service cards use uploaded pictures or the auto-made picture.
- Uploaded images are shrunk at build time (WebP) — upload normal photos in the admin panel.
- Icons: simple CSS shapes and the Telegram mark; no icon font.
