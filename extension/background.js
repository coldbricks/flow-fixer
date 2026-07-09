/**
 * Service worker: events, AUTO-THROTTLE policy, badge, export.
 */
import { classify, severity, summarize } from "./lib/classify.js";
import {
  SPEEDS,
  SPEED_BY_ID,
  DEFAULT_SPEED_ID,
  HARD_COOLDOWN_MS,
  speedIndex,
  speedByIndex,
  nextAutoIndex,
} from "./lib/speeds.js";

const MAX_EVENTS = 500;
const STORAGE_KEY = "flowFixerState";

const defaultState = () => ({
  events: [],
  sessionStartedAt: Date.now(),
  monitoring: true,
  autoThrottle: true,
  autoMode: true,
  speedId: DEFAULT_SPEED_ID,
  hardUntil: 0,
  okStreak: 0,
  lastLevel: "idle",
  lastToast: null,
});

async function loadState() {
  const data = await chrome.storage.session.get(STORAGE_KEY);
  return { ...defaultState(), ...(data[STORAGE_KEY] || {}) };
}

async function saveState(state) {
  await chrome.storage.session.set({ [STORAGE_KEY]: state });
}

function publicConfig(state) {
  return {
    monitoring: state.monitoring !== false,
    autoThrottle: !!state.autoThrottle,
    autoMode: !!state.autoMode,
    speedId: state.speedId || DEFAULT_SPEED_ID,
    hardUntil: state.hardUntil || 0,
  };
}

async function broadcastConfig(state) {
  const config = publicConfig(state);
  try {
    const tabs = await chrome.tabs.query({ url: "https://labs.google/*" });
    for (const t of tabs) {
      if (t.id != null) {
        chrome.tabs.sendMessage(t.id, { channel: "flow-fixer-config", config }).catch(() => {});
      }
    }
  } catch {
    /* ignore */
  }
}

function badgeFor(level, autoThrottle) {
  if (autoThrottle && level === "hard") return { text: "❄", color: "#f85149" };
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
      return { text: autoThrottle ? "⏱" : "", color: "#58a6ff" };
  }
}

async function setBadge(level, autoThrottle) {
  const b = badgeFor(level, autoThrottle);
  await chrome.action.setBadgeText({ text: b.text });
  if (b.text) await chrome.action.setBadgeBackgroundColor({ color: b.color });
}

async function applySpeed(state, speedId, reason) {
  state.speedId = speedId;
  state.lastToast = { speedId, reason, at: Date.now() };
  await saveState(state);
  await broadcastConfig(state);
}

