import { MODELS, TEMPERATURES, LIMITS, json, supabaseConfigured } from "../_lib/shared.js";

export function onRequestGet({ env }) {
  return json({
    models: Object.entries(MODELS).map(([id, m]) => ({ id, ...m })),
    temperatures: TEMPERATURES,
    limits: LIMITS,
    mock: !env.NVIDIA_API_KEY,
    logging: supabaseConfigured(env),
  });
}
