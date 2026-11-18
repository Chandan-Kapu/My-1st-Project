import { MODELS, DEFAULT_MODEL, TEMPERATURES, LIMITS, json, supabaseConfigured, nvidiaMode } from "../lib/shared.js";

export function onRequestGet({ request, env }) {
  const nvidia = nvidiaMode(request, env);
  return json({
    models: Object.entries(MODELS).map(([id, m]) => ({ id, ...m })),
    defaultModel: DEFAULT_MODEL,
    temperatures: TEMPERATURES,
    limits: LIMITS,
    nvidia,
    mock: nvidia === "mock",
    logging: supabaseConfigured(env),
  });
}
