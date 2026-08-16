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
    <p style="color:#888;font-size:12px;">GitHub only exposes these as aggregate daily counts \\u2014 there's no per-clone identity to report, cloning a public repo is anonymous.</p>
  `;
}

/** Daily poll: pulls all four traffic endpoints GitHub exposes, appends
 *  anything new to D1 (GitHub itself only retains 14 days, so this is the
 *  permanent record), and emails if the most recent day's clone count
 *  increased since the last time this ran. Returns a short summary string
 *  for logging/manual-trigger responses. */
export async function pollGithubTraffic(env: Env): Promise<string> {
  const capturedAt = new Date().toISOString();

  const [clones, views, referrers, paths] = await Promise.all([
    ghGet<{ count: number; uniques: number; clones: DailyPoint[] }>(env, `/repos/${env.GITHUB_REPO}/traffic/clones`),
    ghGet<{ count: number; uniques: number; views: DailyPoint[] }>(env, `/repos/${env.GITHUB_REPO}/traffic/views`),
    ghGet<ReferrerRow[]>(env, `/repos/${env.GITHUB_REPO}/traffic/popular/referrers`),
    ghGet<PathRow[]>(env, `/repos/${env.GITHUB_REPO}/traffic/popular/paths`),
  ]);

  // date is UNIQUE — INSERT OR IGNORE so re-polling the same day never
  // creates a duplicate row; first write for a given date wins.
  if (clones.clones.length > 0) {
    await env.DB.batch(
      clones.clones.map((c) =>
        env.DB
          .prepare("INSERT OR IGNORE INTO gh_clone_history (date, count, uniques, captured_at) VALUES (?, ?, ?, ?)")
          .bind(c.timestamp, c.count, c.uniques, capturedAt)
      )
    );
  }
  if (views.views.length > 0) {
    await env.DB.batch(
      views.views.map((v) =>
        env.DB
          .prepare("INSERT OR IGNORE INTO gh_view_history (date, count, uniques, captured_at) VALUES (?, ?, ?, ?)")
          .bind(v.timestamp, v.count, v.uniques, capturedAt)
      )
    );
  }

  // Referrers/paths aren't day-keyed by GitHub, only ever a rolling 14-day
  // "top 10" — log each poll's full snapshot, timestamped.
  if (referrers.length > 0) {
    await env.DB.batch(
      referrers.map((r) =>
        env.DB
          .prepare("INSERT INTO gh_referrer_snapshots (captured_at, referrer, count, uniques) VALUES (?, ?, ?, ?)")
          .bind(capturedAt, r.referrer, r.count, r.uniques)
      )
    );
  }
  if (paths.length > 0) {
    await env.DB.batch(
      paths.map((p) =>
        env.DB
          .prepare("INSERT INTO gh_path_snapshots (captured_at, path, title, count, uniques) VALUES (?, ?, ?, ?, ?)")
          .bind(capturedAt, p.path, p.title ?? null, p.count, p.uniques)
      )
    );
  }

  // GitHub's "today" bucket keeps accumulating through the day, so treat any
  // rise in the most recent day's count over what we last emailed about as
  // new activity worth notifying on — not just a brand-new date.
  const latest = clones.clones[clones.clones.length - 1];
  let notified = false;
  if (latest && latest.count > 0) {
    const state = await env.DB
      .prepare("SELECT last_notified_date, last_notified_count FROM gh_notify_state WHERE id = 1")
      .first<{ last_notified_date: string | null; last_notified_count: number }>();
    const alreadyNotified = state && state.last_notified_date === latest.timestamp && state.last_notified_count >= latest.count;

    if (!alreadyNotified) {
      const html = buildEmailHtml(env.GITHUB_REPO, latest, clones, views, referrers, paths);
      await sendEmail(env, `${env.GITHUB_REPO}: ${latest.count} clone(s) on ${latest.timestamp.slice(0, 10)}`, html);
      await env.DB
        .prepare("UPDATE gh_notify_state SET last_notified_date = ?, last_notified_count = ? WHERE id = 1")
        .bind(latest.timestamp, latest.count)
        .run();
      notified = true;
    }
  }

  return `polled ${env.GITHUB_REPO}: ${clones.count} clones / ${views.count} views (14d), latest day ${latest?.timestamp?.slice(0, 10) ?? "n/a"} = ${latest?.count ?? 0} clone(s), email sent: ${notified}`;
}
