// Minimal client for NVIDIA's OpenAI-compatible chat API.

export const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";

// messages: [{ role: "system" | "user" | "assistant", content: string }, ...]
export async function nvidiaChat(env, { model, messages, temperature, maxTokens }) {
  const started = Date.now();
  const res = await fetch(`${NVIDIA_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${env.NVIDIA_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      top_p: 1,
      max_tokens: maxTokens,
      stream: false,
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`NVIDIA ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const choice = data.choices?.[0] ?? {};
  const { output, reasoning } = splitReasoning(choice.message ?? {});
  return {
    output,
    reasoning,
    // "length" means max_tokens ran out; reasoning models can spend all of it thinking.
    finishReason: choice.finish_reason ?? null,
    tokens: data.usage?.completion_tokens ?? null,
    latencyMs: Date.now() - started,
  };
}

// Reasoning models (e.g. Nemotron) return their thinking either in a separate
// field or inline as <think>…</think> before the answer. Separate the two.
function splitReasoning(message) {
  let output = message.content ?? "";
  let reasoning = message.reasoning_content ?? message.reasoning ?? "";
  const think = output.match(/^\s*<think>([\s\S]*?)(<\/think>|$)/);
  if (think) {
    reasoning = [reasoning, think[1]].filter(Boolean).join("\n");
    output = output.slice(think[0].length);
  }
  return { output: output.trim(), reasoning: reasoning.trim() || null };
}
