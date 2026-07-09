# Flow Fixer

<p align="center">
  <strong>Reliability toolkit for <a href="https://labs.google/fx/tools/flow">Google Flow</a></strong><br/>
  <sub>HAR forensics · fan-out analysis · engineering brief — not a bypass tool</sub>
</p>

<p align="center">
  <img alt="Python 3.10+" src="https://img.shields.io/badge/python-3.10%2B-blue?style=flat-square"/>
  <img alt="License MIT" src="https://img.shields.io/badge/license-MIT-green?style=flat-square"/>
  <img alt="Scope" src="https://img.shields.io/badge/scope-read--only%20forensics-purple?style=flat-square"/>
  <img alt="Not a bot" src="https://img.shields.io/badge/not-a%20bot%20%2F%20bypass-red?style=flat-square"/>
</p>

Flow Fixer measures a sharp product bug:

**Flow’s UI multiplies one human click into N scored generate calls. Flow’s abuse layer then calls that traffic “unusual activity.”**

It turns a Chrome HAR (or a live session via the extension) into the chart that makes that undeniable — soft vs hard gates, fan-position pass rates, sticky recovery.

It does **not** forge reCAPTCHA, automate generation, or dodge limits. Read-only forensics only.

Staff-eng write-up: **[docs/ENG_BRIEF.md](docs/ENG_BRIEF.md)** — the document that should produce *“ahh shit.”*

<p align="center">
  <img src="docs/assets/ui_unusual_activity.png" alt="Google Flow UI: Failed — We noticed some unusual activity" width="820"/>
</p>
<p align="center">
  <sub>What users see: three dead cards, Retry buttons still armed — the trap that feeds the scorer.</sub>
</p>

<p align="center">
  <img src="docs/assets/cli_preview.png" alt="flowfixer analyze terminal preview" width="820"/>
</p>

### Browser extension (no HAR export)

Live monitor **plus AUTO-THROTTLE** — a speed ladder from **Molasses** (way under the scorer) to **Casey Jones** (full send). Auto downshifts on soft/hard, serializes fan-out so you don’t overspeed into sticky unusual-activity.

```text
Chrome → chrome://extensions → Developer mode → Load unpacked
         → select the extension/ folder → refresh labs.google
```

Full steps: **[extension/README.md](extension/README.md)**

### Python CLI (deep HAR forensics)

```bash
pip install -e .
python -m flowfixer sanitize raw.har -o safe.har
python -m flowfixer analyze safe.har
python -m flowfixer report  safe.har -o report.md
```

---

## The problem in one diagram

<p align="center">
  <img src="docs/assets/architecture.png" alt="One click becomes four scored HTTP generate calls" width="820"/>
</p>

Flow scores **traffic per HTTP generate call** (reCAPTCHA Enterprise → `PUBLIC_ERROR_UNUSUAL_ACTIVITY_TOO_MUCH_TRAFFIC`).  
The UI often turns **one click** into **N parallel generate calls** (multi-output ≈ 4; Retry-All ≈ 12–20), each with its own token.

That mismatch is the bug. Not “the subscriber is a botnet.”

---

## The smoking chart

Pass rate by **fire-order inside a burst** (gap ≤ 2s clusters). First call often lives. The tail dies.

<p align="center">
  <img src="docs/assets/fan_position.png" alt="Pass rate collapses by position in UI fan-out" width="820"/>
</p>

| Observation | What it means |
|-------------|----------------|
| Fresh unique reCAPTCHA tokens on failed calls | Not “stale captcha” |
| Same creative payload, mixed 200 / 429 | Outcome is *when*, not only *what* |
| Soft `USER_REQUESTS_THROTTLED` vs hard `TOO_MUCH_TRAFFIC` | Two different machines |
| Hard gate stays sticky for many minutes | “Wait a couple of minutes” is incomplete |

<p align="center">
  <img src="docs/assets/outcomes.png" alt="Outcome classification examples" width="820"/>
</p>

Full write-up + fix proposals with acceptance tests: **[docs/ENG_BRIEF.md](docs/ENG_BRIEF.md)**

---

## Commands

| Surface | Purpose |
|---------|---------|
| **Browser extension** | Live monitor on `labs.google` — no HAR file |
| `flowfixer sanitize` | Redact cookies, auth, tokens, project/session IDs, credit numbers |
| `flowfixer analyze` | Soft vs hard vs filter · burst clusters · fan-position pass rates |
| `flowfixer report` | Markdown summary for feedback / bugs |

```bash
# never share a raw HAR
python -m flowfixer sanitize ./capture.har -o ./capture.SANITIZED.har
python -m flowfixer analyze ./capture.SANITIZED.har
```

---

## Quick start

**1. Capture** — Chrome DevTools → Network → ☑ Preserve log → reproduce → Export HAR  

**2. Sanitize** — always, before Discord/email/GitHub  

**3. Analyze** — look for `HARD_UNUSUAL`, fan-position collapse, sticky probes  

**4. Operate** — [docs/OPS_DOCTRINE.md](docs/OPS_DOCTRINE.md)  
(output = 1 under pressure · no Retry-All · hard gate → new session)

**5. Map the wire** — [docs/INTERNAL_MAP.md](docs/INTERNAL_MAP.md)

---

## For Flow / Labs engineers

If this landed on your desk, start here:

1. **[docs/ENG_BRIEF.md](docs/ENG_BRIEF.md)** — TL;DR + fan-position + acceptance tests (the “ahh shit” doc)  
2. Fan chart in this README (or run the CLI on your own HAR)  
3. Optional: load the extension, fire multi-output once, watch pos 0 live while the tail 429s  

You do not need a special quota story. You need the UI and the scorer to agree on what a click is.

Sanitized HARs + walkthrough available on request. **Read-only forensics** by design.

---

## What this is not

- Not a bot, undress tool, or “unlimited Veo” script  
- Not a reCAPTCHA solver or score spoofer  
- Not multi-account farming  
- Not legal advice  

Issues asking how to evade abuse detection will be closed. See [SECURITY.md](SECURITY.md).

---

## Project layout

```text
extension/           Chrome/Edge MV3 live monitor (load unpacked)
flowfixer/           CLI + library
docs/
  ENG_BRIEF.md       Staff-eng incident + fixes
  OPS_DOCTRINE.md    Survive the scorer
  INTERNAL_MAP.md    Wire names / flags / model keys
  assets/            Charts used in this README
fixtures/            Synthetic HAR only (no real accounts)
scripts/             Asset renderer
```

---

## Install

```bash
git clone https://github.com/coldbricks/flow-fixer.git
cd flow-fixer
python -m pip install -e .
python -m flowfixer analyze fixtures/synthetic_burst.har
```

Requires **Python 3.10+**.

Regenerate charts (optional):

```bash
python scripts/render_assets.py
```

---

## License

MIT — [LICENSE](LICENSE)

Google Flow, Veo, Gemini, and related marks are Google’s. This is an independent project.
