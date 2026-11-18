import { json, supabase, supabaseConfigured, clientId } from "../lib/shared.js";

// Only the runs made in the caller's browser, so one visitor never sees another's prompts.
export async function onRequestGet({ request, env }) {
  if (!supabaseConfigured(env)) return json({ configured: false, runs: [] });
  const client = clientId(request);
  if (!client) return json({ configured: true, runs: [] });
  try {
    const runs = await supabase(env, `runs?select=id,created_at,prompt,model,max_tokens,results&client_id=eq.${client}&order=created_at.desc&limit=20`);
    return json({ configured: true, runs });
  } catch (err) {
    return json({ configured: true, runs: [], error: err.message }, 502);
  }
}
