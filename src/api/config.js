import { MODELS, DEFAULT_MODEL, TEMPERATURES, LIMITS, json, supabaseConfigured } from "../lib/shared.js";

export function onRequestGet({ env }) {
  return json({
    models: Object.entries(MODELS).map(([id, m]) => ({ id, ...m })),
    defaultModel: DEFAULT_MODEL,
    temperatures: TEMPERATURES,
    limits: LIMITS,
    mock: !env.NVIDIA_API_KEY,
    logging: supabaseConfigured(env),
  });
}
