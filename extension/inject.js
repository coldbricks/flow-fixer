/**
 * MAIN-world inject: observe Flow generate fetch/XHR without HAR export.
 * Does not modify requests. Does not forge tokens. Read-only.
 */
(function () {
  "use strict";
  if (window.__FLOW_FIXER_INJECTED__) return;
  window.__FLOW_FIXER_INJECTED__ = true;

  const SOURCE = "flow-fixer-inject";
  const GEN_RE = /aisandbox-pa\.googleapis\.com\/.*[Gg]enerate/i;
  const SKIP_RE = /Status|LogFrontend|batchCheck/i;

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
    // Drop live captcha tokens; keep structure/reasons
    return text
      .replace(/("token"\s*:\s*")([^"]{40,})(")/gi, '$1<REDACTED>$3')
      .replace(/("projectId"\s*:\s*")([^"]+)(")/gi, '$1<REDACTED>$3')
      .replace(/("sessionId"\s*:\s*")([^"]+)(")/gi, '$1<REDACTED>$3');
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

  async function handleResponse(url, method, startedAt, reqText, response) {
    if (!isGenerate(url)) return;
    let respText = "";
    let size = -1;
    try {
      const clone = response.clone();
      respText = await clone.text();
      size = respText.length;
    } catch {
      /* opaque or failed */
    }
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
    });
  }

  // ---- fetch ----
  const origFetch = window.fetch;
  window.fetch = async function (input, init) {
    const url = typeof input === "string" ? input : input && input.url;
    const method =
      (init && init.method) ||
      (typeof input !== "string" && input && input.method) ||
      "GET";
    const startedAt = Date.now();
    let reqText = "";
    if (isGenerate(url)) {
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
    }
    const response = await origFetch.apply(this, arguments);
    if (isGenerate(url)) {
      handleResponse(url, method, startedAt, reqText, response).catch(() => {});
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

    const open = xhr.open;
    xhr.open = function (m, u) {
      method = m;
      url = u;
      return open.apply(xhr, arguments);
    };

    const send = xhr.send;
    xhr.send = function (body) {
      if (isGenerate(url)) {
        startedAt = Date.now();
        reqText = typeof body === "string" ? body : "";
        xhr.addEventListener("loadend", function () {
          emit({
            type: "generate",
            url: String(url).split("?")[0],
            method,
            status: xhr.status,
            startedAt,
            endedAt: Date.now(),
            reqText: scrubBody(clip(reqText, 4000)),
            respText: scrubBody(clip(xhr.responseText || "", 2000)),
            respSize: (xhr.responseText || "").length,
            model: modelFrom(reqText || ""),
            seed: seedFrom(reqText || ""),
            batchId: batchIdFrom(reqText || ""),
          });
        });
      }
      return send.apply(xhr, arguments);
    };

    return xhr;
  }
  WrappedXHR.prototype = OrigXHR.prototype;
  window.XMLHttpRequest = WrappedXHR;

  emit({ type: "ready", startedAt: Date.now() });
})();
