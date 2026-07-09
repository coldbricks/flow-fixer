function cmd(cmd, extra = {}) {
  return chrome.runtime.sendMessage({ channel: "flow-fixer-cmd", cmd, ...extra });
}

function fmtPct(n) {
  return `${n.toFixed(0)}%`;
}

function render(summary, state) {
  const level = summary.level || "idle";
  const pill = document.getElementById("levelPill");
  pill.className = `pill ${level}`;
  pill.textContent =
    level === "hard"
      ? "hard gate"
      : level === "soft"
        ? "soft throttle"
        : level === "ok"
          ? "healthy"
          : level === "idle"
            ? "idle"
            : level;

  document.getElementById("nTotal").textContent = summary.total || 0;
  document.getElementById("nOk").textContent = summary.ok || 0;
  document.getElementById("nSoft").textContent = summary.soft || 0;
  document.getElementById("nHard").textContent = summary.hard || 0;

  const mon = document.getElementById("mon");
  mon.checked = state.monitoring !== false;

  // Fan
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

  // Feed
  const feed = document.getElementById("feed");
  const events = [...(state.events || [])].reverse().slice(0, 40);
  if (!events.length) {
    feed.className = "feed empty";
    feed.textContent = "Waiting for generate calls on labs.google…";
  } else {
    feed.className = "feed";
    feed.innerHTML = events
      .map((e) => {
        const t = new Date(e.startedAt).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        });
        return `<div class="ev">
          <span class="st ${e.sev}">${e.status}</span>
          <span class="meta">${t} · ${e.model || "?"}</span>
          <span class="cls" title="${e.cls}">${e.cls}</span>
        </div>`;
      })
      .join("");
  }
}

async function refresh() {
  const res = await cmd("getState");
  if (!res) return;
  render(res.summary || {}, res.state || {});
}

document.getElementById("btnClear").addEventListener("click", async () => {
  await cmd("clear");
  refresh();
});

document.getElementById("mon").addEventListener("change", async (e) => {
  await cmd("setMonitoring", { value: e.target.checked });
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
    /* download is enough */
  }
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.channel === "flow-fixer-update") {
    refresh();
  }
});

refresh();
setInterval(refresh, 1500);
