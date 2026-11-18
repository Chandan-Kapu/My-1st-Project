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

// Per-IP rate limits on the routes that spend NVIDIA credits (bindings are in wrangler.toml).
const limiters = {
  "POST /api/chat": "CHAT_LIMITER",
  "POST /api/run": "RUN_LIMITER",
};

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    const route = `${request.method} ${pathname}`;
    const handler = routes[route];
    if (handler) {
      const limiter = env[limiters[route]];
      if (limiter) {
        const { success } = await limiter.limit({ key: request.headers.get("cf-connecting-ip") ?? "unknown" });
        if (!success) return json({ error: "Too many requests. Wait a minute and try again." }, 429);
      }
      try {
        return await handler({ request, env, ctx });
      } catch (err) {
        console.error(`${route} failed:`, err);
        return json({ error: "Something went wrong on the server." }, 500);
      }
    }
    if (pathname.startsWith("/api/")) return json({ error: "Not found." }, 404);
    return env.ASSETS.fetch(request);
  },
};
