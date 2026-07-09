/** Shared URL matching for generate calls. */

export function isGenerateUrl(url) {
  if (!url || typeof url !== "string") return false;
  if (!/aisandbox-pa\.googleapis\.com/i.test(url)) return false;
  // status polls / telemetry
  if (/batchCheck|Status|LogFrontend|batchLog|uploadImage|credits|Workflows/i.test(url))
    return false;
  // known generate shapes
  if (/[Gg]enerate/i.test(url)) return true;
  if (/flowMedia:/i.test(url)) return true;
  if (/batchAsync/i.test(url) && !/Check|Status/i.test(url)) return true;
  return false;
}

export function contentLength(headers) {
  if (!headers) return -1;
  for (const h of headers) {
    if (h.name && h.name.toLowerCase() === "content-length") {
      const n = parseInt(h.value, 10);
      return Number.isFinite(n) ? n : -1;
    }
  }
  return -1;
}

/** Short endpoint label for UI (no host, no project id). */
export function endpointLabel(url) {
  if (!url) return "";
  let s = String(url).replace(/^https?:\/\/[^/]+/i, "");
  s = s.replace(/\/projects\/[^/]+/i, "/projects/<redacted>");
  // keep last path segments readable
  if (s.length > 72) s = "…" + s.slice(-70);
  return s;
}
