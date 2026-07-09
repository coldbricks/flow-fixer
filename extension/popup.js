import { SPEEDS, SPEED_BY_ID } from "./lib/speeds.js";
import { redactUrl } from "./lib/privacy.js";

function cmd(cmdName, extra = {}) {
  return chrome.runtime.sendMessage({
    channel: "flow-fixer-cmd",
    cmd: cmdName,
    ...extra,
  });
}

function fmtPct(n) {
  return `${n.toFixed(0)}%`;
}

function fmtGap(ms) {
  if (!ms) return "parallel";
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s gap`;
  return `${ms}ms gap`;
}

function flash(msg) {
  const el = document.getElementById("toastMsg");
  if (!el) return;
  el.textContent = msg;
  el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), 2200);
}

function renderLadder(activeId) {
  const el = document.getElementById("ladder");
  el.innerHTML = SPEEDS.map((s) => {
    const active = s.id === activeId ? "active" : "";
    return `<button type="button" class="gear ${active}" data-speed="${s.id}">
      <span class="em">${s.emoji}</span>
      <span><div class="nm">${s.name}</div><div class="sm">${s.sub}</div></span>
      <span class="gap">${fmtGap(s.gapMs)}</span>
    </button>`;
  }).join("");

  el.querySelectorAll(".gear").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-speed");
      await cmd("setSpeed", { speedId: id });
      refresh();
    });
  });
}

function renderHero(speedId, state) {
  const s = SPEED_BY_ID[speedId] || SPEED_BY_ID.job;
  document.getElementById("speedName").textContent = s.name;
  document.getElementById("speedSub").textContent = s.sub;
  document.getElementById("speedEmoji").textContent = s.emoji;
  document.getElementById("speedBlurb").textContent = s.blurb;

  const hard = document.getElementById("hardBanner");
  const until = state.hardUntil || 0;
  if (until > Date.now()) {
    hard.classList.remove("hidden");
    const sec = Math.max(0, Math.ceil((until - Date.now()) / 1000));
    const m = Math.floor(sec / 60);
    const sRem = sec % 60;
    document.getElementById("hardMsg").textContent =
      m > 0
        ? `Hard gate cool-down · ${m}m ${sRem}s left (Molasses). `
        : `Hard gate cool-down · ${sRem}s left (Molasses). `;
  } else {
    hard.classList.add("hidden");
  }
}

function render(summary, state, displayLevel) {
  const level = displayLevel || summary.level || "idle";
  const pill = document.getElementById("levelPill");
  pill.className = `pill ${level === "armed" ? "ok" : level}`;
  pill.textContent =
    level === "hard"
      ? "hard gate"
      : level === "soft"
        ? "soft throttle"
        : level === "ok"
          ? "healthy"
          : level === "armed"
            ? "armed · watching"
            : level === "idle"
              ? "idle · open Flow"
              : level;

  const diag = document.getElementById("diag");
  if (diag) {
    const inj = state.injectReadyAt
      ? `inject ok (${Math.round((Date.now() - state.injectReadyAt) / 1000)}s ago)`
      : "inject not seen — hard-refresh Flow";
    const wr = `net hits: ${state.webRequestHits || 0}`;
    const n = `gens: ${(state.events && state.events.length) || 0}`;
    const sample = state.lastUrlSample
      ? redactUrl(state.lastUrlSample)
      : "no generate URL yet";
    diag.textContent = `${inj} · ${wr} · ${n}\n${sample}`;
  }

  document.getElementById("nTotal").textContent = summary.total || 0;
  document.getElementById("nOk").textContent = summary.ok || 0;
  document.getElementById("nSoft").textContent = summary.soft || 0;
  document.getElementById("nHard").textContent = summary.hard || 0;
  document.getElementById("nFilter").textContent = summary.filter || 0;
  const pass = document.getElementById("passLine");
  if (pass) {
    pass.textContent =
      summary.total > 0
        ? `pass rate ${summary.passPct ?? 0}% · gear ${state.speedId || "job"}`
        : "pass rate — generate on Flow to start";
  }

  document.getElementById("mon").checked = state.monitoring !== false;
  document.getElementById("autoThrottle").checked = state.autoThrottle !== false;
  document.getElementById("autoMode").checked = state.autoMode !== false;

  const speedId = state.speedId || "job";
  renderHero(speedId, state);
  renderLadder(speedId);

  const fanEl = document.getElementById("fan");
  const fan = summary.fan || [];
  if (!fan.length) {
    fanEl.className = "fan empty";
    fanEl.textContent = "Generate on Flow to populate";
  } else {
    fanEl.className = "fan";
    fanEl.innerHTML = fan
      .slice(0, 10)
      .map((row) => {
        const bad = row.pct < 25 && row.total >= 2;
        return `<div class="fan-row ${bad ? "bad" : ""}">
          <span>pos ${row.pos}</span>
          <span class="bar"><i style="width:${Math.max(row.pct, 2)}%"></i></span>
          <span>${fmtPct(row.pct)}</span>
        </div>`;
      })
      .join("");
  }

  const feed = document.getElementById("feed");
  const events = [...(state.events || [])].reverse().slice(0, 40);
  if (!events.length) {
    feed.className = "feed empty";
    feed.textContent = "Waiting for generate calls…";
  } else {
    feed.className = "feed";
    feed.innerHTML = events
      .map((e) => {
        const t = new Date(e.startedAt).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        });
        const paced =
          e.paced && e.paced.delayedMs
            ? ` · paced ${e.paced.delayedMs}ms`
            : "";
        return `<div class="ev">
          <span class="st ${e.sev}">${e.status}</span>
          <span class="meta">${t} · ${e.model || "?"}${paced}</span>
          <span class="cls" title="${e.cls}">${e.cls}</span>
        </div>`;
      })
      .join("");
  }
}

async function refresh() {
  const res = await cmd("getState");
  if (!res) return;
  render(res.summary || {}, res.state || {}, res.displayLevel);
}

document.getElementById("btnClear").addEventListener("click", async () => {
  await cmd("clear");
  flash("Session cleared");
  refresh();
});

document.getElementById("btnClearHard").addEventListener("click", async () => {
  await cmd("clearHard");
  flash("Cool-down cleared");
  refresh();
});

document.getElementById("mon").addEventListener("change", async (e) => {
  await cmd("setMonitoring", { value: e.target.checked });
});

document.getElementById("autoThrottle").addEventListener("change", async (e) => {
  await cmd("setAutoThrottle", { value: e.target.checked });
  refresh();
});

document.getElementById("autoMode").addEventListener("change", async (e) => {
  await cmd("setAutoMode", { value: e.target.checked });
  refresh();
});

document.getElementById("btnExport").addEventListener("click", async () => {
  const res = await cmd("export");
  if (!res || !res.report) return;
  const text = JSON.stringify(res.report, null, 2);
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `flow-fixer-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
  a.click();
  URL.revokeObjectURL(url);
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    /* ignore */
  }
  flash("JSON exported (+ copied if allowed)");
});

document.getElementById("btnCopy").addEventListener("click", async () => {
  const res = await cmd("copyReport");
  if (!res || !res.markdown) return;
  try {
    await navigator.clipboard.writeText(res.markdown);
    flash("Markdown report copied");
  } catch {
    flash("Clipboard blocked — try Export JSON");
  }
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.channel === "flow-fixer-update") refresh();
});

refresh();
setInterval(refresh, 1000);
