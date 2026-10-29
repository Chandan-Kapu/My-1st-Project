import { DEFAULT_MODEL, LIMITS, json } from "../lib/shared.js";
import { nvidiaChat } from "../lib/nvidia.js";

const ROLES = new Set(["system", "user", "assistant"]);

// POST /api/chat  { prompt } or { messages: [{ role, content }], temperature?, maxTokens? }
// Sends one chat request to NVIDIA with the default model (Nemotron 3.5 Lightning).
export async function onRequestPost({ request, env }) {
  if (!env.NVIDIA_API_KEY) return json({ error: "NVIDIA_API_KEY secret is not set." }, 503);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Body must be JSON." }, 400);
  }

  const messages = Array.isArray(body.messages)
    ? body.messages
    : [{ role: "user", content: typeof body.prompt === "string" ? body.prompt.trim() : "" }];

  const valid = messages.length > 0 && messages.length <= 20 &&
    messages.every((m) => ROLES.has(m?.role) && typeof m.content === "string" && m.content.length > 0);
  if (!valid) return json({ error: "Send a non-empty prompt, or 1–20 messages with role and content." }, 400);
  if (messages.reduce((n, m) => n + m.content.length, 0) > LIMITS.promptChars) {
    return json({ error: `Messages are over ${LIMITS.promptChars} characters in total.` }, 400);
  }

  const temperature = Math.min(Math.max(Number(body.temperature ?? 0.7) || 0, 0), 2);
  const maxTokens = Math.min(Math.max(parseInt(body.maxTokens, 10) || 1024, 16), LIMITS.maxTokens);

  try {
    const result = await nvidiaChat(env, {
      model: DEFAULT_MODEL,
      messages: messages.map(({ role, content }) => ({ role, content })),
      temperature,
      maxTokens,
    });
    return json({ model: DEFAULT_MODEL, temperature, ...result });
  } catch (err) {
    return json({ error: err.message }, 502);
  }
}
