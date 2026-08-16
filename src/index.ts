import { Env } from "./env";
import { pollGithubTraffic } from "./github-traffic";
import { DASHBOARD_HTML } from "./dashboard";

interface DailyRow {
  date: string;
  count: number;
  uniques: number;
}
interface ReferrerSnapshotRow {
  referrer: string;
  count: number;
  uniques: number;
}
interface PathSnapshotRow {
  path: string;
  title: string | null;
  count: number;
  uniques: number;
}

function checkAuth(request: Request, env: Env): Response | null {
  const auth = request.headers.get("Authorization");
  if (auth !== `Bearer ${env.TRIGGER_SECRET}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/" && request.method === "GET") {
      return new Response(DASHBOARD_HTML, {
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
      });
    }

    if (url.pathname === "/health") {
      return Response.json({ status: "ok" });
    }

    // Everything the dashboard needs for one repo, in one call: the full
    // stored history (not just GitHub's 14-day window — that's the entire
    // point of storing it), the most recent referrer/path snapshot, and
    // all-time cumulative totals. ?repo= picks which tracked repo; defaults
    // to the first one if omitted.
    if (url.pathname === "/api/stats" && request.method === "GET") {
      const authError = checkAuth(request, env);
      if (authError) return authError;

      const repos = await env.DB.prepare("SELECT repo FROM tracked_repos WHERE enabled = 1 ORDER BY repo").all<{ repo: string }>();
      if (repos.results.length === 0) {
        return Response.json({ error: "no tracked repos configured" }, { status: 404 });
      }
      const repoParam = url.searchParams.get("repo");
      const repo = repoParam && repos.results.some((r) => r.repo === repoParam) ? repoParam : repos.results[0].repo;

      const [clones, views, referrers, paths, totals] = await Promise.all([
        env.DB.prepare("SELECT date, count, uniques FROM gh_clone_history WHERE repo = ? ORDER BY date ASC").bind(repo).all<DailyRow>(),
        env.DB.prepare("SELECT date, count, uniques FROM gh_view_history WHERE repo = ? ORDER BY date ASC").bind(repo).all<DailyRow>(),
        env.DB.prepare(
          `SELECT referrer, count, uniques FROM gh_referrer_snapshots
           WHERE repo = ? AND captured_at = (SELECT MAX(captured_at) FROM gh_referrer_snapshots WHERE repo = ?)
           ORDER BY count DESC`
        )
          .bind(repo, repo)
          .all<ReferrerSnapshotRow>(),
        env.DB.prepare(
          `SELECT path, title, count, uniques FROM gh_path_snapshots
           WHERE repo = ? AND captured_at = (SELECT MAX(captured_at) FROM gh_path_snapshots WHERE repo = ?)
           ORDER BY count DESC`
        )
          .bind(repo, repo)
          .all<PathSnapshotRow>(),
        env.DB.prepare(
          `SELECT
             (SELECT COALESCE(SUM(count), 0) FROM gh_clone_history WHERE repo = ?) AS clone_count_sum,
             (SELECT COALESCE(SUM(uniques), 0) FROM gh_clone_history WHERE repo = ?) AS clone_uniques_sum,
             (SELECT COALESCE(SUM(count), 0) FROM gh_view_history WHERE repo = ?) AS view_count_sum,
             (SELECT COALESCE(SUM(uniques), 0) FROM gh_view_history WHERE repo = ?) AS view_uniques_sum`
        )
          .bind(repo, repo, repo, repo)
          .first<{ clone_count_sum: number; clone_uniques_sum: number; view_count_sum: number; view_uniques_sum: number }>(),
      ]);

      return Response.json({
        repos: repos.results.map((r) => r.repo),
        repo,
        clones: clones.results,
        views: views.results,
        referrers: referrers.results,
        paths: paths.results,
        totals,
      });
    }

    // One row per tracked repo with its all-time totals — the comparison
    // view, as opposed to /api/stats which is one repo's full detail.
    if (url.pathname === "/api/repos-summary" && request.method === "GET") {
      const authError = checkAuth(request, env);
      if (authError) return authError;

      const summary = await env.DB.prepare(
        `SELECT
           t.repo AS repo,
           t.enabled AS enabled,
           COALESCE((SELECT SUM(count) FROM gh_clone_history WHERE repo = t.repo), 0) AS clone_count_sum,
           COALESCE((SELECT SUM(uniques) FROM gh_clone_history WHERE repo = t.repo), 0) AS clone_uniques_sum,
           COALESCE((SELECT SUM(count) FROM gh_view_history WHERE repo = t.repo), 0) AS view_count_sum,
           COALESCE((SELECT SUM(uniques) FROM gh_view_history WHERE repo = t.repo), 0) AS view_uniques_sum,
           (SELECT MAX(date) FROM gh_clone_history WHERE repo = t.repo) AS latest_date
         FROM tracked_repos t
         ORDER BY clone_count_sum DESC, t.repo ASC`
      ).all();

      return Response.json({ repos: summary.results });
    }

    // Manual on-demand poll, for testing — the real schedule is the daily
    // cron in wrangler.jsonc's triggers.crons.
    if (url.pathname === "/trigger" && request.method === "POST") {
      const authError = checkAuth(request, env);
      if (authError) return authError;

      try {
        const summary = await pollGithubTraffic(env);
        return Response.json({ ok: true, summary });
      } catch (err) {
        return Response.json({ ok: false, error: String(err) }, { status: 500 });
      }
    }

    return new Response("not found", { status: 404 });
  },

  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      pollGithubTraffic(env)
        .then((summary) => console.log(`cron: ${summary}`))
        .catch((err) => console.error("cron: github traffic poll failed:", err))
    );
  },
};
