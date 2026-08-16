export interface Env {
  DB: D1Database;
  // GITHUB_TOKEN needs read access to every repo listed in the tracked_repos
  // table (see migrations/0002_multi_repo.sql) — which repos to poll is D1
  // config now, not a fixed var, same pattern as subnets in pq-radar.
  GITHUB_TOKEN: string;
  RESEND_API_KEY: string;
  NOTIFY_EMAIL: string;
  NOTIFY_FROM_EMAIL: string;
  // Gates the manual /trigger endpoint (see index.ts) — the daily cron
  // doesn't need it, this is only for testing the poll on demand.
  TRIGGER_SECRET: string;
}
