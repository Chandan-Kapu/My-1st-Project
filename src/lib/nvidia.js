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
  return {
    output: data.choices?.[0]?.message?.content ?? "",
    tokens: data.usage?.completion_tokens ?? null,
    latencyMs: Date.now() - started,
  };
}