async function ingest(payload) {
  if (payload.type === "ready" || payload.type === "need_config") {
    const state = await loadState();
    await broadcastConfig(state);
    return;
  }

  if (payload.type === "throttle") {
    const state = await loadState();
    if (payload.speedId && SPEED_BY_ID[payload.speedId]) {
      state.speedId = payload.speedId;
    }
    if (payload.action === "hard_cooldown") {
      state.hardUntil = payload.hardUntil || Date.now() + HARD_COOLDOWN_MS;
      state.okStreak = 0;
      state.lastLevel = "hard";
      state.speedId = "molasses";
    }
    if (payload.action === "soft_downshift") {
      state.okStreak = 0;
      state.lastLevel = "soft";
    }
    if (payload.action === "ok" && state.autoMode) {
      state.okStreak = (state.okStreak || 0) + 1;
      const i = speedIndex(state.speedId);
      const ni = nextAutoIndex(i, "ok", state.okStreak);
      if (ni !== i) {
        state.speedId = speedByIndex(ni).id;
        state.lastToast = {
          speedId: state.speedId,
          reason: "auto upshift on clean streak",
          at: Date.now(),
        };
      }
    }
    await saveState(state);
    await broadcastConfig(state);
    await setBadge(state.lastLevel, state.autoThrottle);
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
    paced: payload.paced || null,
    respSnippet: (payload.respText || "").slice(0, 280),
  };

  state.events.push(ev);
  if (state.events.length > MAX_EVENTS) {
    state.events = state.events.slice(-MAX_EVENTS);
  }

  const summary = summarize(state.events);
  let level = summary.level;
  if (ev.sev === "hard") level = "hard";
  else if (ev.sev === "soft" && level !== "hard") level = "soft";
  else if (ev.sev === "filter" && level !== "hard" && level !== "soft")
    level = "filter";
  state.lastLevel = level;

  // Server-side auto policy (mirrors inject, keeps UI in sync)
  if (state.autoThrottle && state.autoMode) {
    if (ev.sev === "hard") {
      state.speedId = "molasses";
      state.hardUntil = Date.now() + HARD_COOLDOWN_MS;
      state.okStreak = 0;
    } else if (ev.sev === "soft") {
      const i = speedIndex(state.speedId);
      state.speedId = speedByIndex(nextAutoIndex(i, "soft", 0)).id;
      state.okStreak = 0;
    } else if (ev.sev === "ok") {
      state.okStreak = (state.okStreak || 0) + 1;
      const i = speedIndex(state.speedId);
      const ni = nextAutoIndex(i, "ok", state.okStreak);
      if (ni !== i) state.speedId = speedByIndex(ni).id;
    }
  }

  await saveState(state);
  await setBadge(level, state.autoThrottle);
  await broadcastConfig(state);

  try {
    chrome.runtime.sendMessage({
      channel: "flow-fixer-update",
      summary: summarize(state.events),
      last: ev,
      config: publicConfig(state),
    });
  } catch {
    /* no listeners */
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
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
          speeds: SPEEDS,
          config: publicConfig(state),
        });
        return;
      }
      if (msg.cmd === "getConfig") {
        const state = await loadState();
        sendResponse({ config: publicConfig(state) });
        return;
      }
      if (msg.cmd === "clear") {
        const prev = await loadState();
        const s = defaultState();
        s.monitoring = prev.monitoring;
        s.autoThrottle = prev.autoThrottle;
        s.autoMode = prev.autoMode;
        s.speedId = prev.speedId;
        await saveState(s);
        await setBadge("idle", s.autoThrottle);
        await broadcastConfig(s);
        sendResponse({ ok: true });
        return;
      }
      if (msg.cmd === "setMonitoring") {
        const state = await loadState();
        state.monitoring = !!msg.value;
        await saveState(state);
        await broadcastConfig(state);
        sendResponse({ ok: true });
        return;
      }
      if (msg.cmd === "setAutoThrottle") {
        const state = await loadState();
        state.autoThrottle = !!msg.value;
        await saveState(state);
        await broadcastConfig(state);
        await setBadge(state.lastLevel, state.autoThrottle);
        sendResponse({ ok: true });
        return;
      }
      if (msg.cmd === "setAutoMode") {
        const state = await loadState();
        state.autoMode = !!msg.value;
        await saveState(state);
        await broadcastConfig(state);
        sendResponse({ ok: true });
        return;
      }
      if (msg.cmd === "setSpeed") {
        const state = await loadState();
        if (SPEED_BY_ID[msg.speedId]) {
          state.speedId = msg.speedId;
          if (msg.speedId !== "molasses") {
            // manual upshift clears hard cool only if user forces casey/etc? keep hardUntil
          }
          await saveState(state);
          await broadcastConfig(state);
        }
        sendResponse({ ok: true, speedId: state.speedId });
        return;
      }
      if (msg.cmd === "clearHard") {
        const state = await loadState();
        state.hardUntil = 0;
        await saveState(state);
        await broadcastConfig(state);
        sendResponse({ ok: true });
        return;
      }
      if (msg.cmd === "export") {
        const state = await loadState();
        const summary = summarize(state.events);
        const report = {
          tool: "flow-fixer-extension",
          version: "0.2.0",
          exportedAt: new Date().toISOString(),
          sessionStartedAt: new Date(state.sessionStartedAt).toISOString(),
          autoThrottle: state.autoThrottle,
          autoMode: state.autoMode,
          speedId: state.speedId,
          summary,
          events: state.events.map((e) => ({
            startedAt: new Date(e.startedAt).toISOString(),
            status: e.status,
            cls: e.cls,
            model: e.model,
            batchId: e.batchId,
            paced: e.paced,
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
  await setBadge("idle", true);
});
