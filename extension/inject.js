/**
 * MAIN-world inject: observe + optional AUTO-THROTTLE pace control.
 * Never forges tokens. Never strips reCAPTCHA. Only delays / serializes
 * the user's own generate calls when they opt into pacing.
 */
(function () {
  "use strict";
  if (window.__FLOW_FIXER_INJECTED__) return;
  window.__FLOW_FIXER_INJECTED__ = true;

  const SOURCE = "flow-fixer-inject";
  const CFG_SOURCE = "flow-fixer-config";
  const GEN_RE = /aisandbox-pa\.googleapis\.com\/.*[Gg]enerate/i;
  const SKIP_RE = /Status|LogFrontend|batchCheck/i;

  const SPEEDS = {
    molasses: { id: "molasses", name: "Molasses", gapMs: 9000, serialize: true, staggerMs: 900 },
    water: { id: "water", name: "Water", gapMs: 4500, serialize: true, staggerMs: 600 },
    brisk: { id: "brisk", name: "Brisk Walk", gapMs: 2500, serialize: true, staggerMs: 400 },
    job: { id: "job", name: "The Job", gapMs: 1200, serialize: true, staggerMs: 300 },
    highway_star: { id: "highway_star", name: "Highway Star", gapMs: 600, serialize: true, staggerMs: 200 },
    black_beauty: { id: "black_beauty", name: "Black Beauty", gapMs: 300, serialize: true, staggerMs: 120 },
    casey_jones: { id: "casey_jones", name: "Casey Jones", gapMs: 0, serialize: false, staggerMs: 0 },
  };

  let cfg = {
    monitoring: true,
    autoThrottle: true,
    autoMode: true, // climb/downshift automatically
    speedId: "job",
    hardUntil: 0,
  };

  let lastStartAt = 0;
  let chain = Promise.resolve();
  let toastEl = null;
  let toastTimer = null;

  function isGenerate(url) {
    try {
      return GEN_RE.test(url) && !SKIP_RE.test(url);
    } catch {
      return false;
    }
  }

  function emit(payload) {
    window.postMessage({ source: SOURCE, ...payload }, "*");
  }

  function clip(s, n) {
    if (s == null) return "";
    s = String(s);
    return s.length > n ? s.slice(0, n) + "…" : s;
  }

  function scrubBody(text) {
    if (!text) return "";
    return text
      .replace(/("token"\s*:\s*")([^"]{40,})(")/gi, "$1<REDACTED>$3")
      .replace(/("projectId"\s*:\s*")([^"]+)(")/gi, "$1<REDACTED>$3")
      .replace(/("sessionId"\s*:\s*")([^"]+)(")/gi, "$1<REDACTED>$3");
  }

  function modelFrom(reqText) {
    const m = reqText.match(
      /"(?:imageModelName|videoModelName|videoModelKey|modelName)"\s*:\s*"([^"]+)"/
    );
    return m ? m[1] : "?";
  }

  function seedFrom(reqText) {
    const m = reqText.match(/"seed"\s*:\s*(\d+)/);
    return m ? m[1] : null;
  }

  function batchIdFrom(reqText) {
    const m = reqText.match(/"batchId"\s*:\s*"([^"]+)"/);
    return m ? m[1] : null;
  }

  function activeSpeed() {
    return SPEEDS[cfg.speedId] || SPEEDS.job;
  }

  function ensureToast() {
    if (toastEl) return toastEl;
    const style = document.createElement("style");
    style.textContent = `
      #flow-fixer-toast {
        position: fixed; z-index: 2147483646; right: 18px; bottom: 18px;
        min-width: 220px; max-width: 340px;
        padding: 12px 14px; border-radius: 14px;
        font: 600 12px/1.35 ui-sans-serif, system-ui, sans-serif;
        color: #e6edf3;
        background: linear-gradient(145deg, rgba(22,27,34,0.96), rgba(13,17,23,0.98));
        border: 1px solid rgba(88,166,255,0.35);
        box-shadow: 0 12px 40px rgba(0,0,0,0.55), 0 0 0 1px rgba(163,113,247,0.15) inset;
        backdrop-filter: blur(10px);
        opacity: 0; transform: translateY(10px); transition: opacity .2s, transform .2s;
        pointer-events: none;
      }
      #flow-fixer-toast.show { opacity: 1; transform: translateY(0); }
      #flow-fixer-toast .ff-kicker {
        font-size: 10px; letter-spacing: .12em; text-transform: uppercase;
        color: #8b949e; margin-bottom: 4px;
      }
      #flow-fixer-toast .ff-title { font-size: 14px; color: #58a6ff; }
      #flow-fixer-toast .ff-title.hard { color: #f85149; }
      #flow-fixer-toast .ff-title.soft { color: #d29922; }
      #flow-fixer-toast .ff-body { margin-top: 4px; color: #c9d1d9; font-weight: 500; }
    `;
    document.documentElement.appendChild(style);
    toastEl = document.createElement("div");
    toastEl.id = "flow-fixer-toast";
    document.documentElement.appendChild(toastEl);
    return toastEl;
  }

  function toast(title, body, kind) {
    try {
      const el = ensureToast();
      el.innerHTML =
        `<div class="ff-kicker">Flow Fixer · AUTO-THROTTLE</div>` +
        `<div class="ff-title ${kind || ""}">${title}</div>` +
        (body ? `<div class="ff-body">${body}</div>` : "");
      el.classList.add("show");
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => el.classList.remove("show"), 3200);
    } catch {
      /* page may block */
    }
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function classifyLocal(status, body, size) {
    body = body || "";
    if (status === 200) return "OK";
    if (body.includes("TOO_MUCH_TRAFFIC") || body.includes("PUBLIC_ERROR_UNUSUAL_ACTIVITY"))
      return "HARD_UNUSUAL";
    if (body.includes("USER_REQUESTS_THROTTLED")) return "SOFT_THROTTLE";
    if (status === 429 && size === 287) return "HARD_UNUSUAL";
    if (status === 429 && size === 297) return "SOFT_THROTTLE";
    if (status === 429) return "HARD_UNUSUAL";
    if (status === 403) return "HARD_UNUSUAL";
    return "OTHER";
  }

  /**
   * Pace gate: optional hard cooldown + min gap + optional serialize queue.
   */
  async function paceBeforeGenerate() {
    if (!cfg.autoThrottle) return { delayedMs: 0, speedId: cfg.speedId };

    const now = Date.now();
    let delayed = 0;
    const spd = activeSpeed();

    if (cfg.hardUntil && now < cfg.hardUntil) {
      const wait = cfg.hardUntil - now;
      toast(
        "Hard gate · cooling",
        `Holding ${Math.ceil(wait / 1000)}s — sticky unusual-activity respect.`,
        "hard"
      );
      await sleep(wait);
      delayed += wait;
      cfg.hardUntil = 0;
    }

    const gap = spd.gapMs || 0;
    if (gap > 0 && lastStartAt) {
      const since = Date.now() - lastStartAt;
      if (since < gap) {
        const wait = gap - since;
        await sleep(wait);
        delayed += wait;
      }
    }

    // serialize: chain so parallel fan-out becomes a line
    if (spd.serialize) {
      const prev = chain;
      let release;
      chain = new Promise((r) => {
        release = r;
      });
      await prev;
      if (spd.staggerMs) {
        await sleep(spd.staggerMs);
        delayed += spd.staggerMs;
      }
      // release after this call starts (caller continues); actual release after start stamped
      // We release at end of paceBefore so next waiter can start after stagger from previous start
      lastStartAt = Date.now();
      release();
      return { delayedMs: delayed, speedId: spd.id, serialized: true };
    }

    lastStartAt = Date.now();
    return { delayedMs: delayed, speedId: spd.id, serialized: false };
  }

  async function noteOutcome(status, respText, size) {
    if (!cfg.autoThrottle) return;
    const cls = classifyLocal(status, respText, size);
    if (cls === "HARD_UNUSUAL") {
      cfg.hardUntil = Date.now() + 12 * 60 * 1000;
      cfg.speedId = "molasses";
      toast("Downshift → Molasses", "Hard unusual-activity. 12 min cool + thick pace.", "hard");
      emit({
        type: "throttle",
        action: "hard_cooldown",
        speedId: "molasses",
        hardUntil: cfg.hardUntil,
      });
    } else if (cls === "SOFT_THROTTLE") {
      // drop two gears locally; background may refine
      const order = [
        "molasses",
        "water",
        "brisk",
        "job",
        "highway_star",
        "black_beauty",
        "casey_jones",
      ];
      const i = Math.max(0, order.indexOf(cfg.speedId) - 2);
      cfg.speedId = order[i];
      lastStartAt = Date.now() + 3000; // force extra pause
      toast("Downshift → " + (SPEEDS[cfg.speedId] || {}).name, "Soft throttle. Backing off the scorer.", "soft");
      emit({ type: "throttle", action: "soft_downshift", speedId: cfg.speedId });
    } else if (cls === "OK") {
      emit({ type: "throttle", action: "ok", speedId: cfg.speedId });
    }
  }

  async function handleResponse(url, method, startedAt, reqText, response, paceMeta) {
    if (!isGenerate(url)) return;
    let respText = "";
    let size = -1;
    try {
      const clone = response.clone();
      respText = await clone.text();
      size = respText.length;
    } catch {
      /* ignore */
    }
    await noteOutcome(response.status, respText, size);
    emit({
      type: "generate",
      url: url.split("?")[0],
      method: method || "POST",
      status: response.status,
      startedAt,
      endedAt: Date.now(),
      reqText: scrubBody(clip(reqText, 4000)),
      respText: scrubBody(clip(respText, 2000)),
      respSize: size,
      model: modelFrom(reqText || ""),
      seed: seedFrom(reqText || ""),
      batchId: batchIdFrom(reqText || ""),
      paced: paceMeta || null,
    });
  }

  // config from extension
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== CFG_SOURCE) return;
    const c = data.config || {};
    if (typeof c.monitoring === "boolean") cfg.monitoring = c.monitoring;
    if (typeof c.autoThrottle === "boolean") cfg.autoThrottle = c.autoThrottle;
    if (typeof c.autoMode === "boolean") cfg.autoMode = c.autoMode;
    if (c.speedId && SPEEDS[c.speedId]) cfg.speedId = c.speedId;
    if (typeof c.hardUntil === "number") cfg.hardUntil = c.hardUntil;
  });

  // ---- fetch ----
  const origFetch = window.fetch;
  window.fetch = async function (input, init) {
    const url = typeof input === "string" ? input : input && input.url;
    const method =
      (init && init.method) ||
      (typeof input !== "string" && input && input.method) ||
      "GET";
    let reqText = "";
    let paceMeta = null;
    let startedAt = Date.now();

    if (isGenerate(url) && cfg.monitoring) {
      try {
        if (init && init.body) {
          reqText = typeof init.body === "string" ? init.body : "";
        } else if (typeof input !== "string" && input && typeof input.clone === "function") {
          try {
            reqText = await input.clone().text();
          } catch {
            /* ignore */
          }
        }
      } catch {
        /* ignore */
      }
      paceMeta = await paceBeforeGenerate();
      startedAt = Date.now();
    }

    const response = await origFetch.apply(this, arguments);
    if (isGenerate(url) && cfg.monitoring) {
      handleResponse(url, method, startedAt, reqText, response, paceMeta).catch(() => {});
    }
    return response;
  };

  // ---- XHR ----
  const OrigXHR = window.XMLHttpRequest;
  function WrappedXHR() {
    const xhr = new OrigXHR();
    let url = "";
    let method = "GET";
    let reqText = "";
    let startedAt = 0;
    let paceMeta = null;

    const open = xhr.open;
    xhr.open = function (m, u) {
      method = m;
      url = u;
      return open.apply(xhr, arguments);
    };

    const send = xhr.send;
    xhr.send = function (body) {
      const args = arguments;
      const run = async () => {
        if (isGenerate(url) && cfg.monitoring) {
          reqText = typeof body === "string" ? body : "";
          paceMeta = await paceBeforeGenerate();
          startedAt = Date.now();
          xhr.addEventListener("loadend", function () {
            const respText = xhr.responseText || "";
            noteOutcome(xhr.status, respText, respText.length);
            emit({
              type: "generate",
              url: String(url).split("?")[0],
              method,
              status: xhr.status,
              startedAt,
              endedAt: Date.now(),
              reqText: scrubBody(clip(reqText, 4000)),
              respText: scrubBody(clip(respText, 2000)),
              respSize: respText.length,
              model: modelFrom(reqText || ""),
              seed: seedFrom(reqText || ""),
              batchId: batchIdFrom(reqText || ""),
              paced: paceMeta,
            });
          });
        }
        return send.apply(xhr, args);
      };

      if (isGenerate(url) && cfg.monitoring && cfg.autoThrottle) {
        // XHR send must stay sync API; kick async pace then send
        const spd = activeSpeed();
        if (spd.serialize || spd.gapMs || (cfg.hardUntil && Date.now() < cfg.hardUntil)) {
          // defer send until paced
          paceBeforeGenerate().then((meta) => {
            paceMeta = meta;
            startedAt = Date.now();
            reqText = typeof body === "string" ? body : "";
            xhr.addEventListener("loadend", function () {
              const respText = xhr.responseText || "";
              noteOutcome(xhr.status, respText, respText.length);
              emit({
                type: "generate",
                url: String(url).split("?")[0],
                method,
                status: xhr.status,
                startedAt,
                endedAt: Date.now(),
                reqText: scrubBody(clip(reqText, 4000)),
                respText: scrubBody(clip(respText, 2000)),
                respSize: respText.length,
                model: modelFrom(reqText || ""),
                seed: seedFrom(reqText || ""),
                batchId: batchIdFrom(reqText || ""),
                paced: paceMeta,
              });
            });
            send.apply(xhr, args);
          });
          return;
        }
      }
      return run();
    };

    return xhr;
  }
  WrappedXHR.prototype = OrigXHR.prototype;
  window.XMLHttpRequest = WrappedXHR;

  emit({ type: "ready", startedAt: Date.now() });
  // request current config
  emit({ type: "need_config" });
})();
