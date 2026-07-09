/** Redact account-adjacent identifiers for display/export. */

const PROJECT_UUID =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

export function redactUrl(url) {
  if (!url) return "";
  let s = String(url);
  s = s.replace(/^https?:\/\/[^/]+/i, "");
  s = s.replace(/\/projects\/[0-9a-f-]{20,}/gi, "/projects/<redacted>");
  s = s.replace(PROJECT_UUID, "<redacted>");
  return s;
}

export function redactText(text) {
  if (!text) return "";
  return String(text)
    .replace(/\/projects\/[0-9a-f-]{20,}/gi, "/projects/<redacted>")
    .replace(PROJECT_UUID, "<redacted>");
}
