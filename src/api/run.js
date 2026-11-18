import {
  TEMPERATURES, MODELS, LIMITS, NVIDIA_MISSING, json, supabase, supabaseConfigured, readJsonObject, clientId, nvidiaMode, storableText,
} from "../lib/shared.js";
import { nvidiaChat } from "../lib/nvidia.js";

// Used on localhost (or with MOCK_MODE=true) until NVIDIA_API_KEY is set, so the UI can be tried without keys.
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
  const mode = nvidiaMode(request, env);
  if (mode === "missing") return json({ error: NVIDIA_MISSING }, 503);

  const { body, error } = await readJsonObject(request);
  if (error) return error;

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  const model = body.model;
  const maxTokens = Math.min(Math.max(parseInt(body.maxTokens, 10) || 1024, 16), LIMITS.maxTokens);

  if (!prompt) return json({ error: "Prompt is required." }, 400);
  if (prompt.length > LIMITS.promptChars) return json({ error: `Prompt is over ${LIMITS.promptChars} characters.` }, 400);
  if (!storableText(prompt)) return json({ error: "Prompt contains characters that can't be saved." }, 400);
  // Own keys only: "__proto__", "constructor" or an array must not pass as a model ID.
  if (typeof model !== "string" || !Object.hasOwn(MODELS, model)) return json({ error: "Unknown model." }, 400);

  const mock = mode === "mock";

  // Fire all three temperatures in parallel; one failing column shouldn't sink the others.
  const settled = await Promise.allSettled(
    TEMPERATURES.map((temperature) =>
      mock ? mockNvidia({ prompt, temperature }) : nvidiaChat(env, { model, messages: [{ role: "user", content: prompt }], temperature, maxTokens, signal: request.signal })
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
        body: JSON.stringify({ client_id: clientId(request), prompt, model, max_tokens: maxTokens, results }),
      });
      runId = row?.id ?? null;
    } catch (err) {
      console.error("runs insert failed:", err.message);
      logError = "Couldn't save this run to the database.";
    }
  }

  return json({ model, mock, runId, logged: Boolean(runId), logError, results });
}
