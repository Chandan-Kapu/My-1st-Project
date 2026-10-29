// Shared helpers for the Worker.

export const TEMPERATURES = [0, 0.7, 1.5];

// Server-side allowlist so the client can't send arbitrary model IDs.
// Small → large, so the "model size" half of the playground is meaningful.
export const MODELS = {
  "meta/llama-3.2-3b-instruct": { label: "Llama 3.2 · 3B", size: "3B" },
  "meta/llama-3.1-8b-instruct": { label: "Llama 3.1 · 8B", size: "8B" },
  "nvidia/nemotron-3.5-lightning-30b-a3b": { label: "Nemotron 3.5 Lightning · 30B (3B active)", size: "30B-A3B" },
  "meta/llama-3.3-70b-instruct": { label: "Llama 3.3 · 70B", size: "70B" },
  "meta/llama-3.1-405b-instruct": { label: "Llama 3.1 · 405B", size: "405B" },
};

export const DEFAULT_MODEL = "nvidia/nemotron-3.5-lightning-30b-a3b";

export const LIMITS = { promptChars: 4000, maxTokens: 1024 };

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export function supabaseConfigured(env) {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
}

// Talks to Supabase over its REST (PostgREST) API with fetch — no SDK needed on Workers.
export async function supabase(env, path, init = {}) {
  const res = await fetch(`${env.SUPABASE_URL.replace(/\/$/, "")}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "content-type": "application/json",
      ...init.headers,
    },
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}
