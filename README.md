# Temperature Playground

One prompt runs three times, at temperature **0**, **0.7** and **1.5**, with the outputs side by side. You pick the model size (3B → 405B). Every run is logged to Supabase so you can compare later.

- **Frontend:** static HTML/CSS/JS in `public/`
- **Backend:** a Cloudflare Worker (`src/index.js`) that serves `public/` as static assets and routes `/api/*` to `src/api/`
  - `GET /api/config`: models, temperatures, and whether keys are set
  - `POST /api/chat`: `{ prompt }` or `{ messages, temperature?, maxTokens? }` → one chat request to `nvidia/nemotron-3.5-lightning-30b-a3b`
  - `POST /api/run`: `{ prompt, model, maxTokens }` → runs 3 temperatures in parallel via NVIDIA NIM, then logs the run
  - `GET /api/runs`: the 20 most recent runs
- **LLM:** NVIDIA's OpenAI-compatible API (`integrate.api.nvidia.com`)
- **DB:** Supabase, reached through its REST API with `fetch` (no SDK needed)

Without an `NVIDIA_API_KEY` the site runs in **mock mode**, so you can try the UI before you have keys.

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

Response: `{ "model", "temperature", "output", "tokens", "latencyMs" }`. Without the secret, `/api/chat` returns 503.

## Set up Supabase

1. Create a project at supabase.com.
2. Run `supabase/schema.sql` in the SQL editor. It creates:
   - `runs`: every **Run ×3** (prompt, model, and all three outputs)
   - `chat_logs`: every Chat box message and reply, including failed calls
   - `all_queries`: a view with both, one row per response: `select * from all_queries order by created_at desc;`
3. Copy the project URL and the **service_role** key (Settings → API) into your secrets.

## Deploy to Cloudflare Workers

**From GitHub (recommended):** Workers & Pages → Create → Import a repository → `My-1st-Project`.
- Project name: `my-1st-project` (must match `name` in `wrangler.toml`)
- Build command: leave empty
- Deploy command: `npx wrangler deploy`

Then add `NVIDIA_API_KEY`, `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` under the Worker's Settings → Variables and Secrets (as type **Secret**) and redeploy.

**From your computer:**

```bash
npx wrangler secret put NVIDIA_API_KEY
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npm run deploy
```

## Production readiness

The parts that keep secrets safe are done: API keys stay on the server, the browser never talks to Supabase, RLS is on, model IDs are allowlisted, and prompt and token sizes are capped. Before you open this to the public, you still need:

- [ ] **Rate limiting.** Anyone with the URL can spend your NVIDIA credits, and each click makes 3 calls. Add a Cloudflare rate-limiting rule on `/api/run`, or Turnstile.
- [ ] **Authentication.** Right now `/api/runs` shows every user's prompts to everyone. Add Supabase Auth or Cloudflare Access, and store a `user_id` on each run.
- [ ] **Model limits.** Some NVIDIA models only accept temperature up to 1.0, so the 1.5 column may show an API error for them. Check each model on build.nvidia.com.
- [ ] **Reasoning models.** Nemotron thinks before answering, and the thinking counts toward Max tokens. The site shows the thinking in a collapsible box and says when a column ran out of tokens, but keep Max tokens at 1024 or more for these models.
- [ ] **Timeouts.** Calls to the 405B model can be slow. Each call times out after 60s. Consider streaming the responses.
- [ ] **Monitoring.** Turn on Workers Logs, and watch for `logError` in responses.
- [ ] **Data policy.** Prompts are stored indefinitely. Tell users, and add a retention or cleanup job.
