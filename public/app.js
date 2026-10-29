const $ = (s) => document.querySelector(s);
const tpl = $("#card-tpl");
const TAGS = { 0: "deterministic", 0.7: "balanced", 1.5: "chaotic" };
let temperatures = [0, 0.7, 1.5];
let models = [];

function renderCards(results, { loading = false } = {}) {
  const grid = $("#results");
  grid.replaceChildren();
  temperatures.forEach((t, i) => {
    const node = tpl.content.firstElementChild.cloneNode(true);
    const r = results?.find((x) => x.temperature === t);
    node.dataset.i = i;
    node.classList.toggle("loading", loading);
    node.querySelector(".temp").textContent = `T = ${t}`;
    node.querySelector(".tag").textContent = TAGS[t] ?? "";
    const out = node.querySelector(".out");
    const meta = node.querySelector(".meta");
    if (loading) {
      meta.textContent = "Waiting for model…";
    } else if (!r) {
      out.classList.add("empty");
      out.textContent = "Output appears here.";
      meta.textContent = "—";
    } else if (r.error) {
      out.classList.add("err");
      out.textContent = r.error;
      meta.textContent = "Failed";
    } else {
      if (r.reasoning) {
        const thinking = node.querySelector(".thinking");
        thinking.hidden = false;
        thinking.querySelector("pre").textContent = r.reasoning;
      }
      if (r.output) {
        out.textContent = r.output;
      } else {
        out.classList.add("empty");
        out.textContent = emptyReason(r);
      }
      meta.textContent = [
        r.tokens != null && `${r.tokens} tokens`,
        r.latencyMs && `${(r.latencyMs / 1000).toFixed(1)}s`,
        r.finishReason === "length" && "cut off at max tokens",
      ].filter(Boolean).join(" · ") || "done";
    }
    grid.append(node);
  });
}

function emptyReason(r) {
  if (r.finishReason === "length") {
    return r.reasoning
      ? "The model used all its tokens thinking before it could answer. Raise Max tokens and run again."
      : "Hit max tokens before any answer. Raise Max tokens and run again.";
  }
  return "(The model returned an empty answer.)";
}

function setStatus({ mock, logging }) {
  const pills = [
    mock ? ["Mock mode — no NVIDIA key", "warn"] : ["NVIDIA live", ""],
    logging ? ["Supabase logging on", ""] : ["Logging off", "warn"],
  ];
  $("#status").replaceChildren(...pills.map(([text, cls]) => {
    const el = document.createElement("span");
    el.className = `pill ${cls}`;
    el.textContent = text;
    return el;
  }));
}

async function loadConfig() {
  const cfg = await fetch("/api/config").then((r) => r.json());
  temperatures = cfg.temperatures;
  models = cfg.models;
  $("#model").replaceChildren(...models.map((m) => new Option(m.label, m.id)));
  $("#model").value = cfg.defaultModel ?? models[0]?.id;
  setStatus(cfg);
}

async function loadHistory() {
  const list = $("#history");
  const empty = (text) => {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = text;
    list.replaceChildren(li);
  };
  try {
    const { configured, runs, error } = await fetch("/api/runs").then((r) => r.json());
    if (!configured) return empty("Connect Supabase to keep a history of runs.");
    if (error) return empty(`Couldn't load history: ${error}`);
    if (!runs.length) return empty("No runs yet. Try one above.");
    list.replaceChildren(...runs.map((run) => {
      const li = document.createElement("li");
      const p = document.createElement("span");
      p.className = "p";
      p.textContent = run.prompt;
      const d = document.createElement("span");
      d.className = "d";
      d.textContent = new Date(run.created_at).toLocaleString();
      const m = document.createElement("span");
      m.className = "d";
      m.textContent = models.find((x) => x.id === run.model)?.label ?? run.model;
      li.append(p, d, m);
      li.onclick = () => {
        $("#prompt").value = run.prompt;
        renderCards(run.results);
        window.scrollTo({ top: $("#composer").offsetTop - 16, behavior: "smooth" });
      };
      return li;
    }));
  } catch {
    empty("Couldn't load history.");
  }
}

$("#composer").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("#runBtn");
  btn.disabled = true;
  renderCards(null, { loading: true });
  try {
    const res = await fetch("/api/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        prompt: $("#prompt").value,
        model: $("#model").value,
        maxTokens: Number($("#maxTokens").value),
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    renderCards(data.results);
    if (data.logged) loadHistory();
  } catch (err) {
    renderCards(temperatures.map((t) => ({ temperature: t, error: err.message })));
  } finally {
    btn.disabled = false;
  }
});
$("#refreshBtn").addEventListener("click", loadHistory);

// Chat: sends the whole conversation to /api/chat each turn.
let chatMessages = [];

function addBubble(cls, text, meta) {
  const li = document.createElement("li");
  li.className = cls;
  li.textContent = text;
  if (meta) {
    const m = document.createElement("span");
    m.className = "meta-line";
    m.textContent = meta;
    li.append(m);
  }
  $("#chatLog").append(li);
  li.scrollIntoView({ block: "nearest" });
  return li;
}

function resetChat() {
  chatMessages = [];
  $("#chatLog").replaceChildren();
  addBubble("hint", "No messages yet.");
}

$("#chatForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = $("#chatInput");
  const text = input.value.trim();
  if (!text) return;
  $("#chatLog").querySelector(".hint")?.remove();
  addBubble("user", text);
  chatMessages.push({ role: "user", content: text });
  input.value = "";
  $("#chatSend").disabled = true;
  const pending = addBubble("assistant", "thinking…");
  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: chatMessages.slice(-20) }),
    });
    const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    pending.remove();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    if (!data.output) throw new Error(emptyReason(data));
    chatMessages.push({ role: "assistant", content: data.output });
    const meta = [
      data.tokens != null && `${data.tokens} tokens`,
      `${(data.latencyMs / 1000).toFixed(1)}s`,
      data.finishReason === "length" && "cut off",
    ].filter(Boolean).join(" · ");
    addBubble("assistant", data.output, meta);
  } catch (err) {
    pending.remove();
    chatMessages.pop();
    addBubble("error", err.message);
  } finally {
    $("#chatSend").disabled = false;
    input.focus();
  }
});
$("#chatClear").addEventListener("click", resetChat);
resetChat();

renderCards(null);
loadConfig().then(loadHistory).catch(() => setStatus({ mock: true, logging: false }));
