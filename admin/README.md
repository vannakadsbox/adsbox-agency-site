# ADS BOX admin panel

A colourful admin panel for adsbox.agency with Google sign-in and team roles. It edits the same files as Pages CMS (`content/…`). Each save becomes a commit, and the "Build site" Action then rebuilds the website as before.

- **Runs on:** Cloudflare Workers (free plan), at `https://adsbox-admin.<your-subdomain>.workers.dev`, or at `admin.adsbox.agency` once a custom domain is added.
- **Sign-in:** Google. Only the owner (`ADMIN_OWNER_EMAIL`) and people the owner adds under **ក្រុមការងារ និងតួនាទី** can sign in.
- **Roles:**
  - Owner: everything.
  - Admin: all content; can view auto-publish settings.
  - Sales: services, pages for sale, pop-ups.
  - Writer: articles.
  - Designer: client logos and pop-ups.
  - Viewer: read-only.

  The server checks the role on every request, and removing someone takes effect immediately.
- **Data:** the team list is kept in Cloudflare KV, not in this public repo. Commit messages show the role and first name only, never email addresses.

## One-time setup (about 15 minutes)

1. **Cloudflare:** create a free account at dash.cloudflare.com.
   - Open **Workers & Pages** once and choose your free `workers.dev` subdomain.
   - Copy the **Account ID** (Workers & Pages → right side).
   - Create an **API token**: My Profile → API Tokens → Create token → template **"Edit Cloudflare Workers"**, then **add the permission** Account → Workers KV Storage → Edit.
2. **GitHub token for the panel:** on github.com go to Settings → Developer settings → Fine-grained tokens → Generate new token.
   - Repository access: only `vannakadsbox/adsbox-agency-site`.
   - Permissions: **Contents: Read and write**.
   - Expiration: 1 year. Set a reminder to renew it.
3. **Repository secrets:** in the repo go to Settings → Secrets and variables → Actions → New repository secret, and add:

   | Name | Value |
   |---|---|
   | `CLOUDFLARE_API_TOKEN` | the token from step 1 |
   | `CLOUDFLARE_ACCOUNT_ID` | the account ID from step 1 |
   | `ADMIN_OWNER_EMAIL` | the owner's Google email |
   | `ADMIN_GITHUB_TOKEN` | the token from step 2 |
   | `ADMIN_SESSION_SECRET` | 40+ random characters (a password-generator output) |
   | `ADMIN_GOOGLE_CLIENT_ID` | from step 5 (enter `pending` for now) |
   | `ADMIN_GOOGLE_CLIENT_SECRET` | from step 5 (enter `pending` for now) |

4. **First deploy:** Actions → **Deploy admin panel** → Run workflow. The log prints the panel address (`https://adsbox-admin.….workers.dev`).
5. **Google sign-in:** at console.cloud.google.com, create a project called "ADS BOX Admin".
   - APIs & Services → OAuth consent screen: set it up as **External**, app name "ADS BOX Admin", with your email. Add your team's Gmail addresses as test users, or click **Publish app**.
   - Credentials → Create credentials → **OAuth client ID** → Web application. Set the **Authorized redirect URI** to `https://<panel address>/auth/callback`.
   - Put the Client ID and Client secret into the two `ADMIN_GOOGLE_…` secrets, then run the deploy workflow again.
6. Open the panel, sign in with Google, and add your team under **👥 ក្រុមការងារ និងតួនាទី**.

**Optional custom domain `admin.adsbox.agency`:** in Cloudflare go to Workers → adsbox-admin → Settings → Domains & Routes. This needs the domain's DNS to be on Cloudflare. Then add `https://admin.adsbox.agency/auth/callback` to the Google redirect URIs.

## Developing

```
cd admin
npm ci
npm test                 # every role × every section, saves, conflicts, uploads, sign-in
node test/preview.js     # local preview with a fake GitHub (nothing is sent anywhere)
```

To see the local preview signed in, make a cookie with `makeSession({ SESSION_SECRET: "preview-secret" }, email)` from `src/auth.js`.
