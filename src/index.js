// Worker entry: routes /api/* to handlers; everything else is served from public/ via static assets.
import { onRequestGet as config } from "./api/config.js";
import { onRequestPost as chat } from "./api/chat.js";
import { onRequestGet as health } from "./api/health.js";
import { onRequestPost as run } from "./api/run.js";
import { onRequestGet as runs } from "./api/runs.js";
import { json } from "./lib/shared.js";

const routes = {
  "GET /api/config": config,
  "POST /api/chat": chat,
  "GET /api/health": health,
  "POST /api/run": run,
  "GET /api/runs": runs,
};

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    const handler = routes[`${request.method} ${pathname}`];
    if (handler) return handler({ request, env, ctx });
    if (pathname.startsWith("/api/")) return json({ error: "Not found." }, 404);
    return env.ASSETS.fetch(request);
  },
};
