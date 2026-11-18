// Minimal client for NVIDIA's OpenAI-compatible chat API.

export const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";

// messages: [{ role: "system" | "user" | "assistant", content: string }, ...]
// signal: the incoming request's signal, so the call stops (and stops billing) if the visitor leaves.
// Errors thrown here carry a message that is safe to show; the raw details go to Workers Logs.
export async function nvidiaChat(env, { model, messages, temperature, maxTokens, signal }) {
  const started = Date.now();
  const timeout = AbortSignal.timeout(60_000);
  let res;
  try {
    res = await fetch(`${NVIDIA_BASE_URL}/chat/completions`, {
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
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
  } catch (err) {
    console.error(`NVIDIA ${model} request failed:`, err);
    throw new Error(timeout.aborted ? "The model took longer than 60 seconds to answer." : "Couldn't reach NVIDIA. Try again.");
  }
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 500);
    console.error(`NVIDIA ${model} ${res.status}:`, detail);
    throw new Error(explainStatus(res.status, detail, temperature));
  }
  let data;
  try {
    data = await res.json();
  } catch (err) {
    console.error(`NVIDIA ${model} sent a non-JSON body:`, err);
    throw new Error("NVIDIA sent an unexpected response. Try again.");
  }
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

function explainStatus(status, detail, temperature) {
  if (status === 429) return "NVIDIA is rate-limiting requests. Try again in a minute.";
  if (status === 401 || status === 403) return "NVIDIA rejected the API key.";
  if (status === 404 || status === 410) return "This model isn't available on NVIDIA right now.";
  if ((status === 400 || status === 422) && /temperature/i.test(detail)) return `This model doesn't accept temperature ${temperature}.`;
  if (status >= 500) return `NVIDIA had a server error (${status}). Try again.`;
  return `NVIDIA rejected the request (${status}).`;
}

// Reasoning models (e.g. Nemotron) return their thinking either in a separate
// field or inline as <think>…</think> before the answer. Separate the two.
function splitReasoning(message) {
  let output = typeof message.content === "string" ? message.content : "";
  let reasoning = message.reasoning_content ?? message.reasoning ?? "";
  if (typeof reasoning !== "string") reasoning = "";
  const think = output.match(/^\s*<think>([\s\S]*?)(<\/think>|$)/);
  if (think) {
    reasoning = [reasoning, think[1]].filter(Boolean).join("\n");
    output = output.slice(think[0].length);
  }
  return { output: output.trim(), reasoning: reasoning.trim() || null };
}
