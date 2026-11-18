# Temperature Playground

One prompt runs three times, at temperature **0**, **0.7** and **1.5**, with the outputs side by side. You pick the model size (3B → 405B). Every run is logged to Supabase so you can compare later.

- **Frontend:** static HTML/CSS/JS in `public/`
- **Backend:** a Cloudflare Worker (`src/index.js`) that serves `public/` as static assets and routes `/api/*` to `src/api/`
  - `GET /api/config`: models, temperatures, and whether keys are set
  - `POST /api/chat`: `{ prompt }` or `{ messages, temperature?, maxTokens? }` → one chat request to `nvidia/nemotron-3.5-lightning-30b-a3b`
  - `POST /api/run`: `{ prompt, model, maxTokens }` → runs 3 temperatures in parallel via NVIDIA NIM, then logs the run
  - `GET /api/runs`: the 20 most recent runs from this browser (`?id=<run id>` returns one run with its outputs)
  - `GET /api/health`: `{ ok }`, or the full setup report with the `HEALTH_TOKEN` (see below)
- **LLM:** NVIDIA's OpenAI-compatible API (`integrate.api.nvidia.com`)
- **DB:** Supabase, reached through its REST API with `fetch` (no SDK needed)

Without an `NVIDIA_API_KEY`, the site runs in **mock mode** on `localhost`, so you can try the UI before you have keys. Mock outputs aren't saved. A deployed site with no key returns 503 instead of fake answers, unless you set the variable `MOCK_MODE=true`.

## Run locally

```bash
npm install
cp .dev.vars.example .dev.vars   # fill in keys, or leave blank for mock mode
npm run dev                      # http://localhost:8787
```

## Send a chat request

Once `NVIDIA_API_KEY` is set as a Cloudflare secret:

```bash
curl -X POST https://my-1st-project.<your-subdomain>.workers.dev/api/chat \
  -H 'content-type: application/json' \
  -d '{"prompt": "Explain temperature in LLMs in one sentence."}'
```

Response: `{ "model", "temperature", "output", "reasoning", "finishReason", "tokens", "latencyMs" }`. Without the secret, `/api/chat` returns 503. Only `user` and `assistant` messages are accepted, and the body must be `application/json`, at most 64 KB.

## Set up Supabase

1. Create a project at supabase.com.
2. Run `supabase/schema.sql` in the SQL editor. It creates:
   - `runs`: every **Run ×3** (prompt, model, and all three outputs)
   - `chat_logs`: every Chat box message and reply, including failed calls
   - `all_queries`: a view with both, one row per response: `select * from all_queries order by created_at desc;`
   Already set up? Run `supabase/schema.sql` again whenever it changes. It's safe to rerun, and the Worker needs the `runs.client_id` column it adds.
3. Copy the project URL and the **secret** key (`sb_secret_…`, under Settings → API Keys) into your secrets as `SUPABASE_URL` and `SUPABASE_SECRET_KEY`. Older projects can use the legacy **service_role** key as `SUPABASE_SERVICE_ROLE_KEY` instead. The publishable key is not needed.

## Check the setup

`/api/health` tells anyone only `{ "ok": true }` or `{ "ok": false }`. For the full report (which keys are set, whether the tables exist, and what's wrong), add a `HEALTH_TOKEN` secret with any long random value, then send it as a header:

```bash
curl https://my-1st-project.<your-subdomain>.workers.dev/api/health -H 'x-health-token: <your HEALTH_TOKEN>'
```

Error details from NVIDIA and Supabase go to Workers Logs. Visitors see a short, plain message instead.

## Deploy to Cloudflare Workers

**From GitHub (recommended):** Workers & Pages → Create → Import a repository → `My-1st-Project`.
- Project name: `my-1st-project` (must match `name` in `wrangler.toml`)
- Build command: leave empty
- Deploy command: `npx wrangler deploy`

Then add `NVIDIA_API_KEY`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY` and (optionally) `HEALTH_TOKEN` under the Worker's Settings → Variables and Secrets (as type **Secret**) and redeploy.

**From your computer:**

```bash
npx wrangler secret put NVIDIA_API_KEY
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SECRET_KEY
npx wrangler secret put HEALTH_TOKEN          # optional, for the full /api/health report
npm run deploy
```

## Production readiness

The parts that keep secrets safe are done: API keys stay on the server, the browser never talks to Supabase, RLS is on, model IDs are allowlisted, and prompt and token sizes are capped. Before you open this to the public, you still need:

- [x] **Rate limiting.** `wrangler.toml` limits each IP to 10 runs and 20 chat messages a minute (Workers Rate Limiting binding), and the API only accepts `application/json`, so other sites can't post to it from a visitor's browser. For a public launch, also consider Turnstile and a daily spend cap.
- [ ] **Authentication.** Past runs is scoped to a random per-browser ID (`client_id`, sent as `x-client-id`), so visitors no longer see each other's prompts. It's not a login: clearing site data loses the history. For real accounts, add Supabase Auth or Cloudflare Access and store a `user_id` on each run.
- [ ] **Model limits.** Some NVIDIA models only accept temperature up to 1.0, so the 1.5 column may show an API error for them. Check each model on build.nvidia.com.
- [ ] **Reasoning models.** Nemotron thinks before answering, and the thinking counts toward Max tokens. The site shows the thinking in a collapsible box and says when a column ran out of tokens, but keep Max tokens at 1024 or more for these models.
- [ ] **Timeouts.** Calls to the 405B model can be slow. Each call times out after 60s. Consider streaming the responses.
- [ ] **Monitoring.** Workers Logs are on (`[observability]`). Watch for `runs insert failed`, `chat_logs insert failed` and `NVIDIA ...` errors there.
- [x] **Data policy.** The page tells users that prompts are saved for up to 90 days, and `schema.sql` schedules `delete_old_runs(90)` daily with pg_cron. If pg_cron isn't enabled, the schema prints a notice: enable it and run the file again.
