import { Env } from "./env";
import { pollGithubTraffic } from "./github-traffic";

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

    if (url.pathname === "/health") {
      return Response.json({ status: "ok" });
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
