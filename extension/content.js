/**
 * Isolated content script: bridge MAIN-world inject → extension background.
 */
(function () {
  "use strict";
  const SOURCE = "flow-fixer-inject";

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== SOURCE) return;
    try {
      chrome.runtime.sendMessage({ channel: "flow-fixer", payload: data });
    } catch {
      /* extension reloaded */
    }
  });
})();
