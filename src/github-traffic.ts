import { Env } from "./env";

interface DailyPoint {
  timestamp: string;
  count: number;
  uniques: number;
}
interface ReferrerRow {
  referrer: string;
  count: number;
  uniques: number;
}
interface PathRow {
  path: string;
  title: string;
  count: number;
  uniques: number;
}
interface TrackedRepo {
  repo: string;
}

const GITHUB_API = "https://api.github.com";

async function ghGet<T>(env: Env, path: string): Promise<T> {
  const res = await fetch(`${GITHUB_API}${path}`, {
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      // GitHub's API rejects requests with no User-Agent.
      "User-Agent": "gh-traffic-tracker",
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub API ${path} failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

/** Discovers every repo GITHUB_TOKEN can see (owned, collaborator, or org
 *  member — no affiliation filter, since a narrower one would silently miss
 *  org-owned repos) and adds any not already in tracked_repos (INSERT OR
 *  IGNORE — never touches enabled=0 rows, so a repo you've deliberately
 *  turned off stays off even if rediscovered). Called at the start of every
 *  poll so newly created repos get picked up automatically. Returns how
 *  many repos were seen and how many were newly added, for visibility —
 *  this used to fail silently, which made "why isn't X showing up" hard to
 *  debug from outside. */
async function syncTrackedRepos(env: Env): Promise<{ seen: number; added: number }> {
  const discovered: string[] = [];
  let page = 1;
  while (true) {
    const repos = await ghGet<{ full_name: string }[]>(env, `/user/repos?per_page=100&page=${page}`);
    discovered.push(...repos.map((r) => r.full_name));
    if (repos.length < 100) break;
    page++;
  }

  let added = 0;
  if (discovered.length > 0) {
    const now = new Date().toISOString();
    const results = await env.DB.batch(
      discovered.map((repo) =>
        env.DB
          .prepare("INSERT OR IGNORE INTO tracked_repos (repo, enabled, added_at) VALUES (?, 1, ?)")
          .bind(repo, now)
      )
    );
    added = results.filter((r) => r.meta.changes > 0).length;
  }

  return { seen: discovered.length, added };
}

async function sendEmail(env: Env, subject: string, html: string): Promise<void> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.NOTIFY_FROM_EMAIL,
      to: [env.NOTIFY_EMAIL],
      subject,
      html,
    }),
  });
  if (!res.ok) {
    console.error(`Resend send failed: ${res.status} ${await res.text()}`);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

function buildEmailHtml(
  repo: string,
  latest: DailyPoint,
  clones: { count: number; uniques: number },
  views: { count: number; uniques: number },
  referrers: ReferrerRow[],
  paths: PathRow[]
): string {
  const referrerRows = referrers
    .slice(0, 10)
    .map((r) => `<tr><td>${escapeHtml(r.referrer)}</td><td>${r.count}</td><td>${r.uniques}</td></tr>`)
    .join("");
  const pathRows = paths
    .slice(0, 10)
    .map((p) => `<tr><td>${escapeHtml(p.path)}</td><td>${p.count}</td><td>${p.uniques}</td></tr>`)
    .join("");
  return `
    <h2>New clone activity on ${escapeHtml(repo)}</h2>
    <p><b>${latest.count}</b> clone(s) (${latest.uniques} unique) on ${latest.timestamp.slice(0, 10)}.</p>
    <p>14-day totals: ${clones.count} clones (${clones.uniques} unique) &middot; ${views.count} views (${views.uniques} unique).</p>
    <h3>Top referrers (14-day window)</h3>
    <table border="1" cellpadding="4" cellspacing="0"><tr><th>Referrer</th><th>Count</th><th>Unique</th></tr>${referrerRows || "<tr><td colspan=3>none</td></tr>"}</table>
    <h3>Top paths (14-day window)</h3>
    <table border="1" cellpadding="4" cellspacing="0"><tr><th>Path</th><th>Count</th><th>Unique</th></tr>${pathRows || "<tr><td colspan=3>none</td></tr>"}</table>
    <p style="color:#888;font-size:12px;">GitHub only exposes these as aggregate daily counts — there's no per-clone identity to report, cloning a public repo is anonymous.</p>
  `;
}

export interface RepoPollResult {
  repo: string;
  clonesTotal14d: number;
  viewsTotal14d: number;
  emailSent: boolean;
  error?: string;
}

export interface PollResult {
  discoverySeen: number;
  discoveryAdded: number;
  discoveryError?: string;
  repos: RepoPollResult[];
  emailsSent: number;
}

/** Polls and stores traffic for one repo, emailing if its clone count rose. */
async function pollOneRepo(env: Env, repo: string): Promise<RepoPollResult> {
  const capturedAt = new Date().toISOString();

  const [clones, views, referrers, paths] = await Promise.all([
    ghGet<{ count: number; uniques: number; clones: DailyPoint[] }>(env, `/repos/${repo}/traffic/clones`),
    ghGet<{ count: number; uniques: number; views: DailyPoint[] }>(env, `/repos/${repo}/traffic/views`),
    ghGet<ReferrerRow[]>(env, `/repos/${repo}/traffic/popular/referrers`),
    ghGet<PathRow[]>(env, `/repos/${repo}/traffic/popular/paths`),
  ]);

  // (repo, date) is UNIQUE — INSERT OR IGNORE so re-polling the same day
  // never creates a duplicate row; first write for a given (repo, date) wins.
  if (clones.clones.length > 0) {
    await env.DB.batch(
      clones.clones.map((c) =>
        env.DB
          .prepare("INSERT OR IGNORE INTO gh_clone_history (repo, date, count, uniques, captured_at) VALUES (?, ?, ?, ?, ?)")
          .bind(repo, c.timestamp, c.count, c.uniques, capturedAt)
      )
    );
  }
  if (views.views.length > 0) {
    await env.DB.batch(
      views.views.map((v) =>
        env.DB
          .prepare("INSERT OR IGNORE INTO gh_view_history (repo, date, count, uniques, captured_at) VALUES (?, ?, ?, ?, ?)")
          .bind(repo, v.timestamp, v.count, v.uniques, capturedAt)
      )
    );
  }

  // Referrers/paths aren't day-keyed by GitHub, only ever a rolling 14-day
  // "top 10" per repo — log each poll's full snapshot, timestamped.
  if (referrers.length > 0) {
    await env.DB.batch(
      referrers.map((r) =>
        env.DB
          .prepare("INSERT INTO gh_referrer_snapshots (repo, captured_at, referrer, count, uniques) VALUES (?, ?, ?, ?, ?)")
          .bind(repo, capturedAt, r.referrer, r.count, r.uniques)
      )
    );
  }
  if (paths.length > 0) {
    await env.DB.batch(
      paths.map((p) =>
        env.DB
          .prepare("INSERT INTO gh_path_snapshots (repo, captured_at, path, title, count, uniques) VALUES (?, ?, ?, ?, ?, ?)")
          .bind(repo, capturedAt, p.path, p.title ?? null, p.count, p.uniques)
      )
    );
  }

  // GitHub's "today" bucket keeps accumulating through the day, so treat any
  // rise in the most recent day's count over what we last emailed about (for
  // this repo) as new activity worth notifying on — not just a new date.
  const latest = clones.clones[clones.clones.length - 1];
  let notified = false;
  if (latest && latest.count > 0) {
    const state = await env.DB
      .prepare("SELECT last_notified_date, last_notified_count FROM gh_notify_state WHERE repo = ?")
      .bind(repo)
      .first<{ last_notified_date: string | null; last_notified_count: number }>();
    const alreadyNotified = state && state.last_notified_date === latest.timestamp && state.last_notified_count >= latest.count;

    if (!alreadyNotified) {
      const html = buildEmailHtml(repo, latest, clones, views, referrers, paths);
      await sendEmail(env, `${repo}: ${latest.count} clone(s) on ${latest.timestamp.slice(0, 10)}`, html);
      await env.DB
        .prepare(
          "INSERT INTO gh_notify_state (repo, last_notified_date, last_notified_count) VALUES (?, ?, ?) " +
            "ON CONFLICT(repo) DO UPDATE SET last_notified_date = excluded.last_notified_date, last_notified_count = excluded.last_notified_count"
        )
        .bind(repo, latest.timestamp, latest.count)
        .run();
      notified = true;
    }
  }

  return { repo, clonesTotal14d: clones.count, viewsTotal14d: views.count, emailSent: notified };
}

/** Daily poll entrypoint: auto-discovers every repo GITHUB_TOKEN owns (see
 *  syncTrackedRepos), then polls every enabled repo in tracked_repos —
 *  enabled=0 rows stay excluded even if rediscovered, so turning a repo off
 *  sticks. One repo failing doesn't stop the others. Returns structured
 *  data rather than one long string — the caller (index.ts) decides how
 *  much of it to show; full per-repo detail also goes to console.log for
 *  the cron's own logs regardless of what the caller does with it. */
export async function pollGithubTraffic(env: Env): Promise<PollResult> {
  let discoverySeen = 0;
  let discoveryAdded = 0;
  let discoveryError: string | undefined;
  try {
    const { seen, added } = await syncTrackedRepos(env);
    discoverySeen = seen;
    discoveryAdded = added;
  } catch (err) {
    // Surfaced, not swallowed — a discovery failure (bad token scope, wrong
    // permission, rate limit) used to disappear into console.error only,
    // with no way to tell from outside why the repo list wasn't growing.
    discoveryError = String(err);
  }

  const tracked = await env.DB.prepare("SELECT repo FROM tracked_repos WHERE enabled = 1").all<TrackedRepo>();

  const repos: RepoPollResult[] = [];
  for (const { repo } of tracked.results) {
    try {
      repos.push(await pollOneRepo(env, repo));
    } catch (err) {
      repos.push({ repo, clonesTotal14d: 0, viewsTotal14d: 0, emailSent: false, error: String(err) });
    }
  }

  console.log(
    `github-traffic: discovery saw ${discoverySeen}, added ${discoveryAdded}` +
      (discoveryError ? `, FAILED: ${discoveryError}` : "") +
      ` | polled ${repos.length} repo(s): ` +
      repos.map((r) => `${r.repo}=${r.error ? "ERROR: " + r.error : r.clonesTotal14d + "c/" + r.viewsTotal14d + "v"}`).join(", ")
  );

  return { discoverySeen, discoveryAdded, discoveryError, repos, emailsSent: repos.filter((r) => r.emailSent).length };
}
