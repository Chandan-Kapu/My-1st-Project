import { UUID, json, supabase, supabaseConfigured, clientId } from "../lib/shared.js";

// Only the runs made in the caller's browser, so one visitor never sees another's prompts.
// GET /api/runs lists them without outputs (small); GET /api/runs?id=<run id> returns one run with its results.
export async function onRequestGet({ request, env }) {
  if (!supabaseConfigured(env)) return json({ configured: false, runs: [] });
  const client = clientId(request);
  const id = new URL(request.url).searchParams.get("id");
  if (id !== null && !UUID.test(id)) return json({ error: "Unknown run." }, 404);
  if (!client) return id === null ? json({ configured: true, runs: [] }) : json({ error: "Unknown run." }, 404);
  try {
    if (id !== null) {
      const [run] = await supabase(env, `runs?select=id,created_at,prompt,model,max_tokens,results&id=eq.${id}&client_id=eq.${client}`);
      return run ? json(run) : json({ error: "Unknown run." }, 404);
    }
    const runs = await supabase(env, `runs?select=id,created_at,prompt,model,max_tokens&client_id=eq.${client}&order=created_at.desc&limit=20`);
    return json({ configured: true, runs });
  } catch (err) {
    console.error("runs select failed:", err.message);
    return json({ configured: true, runs: [], error: "Couldn't load history from the database." }, 502);
  }
}
