# Daily knowledge auto-publisher

Two Khmer knowledge articles a day on https://adsbox.agency/knowledge/, at 07:00 and 17:00 Cambodia time (UTC+7), with no manual approval.

## How it works

1. A **Claude scheduled task** (in the Claude app, "ADS BOX daily knowledge articles") starts a fresh session at 06:52 and 16:52 Cambodia time.
2. The session clones this repo and runs `python3 tools/autopost/plan.py --out /tmp/brief.json`. The planner:
   - checks `content/autopost/settings.json` (paused? slot switched off? already done today?),
   - opens the slot from 15 minutes before to 90 minutes after its time, and never publishes outside that window (no catch-up),
   - picks the least recently used category for the slot (`categories.json`) and an angle,
   - writes a brief with the verified facts (`facts.md`), recent titles, related articles, writing rules and the output format.
3. Claude writes the article as JSON (`/tmp/draft.json`) following the brief.
4. `python3 tools/autopost/publish.py --brief /tmp/brief.json --draft /tmp/draft.json --push`:
   - validates: Khmer, length, structure, SEO fields, slug, links, no unconfirmed prices or statistics, no guarantees, testimonials, client names or rule-breaking advice, no duplicate title, keyword or body;
   - on errors exits 2 and prints them; Claude fixes the draft and tries again, up to `max_attempts`;
   - on success pulls the latest `main`, re-checks that the slot is still open (so two runs can never both publish), writes `content/articles/<slug>.md` (live mode) or `content/autopost/dry-runs/…` (dry-run mode), records it in `history.json`, commits and pushes;
   - after the last failed attempt: `publish.py --brief … --record-failure "<reason>" --attempts N --push` records the failure.
5. The push starts the existing **Build site** GitHub Action, which builds the article page, cover picture, SEO tags, Schema.org data and sitemap, and publishes the site.
6. **Auto-post alerts** (GitHub Action) sends a Telegram message when a failure is recorded. Every hour at :50 it also checks whether a slot is overdue with no article (for example if the scheduled task did not run) and alerts once.

## Settings (admin panel: app.pagescms.org → "បោះពុម្ពស្វ័យប្រវត្តិ · ការកំណត់")

| Setting | Meaning |
|---|---|
| enabled | Off = pause everything (the task still starts but publishes nothing). |
| mode | `live` publishes; `dry_run` writes and validates but never shows anything on the website. |
| morning / evening | Switch each slot on or off and set its time (HH:MM, Cambodia time). |
| early / late minutes | The publishing window around each time. Outside it, nothing is published. |
| alert_after_minutes | How long after the time the watchdog waits before alerting that no article exists. |
| max_attempts | How many times Claude may fix and retry a draft that fails validation. |
| min / max Khmer chars | Body length limits (about 300–600 Khmer words). |

**Changing a time:** change it in settings *and* in the scheduled task's schedule (ask Claude: "move the evening article to 18:00"). The task should start about 8 minutes before the time.

**Unpublishing or editing an article:** admin panel → "ចំណេះដឹង (អត្ថបទ)", open it, switch on "ព្រាង / ដកចេញពីវេបសាយ" (hides it without deleting) or edit the text, then Save.

**Facts:** `content/autopost/facts.md` is the only source of ADS BOX facts. When a service, price or feature changes, update it (edit on GitHub, or ask Claude).

## Required setup

- GitHub repository secrets (Settings → Secrets and variables → Actions → New repository secret):
  - `TELEGRAM_BOT_TOKEN`: from @BotFather (`/newbot`).
  - `TELEGRAM_CHAT_ID`: send any message to your bot, then open `https://api.telegram.org/bot<TOKEN>/getUpdates` and copy `message.chat.id`.
  - Test: Actions → "Auto-post alerts" → Run workflow. Without these secrets the alert job fails and GitHub emails the repo owner instead.
- The Claude scheduled task must be allowed to run without stopping for approval ("Automatically approve" in the task's settings), or each run waits for someone to approve.

## Troubleshooting

| Symptom | Check |
|---|---|
| Telegram: "no article recorded" | Is the scheduled task enabled in Claude, and did it run? Open its last run. Usage limits or an approval prompt can stop it. |
| Telegram: "failed after N attempts" | History screen in the admin panel shows the error. Usually the AI draft kept failing a rule; the next slot runs normally. |
| Article recorded but not on the site | GitHub → Actions → "Build site": did it fail? Re-run it. |
| Want to stop for a while | Admin panel settings → switch off "enabled" (or pause the scheduled task in Claude). |

Tests: `python3 tools/autopost/test_autopost.py` (works on a temporary copy; changes nothing).
