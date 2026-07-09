# Flow Fixer — browser extension

Live reliability monitor for [Google Flow](https://labs.google/fx/tools/flow).  
**No HAR export.** Watches generate calls in the page, classifies soft vs hard vs filter, shows fan-out pass rates.

Read-only. Does **not** change requests, forge reCAPTCHA, or automate generation.

## Install (Chrome / Edge / Brave — unpacked)

1. Open `chrome://extensions` (or `edge://extensions`)
2. Enable **Developer mode**
3. **Load unpacked** → select this folder:  
   `flow-fixer/extension`
4. Open [Flow](https://labs.google/fx/tools/flow) and **refresh** the tab (required once)
5. Click the **Flow Fixer** toolbar icon

Pin the extension for a live badge (`ok` / `~` soft / `!` hard).

## AUTO-THROTTLE (the fun part)

Optional **pace control** on *your* generate calls. Does not forge captcha or strip tokens.
It **serializes / delays** requests so multi-output and Retry don’t redline the scorer.

### Speed ladder (slow → yeehaw)

| Gear | Vibe | Gap (approx) |
|------|------|--------------|
| 🧊 **Molasses** | in January — way under throttle | ~9s |
| 💧 **Water** | room temp | ~4.5s |
| 🚶 **Brisk Walk** | coffee in hand | ~2.5s |
| 💼 **The Job** | paid to ship (default) | ~1.2s |
| 🎸 **Highway Star** | Deep Purple | ~0.6s |
| 🐎 **Black Beauty** | full gallop | ~0.3s |
| 🚂 **Casey Jones** | danger at the wheel | parallel / full send |

**Auto shift (default ON):**
- soft throttle → downshift 2 gears  
- hard unusual → **Molasses** + ~12 min cool-down hold  
- clean OK streak → gradual upshift  

On-page toast when it downshifts. Toolbar badge: `⏱` armed, `~` soft, `!` / `❄` hard.

Turn **AUTO-THROTTLE** off anytime to go pure monitor mode.

## What you’ll see

| UI | Meaning |
|----|---------|
| **Speed ladder** | Pick a gear or let Auto shift drive |
| **ok / soft / hard** pill | Session health |
| **Fan position pass %** | First-in-burst vs tail |
| **Recent** | Status + model + pace delay |
| **Export** | Sanitized JSON (no tokens/prompts) |

## How it works

1. A **MAIN-world** script on `labs.google` wraps `fetch` / `XHR` (observe only).
2. Generate calls to `aisandbox-pa.googleapis.com` are classified with the same rules as the Python CLI.
3. The service worker keeps the last 500 events in `chrome.storage.session`.
4. The popup renders stats; the badge turns red on hard unusual-activity.

## Privacy

- Tokens / projectId / sessionId are redacted in the bridge.
- Export omits request bodies and prompts.
- Nothing is sent to a third-party server — all local.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Always idle | Refresh the Flow tab after install; generate once |
| No events | Confirm you’re on `https://labs.google/...` |
| Extension errors | `chrome://extensions` → Errors on Flow Fixer |

## Pair with the CLI

For deep sticky-gate / multi-hour analysis, you can still export a HAR and run:

```bash
python -m flowfixer analyze capture.har
```

The extension is for **live** signal; the CLI is for **full-session** forensics.
