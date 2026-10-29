import { json, supabase, supabaseKey, supabaseUrl } from "../lib/shared.js";

// GET /api/health: checks the setup and says what's wrong, without revealing any key.
export async function onRequestGet({ env }) {
  const url = supabaseUrl(env);
  const key = supabaseKey(env);
  const report = {
    nvidia: env.NVIDIA_API_KEY ? "NVIDIA_API_KEY is set" : "MISSING: add NVIDIA_API_KEY",
    supabase_url: checkUrl(url),
    supabase_key: describeKey(env, key),
    tables: {},
  };

  if (url && key) {
    for (const table of ["runs", "chat_logs"]) {
      try {
        const rows = await supabase(env, `${table}?select=id&limit=1`);
        report.tables[table] = `ok (${rows.length ? "has rows" : "empty"})`;
      } catch (err) {
        report.tables[table] = explain(err.message ?? String(err));
      }
    }
  } else {
    report.tables = "skipped: set SUPABASE_URL and SUPABASE_SECRET_KEY first";
  }

  report.ok = Boolean(env.NVIDIA_API_KEY) && typeof report.tables === "object" &&
    Object.values(report.tables).every((v) => v.startsWith("ok"));
  return json(report);
}

function checkUrl(url) {
  if (!url) return "MISSING: add SUPABASE_URL (https://<project>.supabase.co)";
  if (url.includes("supabase.com/dashboard")) return "WRONG: this is the dashboard link. Use https://<project>.supabase.co (Settings → API)";
  if (!/^https:\/\/[^/]+$/.test(url)) return `WRONG: should look like https://<project>.supabase.co, got ${url}`;
  return `ok (${url})`;
}

function describeKey(env, key) {
  const name = env.SUPABASE_SECRET_KEY ? "SUPABASE_SECRET_KEY" : env.SUPABASE_SERVICE_ROLE_KEY ? "SUPABASE_SERVICE_ROLE_KEY" : null;
  if (!name) return "MISSING: add SUPABASE_SECRET_KEY (sb_secret_…)";
  if (key.startsWith("sb_secret_")) return `ok (${name} is a secret key)`;
  if (key.startsWith("sb_publishable_")) return `WRONG: ${name} holds the publishable key. Use the secret key (sb_secret_…)`;
  if (key.startsWith("eyJ")) {
    try {
      const role = JSON.parse(atob(key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).role;
      return role === "service_role" ? `ok (${name} is the legacy service_role key)` : `WRONG: ${name} is the legacy "${role}" key. Use the secret key (sb_secret_…)`;
    } catch {
      return `WRONG: ${name} doesn't look like a valid key`;
    }
  }
  return `WRONG: ${name} doesn't look like a Supabase key (expected sb_secret_…)`;
}

function explain(message) {
  if (/PGRST205|does not exist|Could not find the table/i.test(message)) return `MISSING TABLE: run supabase/schema.sql in the SQL Editor (${message.slice(0, 120)})`;
  if (/42501|permission denied/i.test(message)) return `NO PERMISSION: run the latest supabase/schema.sql again in the SQL Editor (${message.slice(0, 120)})`;
  if (/401|403|Invalid API key/i.test(message)) return `KEY REJECTED: check SUPABASE_SECRET_KEY belongs to this project (${message.slice(0, 120)})`;
  if (/ENOTFOUND|fetch failed|Name not resolved|error code: 1016/i.test(message)) return `CAN'T REACH SUPABASE: check SUPABASE_URL (${message.slice(0, 120)})`;
  return `ERROR: ${message.slice(0, 200)}`;
}
