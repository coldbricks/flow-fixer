/**
 * Service worker: store generate events, badge state, export helpers.
 */
import { classify, severity, summarize } from "./lib/classify.js";

const MAX_EVENTS = 500;
const STORAGE_KEY = "flowFixerState";

const defaultState = () => ({
  events: [],
  sessionStartedAt: Date.now(),
  monitoring: true,
  lastLevel: "idle",
});

async function loadState() {
  const data = await chrome.storage.session.get(STORAGE_KEY);
  return data[STORAGE_KEY] || defaultState();
}

async function saveState(state) {
  await chrome.storage.session.set({ [STORAGE_KEY]: state });
}

function badgeFor(level) {
  switch (level) {
    case "hard":
      return { text: "!", color: "#f85149" };
    case "soft":
      return { text: "~", color: "#d29922" };
    case "ok":
      return { text: "ok", color: "#3fb950" };
    case "filter":
      return { text: "f", color: "#d29922" };
    default:
      return { text: "", color: "#8b949e" };
  }
}

async function setBadge(level) {
  const b = badgeFor(level);
  await chrome.action.setBadgeText({ text: b.text });
  if (b.text) {
    await chrome.action.setBadgeBackgroundColor({ color: b.color });
  }
}

async function ingest(payload) {
  if (payload.type === "ready") {
    return;
  }
  if (payload.type !== "generate") return;

  const state = await loadState();
  if (!state.monitoring) return;

  const cls = classify(
    payload.status,
    payload.respText || "",
    payload.respSize ?? -1
  );
  const ev = {
    id: `${payload.startedAt}-${Math.random().toString(36).slice(2, 8)}`,
    startedAt: payload.startedAt,
    endedAt: payload.endedAt,
    status: payload.status,
    cls,
    sev: severity(cls),
    model: payload.model || "?",
    batchId: payload.batchId || null,
    seed: payload.seed || null,
    url: payload.url || "",
    respSnippet: (payload.respText || "").slice(0, 280),
  };

  state.events.push(ev);
  if (state.events.length > MAX_EVENTS) {
    state.events = state.events.slice(-MAX_EVENTS);
  }

  const summary = summarize(state.events);
  // Prefer hard over soft for badge; if last event is filter and no hard, show filter
  let level = summary.level;
  if (ev.sev === "hard") level = "hard";
  else if (ev.sev === "soft" && level !== "hard") level = "soft";
  else if (ev.sev === "filter" && level !== "hard" && level !== "soft")
    level = "filter";

  state.lastLevel = level;
  await saveState(state);
  await setBadge(level);

  // Notify open popups
  try {
    chrome.runtime.sendMessage({
      channel: "flow-fixer-update",
      summary,
      last: ev,
    });
  } catch {
    /* no listeners */
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.channel !== "flow-fixer") {
    // popup commands use channel flow-fixer-cmd
  }

  if (msg && msg.channel === "flow-fixer" && msg.payload) {
    ingest(msg.payload).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (msg && msg.channel === "flow-fixer-cmd") {
    (async () => {
      if (msg.cmd === "getState") {
        const state = await loadState();
        sendResponse({
          state,
          summary: summarize(state.events),
        });
        return;
      }
      if (msg.cmd === "clear") {
        const s = defaultState();
        s.monitoring = (await loadState()).monitoring;
        await saveState(s);
        await setBadge("idle");
        sendResponse({ ok: true });
        return;
      }
      if (msg.cmd === "setMonitoring") {
        const state = await loadState();
        state.monitoring = !!msg.value;
        await saveState(state);
        sendResponse({ ok: true, monitoring: state.monitoring });
        return;
      }
      if (msg.cmd === "export") {
        const state = await loadState();
        const summary = summarize(state.events);
        const report = {
          tool: "flow-fixer-extension",
          version: "0.1.0",
          exportedAt: new Date().toISOString(),
          sessionStartedAt: new Date(state.sessionStartedAt).toISOString(),
          summary,
          events: state.events.map((e) => ({
            startedAt: new Date(e.startedAt).toISOString(),
            status: e.status,
            cls: e.cls,
            model: e.model,
            batchId: e.batchId,
            // no raw tokens/prompts in export
          })),
        };
        sendResponse({ ok: true, report });
        return;
      }
      sendResponse({ ok: false, error: "unknown cmd" });
    })();
    return true;
  }

  return false;
});

chrome.runtime.onInstalled.addListener(async () => {
  await saveState(defaultState());
  await setBadge("idle");
});
