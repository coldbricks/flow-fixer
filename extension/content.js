/**
 * Isolated content script: bridge MAIN inject ↔ background; push throttle config.
 */
(function () {
  "use strict";
  const SOURCE = "flow-fixer-inject";
  const CFG_SOURCE = "flow-fixer-config";

  function pushConfig(config) {
    window.postMessage({ source: CFG_SOURCE, config }, "*");
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== SOURCE) return;

    if (data.type === "need_config") {
      chrome.runtime.sendMessage(
        { channel: "flow-fixer-cmd", cmd: "getConfig" },
        (res) => {
          if (res && res.config) pushConfig(res.config);
        }
      );
      return;
    }

    try {
      chrome.runtime.sendMessage({ channel: "flow-fixer", payload: data });
    } catch {
      /* extension reloaded */
    }
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.channel === "flow-fixer-config" && msg.config) {
      pushConfig(msg.config);
    }
  });

  // initial config pull
  try {
    chrome.runtime.sendMessage(
      { channel: "flow-fixer-cmd", cmd: "getConfig" },
      (res) => {
        if (res && res.config) pushConfig(res.config);
      }
    );
  } catch {
    /* ignore */
  }
})();
