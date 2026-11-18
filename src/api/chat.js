import {
  DEFAULT_MODEL, LIMITS, NVIDIA_MISSING, UUID, json, supabase, supabaseConfigured, readJsonObject, nvidiaMode, storableText,
} from "../lib/shared.js";
import { nvidiaChat } from "../lib/nvidia.js";

// No "system": callers can't replace the model's instructions or turn this into a general-purpose proxy.
const ROLES = new Set(["user", "assistant"]);

// Saves one request/response to Supabase. Failures go to Workers Logs, never to the user.
async function logChat(env, row) {
  try {
    await supabase(env, "chat_logs", { method: "POST", body: JSON.stringify(row) });
  } catch (err) {
    console.error("chat_logs insert failed:", err.message);
  }
}

// POST /api/chat  { prompt } or { messages: [{ role, content }], temperature?, maxTokens?, conversationId? }
// Sends one chat request to NVIDIA with the default model (Nemotron 3.5 Lightning).
export async function onRequestPost({ request, env, ctx }) {
  const mode = nvidiaMode(request, env);
  if (mode === "missing") return json({ error: NVIDIA_MISSING }, 503);

  const { body, error } = await readJsonObject(request);
  if (error) return error;

  const messages = Array.isArray(body.messages)
    ? body.messages
    : [{ role: "user", content: typeof body.prompt === "string" ? body.prompt.trim() : "" }];

  const valid = messages.length > 0 && messages.length <= 20 &&
    messages.every((m) => ROLES.has(m?.role) && typeof m.content === "string" && m.content.trim().length > 0) &&
    messages.some((m) => m.role === "user");
  if (!valid) return json({ error: "Send a non-empty prompt, or 1–20 user/assistant messages including at least one from the user." }, 400);
  if (!messages.every((m) => storableText(m.content))) return json({ error: "Message contains characters that can't be saved." }, 400);
  if (messages.reduce((n, m) => n + m.content.length, 0) > LIMITS.promptChars) {
    return json({ error: `Messages are over ${LIMITS.promptChars} characters in total.` }, 400);
  }

  const temperature = Math.min(Math.max(Number(body.temperature ?? 0.7) || 0, 0), 2);
  const maxTokens = Math.min(Math.max(parseInt(body.maxTokens, 10) || 1024, 16), LIMITS.maxTokens);

  const cleanMessages = messages.map(({ role, content }) => ({ role, content }));
  if (mode === "mock") {
    const output = `[mock reply — set NVIDIA_API_KEY to call the real API]\n\nYou said: "${cleanMessages.at(-1).content.slice(0, 120)}"`;
    return json({ model: DEFAULT_MODEL, temperature, mock: true, output, reasoning: null, finishReason: "stop", tokens: null, latencyMs: 0 });
  }
  const log = {
    conversation_id: UUID.test(body.conversationId ?? "") ? body.conversationId : null,
    model: DEFAULT_MODEL,
    temperature,
    max_tokens: maxTokens,
    prompt: cleanMessages.findLast((m) => m.role === "user")?.content ?? cleanMessages.at(-1).content,
    messages: cleanMessages,
  };
  // Log after responding so the user doesn't wait on Supabase.
  const save = (fields) => supabaseConfigured(env) && ctx?.waitUntil(logChat(env, { ...log, ...fields }));

  try {
    const result = await nvidiaChat(env, { model: DEFAULT_MODEL, messages: cleanMessages, temperature, maxTokens, signal: request.signal });
    save({
      output: result.output,
      reasoning: result.reasoning,
      finish_reason: result.finishReason,
      tokens: result.tokens,
      latency_ms: result.latencyMs,
    });
    return json({ model: DEFAULT_MODEL, temperature, ...result });
  } catch (err) {
    save({ error: err.message });
    return json({ error: err.message }, 502);
  }
}
