import { TEMPERATURES, MODELS, LIMITS, json, supabase, supabaseConfigured } from "../_lib/shared.js";

const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";

async function callNvidia(env, { prompt, model, maxTokens, temperature }) {
  const started = Date.now();
  const res = await fetch(NVIDIA_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${env.NVIDIA_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature,
      top_p: 1,
      max_tokens: maxTokens,
      stream: false,
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`NVIDIA ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return {
    output: data.choices?.[0]?.message?.content ?? "",
    tokens: data.usage?.completion_tokens ?? null,
    latencyMs: Date.now() - started,
  };
}

// Used until NVIDIA_API_KEY is set, so the UI can be built and tried without keys.
function mockNvidia({ prompt, temperature }) {
  const flavor = {
    0: "Deterministic: the same most-likely tokens every time.",
    0.7: "Balanced: a little variety in word choice while staying on topic.",
    1.5: "Wild: unlikely tokens get picked often, so expect drift and surprises!",
  }[temperature];
  return {
    output: `[mock output — set NVIDIA_API_KEY to call the real API]\n\nPrompt: "${prompt.slice(0, 120)}"\n\n${flavor}`,
    tokens: null,
    latencyMs: 0,
  };
}

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Body must be JSON." }, 400);
  }

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  const model = body.model;
  const maxTokens = Math.min(Math.max(parseInt(body.maxTokens, 10) || 256, 16), LIMITS.maxTokens);

  if (!prompt) return json({ error: "Prompt is required." }, 400);
  if (prompt.length > LIMITS.promptChars) return json({ error: `Prompt is over ${LIMITS.promptChars} characters.` }, 400);
  if (!MODELS[model]) return json({ error: "Unknown model." }, 400);

  const mock = !env.NVIDIA_API_KEY;

  // Fire all three temperatures in parallel; one failing column shouldn't sink the others.
  const settled = await Promise.allSettled(
    TEMPERATURES.map((temperature) =>
      mock ? mockNvidia({ prompt, temperature }) : callNvidia(env, { prompt, model, maxTokens, temperature })
    )
  );
  const results = settled.map((s, i) => ({
    temperature: TEMPERATURES[i],
    ...(s.status === "fulfilled" ? s.value : { output: null, error: s.reason?.message ?? "Unknown error" }),
  }));

  let runId = null;
  let logError = null;
  if (supabaseConfigured(env) && !mock) {
    try {
      const [row] = await supabase(env, "runs", {
        method: "POST",
        headers: { prefer: "return=representation" },
        body: JSON.stringify({ prompt, model, max_tokens: maxTokens, results }),
      });
      runId = row?.id ?? null;
    } catch (err) {
      logError = err.message;
    }
  }

  return json({ model, mock, runId, logged: Boolean(runId), logError, results });
}
