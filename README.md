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
not part of any other project, so it can point at any repo you own without
being coupled to that repo's own deploy.

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
     Fine-grained tokens), scoped to just the one repo you're tracking, with
     read access to "Administration" (this is what the traffic API requires —
     equivalent to push access; GitHub doesn't offer anything narrower for
     it). Don't reuse a broad personal token here.
   - `RESEND_API_KEY` — sign up at resend.com (free tier is plenty), create
     an API key. The default `NOTIFY_FROM_EMAIL` (`onboarding@resend.dev`) is
     Resend's shared sandbox sender and works without verifying your own
     domain; swap it once you've verified one, if you want.
   - `TRIGGER_SECRET` — a secret you make up, gates the manual `/trigger`
     endpoint used for on-demand testing (the real schedule is the cron).

6. **Set `GITHUB_REPO` and `NOTIFY_EMAIL`** in `wrangler.jsonc`'s `vars` —
   `GITHUB_REPO` is `owner/repo`, `NOTIFY_EMAIL` is where alerts go.

7. **Deploy**
   ```
   npx wrangler deploy
   ```

8. **Test it on demand** (don't wait for the daily cron):
   ```
   curl -X POST https://<your-worker>.workers.dev/trigger \
     -H "Authorization: Bearer <your TRIGGER_SECRET>"
   ```

Runs automatically once a day thereafter (`triggers.crons` in
`wrangler.jsonc`, default `0 6 * * *` UTC).

## License

Apache License 2.0 — see [LICENSE](LICENSE).
