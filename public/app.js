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
      out.textContent = r.output;
      meta.textContent = [r.tokens != null && `${r.tokens} tokens`, r.latencyMs && `${(r.latencyMs / 1000).toFixed(1)}s`]
        .filter(Boolean).join(" · ") || "done";
    }
    grid.append(node);
  });
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
  $("#model").value = models[1]?.id ?? models[0]?.id;
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

renderCards(null);
loadConfig().then(loadHistory).catch(() => setStatus({ mock: true, logging: false }));
