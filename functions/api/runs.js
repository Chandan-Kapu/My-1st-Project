import { json, supabase, supabaseConfigured } from "../_lib/shared.js";

export async function onRequestGet({ env }) {
  if (!supabaseConfigured(env)) return json({ configured: false, runs: [] });
  try {
    const runs = await supabase(env, "runs?select=id,created_at,prompt,model,max_tokens,results&order=created_at.desc&limit=20");
    return json({ configured: true, runs });
  } catch (err) {
    return json({ configured: true, runs: [], error: err.message }, 502);
  }
}
