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

export const LIMITS = { promptChars: 4000, maxTokens: 4096 };

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

// Server-side Supabase key: the new secret key (sb_secret_...), or the legacy service_role JWT.
export function supabaseKey(env) {
  return (env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
}

// Accepts "https://abc.supabase.co", with or without a trailing "/" or "/rest/v1".
export function supabaseUrl(env) {
  return (env.SUPABASE_URL || "").trim().replace(/\/+$/, "").replace(/\/rest\/v1$/, "");
}

export function supabaseConfigured(env) {
  return Boolean(supabaseUrl(env) && supabaseKey(env));
}

// Talks to Supabase over its REST (PostgREST) API with fetch — no SDK needed on Workers.
export async function supabase(env, path, init = {}) {
  const key = supabaseKey(env);
  const res = await fetch(`${supabaseUrl(env)}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      // New sb_ keys aren't JWTs and go in apikey only; the legacy JWT key also goes in Authorization.
      ...(key.startsWith("sb_") ? {} : { authorization: `Bearer ${key}` }),
      "content-type": "application/json",
      ...init.headers,
    },
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}
