# Changelog

## 0.4.2 — cross-platform extension archive

- Package extension ZIP entries with forward-slash paths so archives unpack correctly on Linux and macOS
- Validate release archives for portable paths and a root-level `manifest.json`

## 0.4.1 — peer-review hardening

- Empty-body 429 classification uses **size bands** (not only exact 287/297)  
- Unknown empty 429s treated less punitively for auto-throttle severity  
- Stronger partial-body regex for hard/soft reason strings  
- **docs/LIMITATIONS.md** — reCAPTCHA env fingerprint, VPN confounds, size-fallback brittleness  

## 0.4.0 — live hardening

- **Privacy:** project UUIDs redacted in diag strip, stored events, and exports  
- **UX:** filter counter, pass-rate line, live cool-down countdown (m/s), Copy markdown report  
- **Settings:** auto-throttle / monitor / gear prefs persist across browser restarts (`chrome.storage.local`)  
- **CLI:** broader generate URL matching (flowMedia / batchAsync)  
- **Tests:** classify + sanitize privacy unit tests  
- Export no longer includes batchId (can fingerprint sessions)

## 0.3.0 — public release prep

- Browser extension: live monitor, AUTO-THROTTLE speed ladder, webRequest backup, diagnostics strip  
- CLI: sanitize / analyze / report  
- Docs: technical brief, ops doctrine, privacy, security  
- GitHub Release ships `flow-fixer-extension.zip` (stable download URL)  
- Public messaging tightened: local forensics + optional self-pacing; not a bypass tool  

## 0.2.x

- Initial extension packaging, idle detection fixes, AUTO-THROTTLE  

## 0.1.0

- Initial CLI + technical docs  
