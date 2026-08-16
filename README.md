# gh-traffic-tracker

Daily GitHub repo clone/view traffic history, with an email alert whenever
the clone count rises.

GitHub only retains 14 days of traffic data, and only ever exposes it as
**aggregate daily counts** — there's no per-clone identity to capture, since
cloning a public repo over HTTPS/SSH is anonymous and requires no
authentication. There's also no clone-triggered webhook or notification of
any kind. So this is the practical ceiling of what's possible: poll once a
day, keep the numbers permanently (since GitHub itself won't), and email
when the count moves.

Captures all four traffic endpoints GitHub exposes, since that's genuinely
everything available:
- Daily clone count + unique cloners
- Daily view count + unique visitors
- Top referrers (rolling 14-day window)
- Top-visited paths in the repo (rolling 14-day window)

This is a small standalone Cloudflare Worker + D1 database — intentionally
not part of any other project, so it can point at any repo(s) you own
without being coupled to that repo's own deploy. Tracks any number of
repos, added/removed via the `tracked_repos` table (same "config lives in
D1" pattern as the subnets table in pq-radar) — no redeploy needed to add
or drop a repo.

## Setup

1. **Install dependencies**
   ```
   npm install
   ```

2. **Log in to Cloudflare**
   ```
   npx wrangler login
   ```

3. **Create a D1 database**
   ```
   npx wrangler d1 create gh-traffic-tracker
   ```
   Copy the `database_id` from the output into `wrangler.jsonc`'s
   `d1_databases[0].database_id`.

4. **Run migrations**
   ```
   npx wrangler d1 migrations apply gh-traffic-tracker --remote
   ```

5. **Set secrets**
   ```
   npx wrangler secret put GITHUB_TOKEN
   npx wrangler secret put RESEND_API_KEY
   npx wrangler secret put TRIGGER_SECRET
   ```
   - `GITHUB_TOKEN` — a **fine-grained** Personal Access Token
     (github.com → Settings → Developer settings → Personal access tokens →
     Fine-grained tokens), scoped to "Only select repositories" — pick every
     repo you plan to track (up to 50) — with read access to
     "Administration" (this is what the traffic API requires — equivalent to
     push access; GitHub doesn't offer anything narrower for it). Don't
     reuse a broad personal token here. Adding a new repo to `tracked_repos`
     later also means adding it to this token's repository list.
   - `RESEND_API_KEY` — sign up at resend.com (free tier is plenty), create
     an API key. The default `NOTIFY_FROM_EMAIL` (`onboarding@resend.dev`) is
     Resend's shared sandbox sender and works without verifying your own
     domain; swap it once you've verified one, if you want.
   - `TRIGGER_SECRET` — a secret you make up, gates the manual `/trigger`
     endpoint used for on-demand testing (the real schedule is the cron).

6. **Set `NOTIFY_EMAIL`** in `wrangler.jsonc`'s `vars` — where alerts go.
   (All tracked repos currently notify the same address; there's no
   per-repo override.)

7. **Add the repo(s) to track** — `tracked_repos` is empty until you add
   rows:
   ```
   npx wrangler d1 execute gh-traffic-tracker --remote --command \
     "INSERT INTO tracked_repos (repo, enabled, added_at) VALUES ('owner/repo', 1, datetime('now'))"
   ```
   Remove one by setting `enabled = 0` (keeps its history) or deleting the
   row outright. Remember: `GITHUB_TOKEN` also needs access to whatever you
   add here.

8. **Deploy**
   ```
   npx wrangler deploy
   ```

9. **Test it on demand** (don't wait for the daily cron):
   ```
   curl -X POST https://<your-worker>.workers.dev/trigger \
     -H "Authorization: Bearer <your TRIGGER_SECRET>"
   ```
   Polls every enabled repo in `tracked_repos` in one run; the response
   summarizes each one.

Runs automatically once a day thereafter (`triggers.crons` in
`wrangler.jsonc`, default `0 6 * * *` UTC).

## License

Apache License 2.0 — see [LICENSE](LICENSE).
