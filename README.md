# Temperature Playground

One prompt runs three times, at temperature **0**, **0.7** and **1.5**, with the outputs side by side. You pick the model size (3B → 405B). Every run is logged to Supabase so you can compare later.

- **Frontend:** static HTML/CSS/JS in `public/`
- **Backend:** Cloudflare Pages Functions in `functions/api/`
  - `GET /api/config`: models, temperatures, and whether keys are set
  - `POST /api/run`: `{ prompt, model, maxTokens }` → runs 3 temperatures in parallel via NVIDIA NIM, then logs the run
  - `GET /api/runs`: the 20 most recent runs
- **LLM:** NVIDIA's OpenAI-compatible API (`integrate.api.nvidia.com`)
- **DB:** Supabase, reached through its REST API with `fetch` (no SDK needed)

Without an `NVIDIA_API_KEY` the site runs in **mock mode**, so you can try the UI before you have keys.

## Run locally

```bash
npm install
cp .dev.vars.example .dev.vars   # fill in keys, or leave blank for mock mode
npm run dev                      # http://localhost:8788
```

## Set up Supabase

1. Create a project at supabase.com.
2. Run `supabase/schema.sql` in the SQL editor.
3. Copy the project URL and the **service_role** key (Settings → API) into your secrets.

## Deploy to Cloudflare Pages

```bash
npx wrangler pages project create temperature-playground
npx wrangler pages secret put NVIDIA_API_KEY
npx wrangler pages secret put SUPABASE_URL
npx wrangler pages secret put SUPABASE_SERVICE_ROLE_KEY
npm run deploy
```

Or connect this GitHub repo in the Cloudflare dashboard (build command: none, output directory: `public`) and add the three secrets under Settings → Environment variables.

## Production readiness

The parts that keep secrets safe are done: API keys stay on the server, the browser never talks to Supabase, RLS is on, model IDs are allowlisted, and prompt and token sizes are capped. Before you open this to the public, you still need:

- [ ] **Rate limiting.** Anyone with the URL can spend your NVIDIA credits, and each click makes 3 calls. Add a Cloudflare rate-limiting rule on `/api/run`, or Turnstile.
- [ ] **Authentication.** Right now `/api/runs` shows every user's prompts to everyone. Add Supabase Auth or Cloudflare Access, and store a `user_id` on each run.
- [ ] **Model limits.** Some NVIDIA models only accept temperature up to 1.0, so the 1.5 column may show an API error for them. Check each model on build.nvidia.com.
- [ ] **Timeouts.** Calls to the 405B model can be slow. Each call times out after 60s. Consider streaming the responses.
- [ ] **Monitoring.** Turn on Workers Logs, and watch for `logError` in responses.
- [ ] **Data policy.** Prompts are stored indefinitely. Tell users, and add a retention or cleanup job.
