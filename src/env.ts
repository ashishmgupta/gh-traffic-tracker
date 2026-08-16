export interface Env {
  DB: D1Database;
  GITHUB_TOKEN: string;
  GITHUB_REPO: string;
  RESEND_API_KEY: string;
  NOTIFY_EMAIL: string;
  NOTIFY_FROM_EMAIL: string;
  // Gates the manual /trigger endpoint (see index.ts) — the daily cron
  // doesn't need it, this is only for testing the poll on demand.
  TRIGGER_SECRET: string;
}
