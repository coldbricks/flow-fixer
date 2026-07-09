"""Analyze Google Flow HARs for throttle / unusual-activity patterns."""
from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any

SOFT_REASONS = (
    "PUBLIC_ERROR_USER_REQUESTS_THROTTLED",
    "USER_REQUESTS_THROTTLED",
)
HARD_REASONS = (
    "PUBLIC_ERROR_UNUSUAL_ACTIVITY_TOO_MUCH_TRAFFIC",
    "PUBLIC_ERROR_UNUSUAL_ACTIVITY",
)
FILTER_MARKERS = (
    "PUBLIC_ERROR_SEXUAL",
    "PUBLIC_ERROR_PROMINENT_PEOPLE_FILTER_FAILED",
    "PUBLIC_ERROR_UNSAFE_GENERATION",
)

# Empirically observed content.size fingerprints (bytes) for empty-body 429s
SIZE_HARD = 287
SIZE_SOFT = 297


def _parse_ts(e: dict[str, Any]) -> datetime:
    return datetime.fromisoformat(e["startedDateTime"].replace("Z", "+00:00"))


def _req_text(e: dict[str, Any]) -> str:
    return (e.get("request", {}).get("postData") or {}).get("text") or ""


def _resp_text(e: dict[str, Any]) -> str:
    return (e.get("response", {}).get("content") or {}).get("text") or ""


def _resp_size(e: dict[str, Any]) -> int:
    return int((e.get("response", {}).get("content") or {}).get("size") or -1)


def is_generate_url(url: str) -> bool:
    if "aisandbox" not in url:
        return False
    if re.search(r"batchCheck|Status|LogFrontend|batchLog|uploadImage|/credits", url, re.I):
        return False
    if re.search(r"[Gg]enerate", url):
        return True
    if re.search(r"flowMedia:", url):
        return True
    if re.search(r"batchAsync", url) and not re.search(r"Check|Status", url, re.I):
        return True
    return False


def classify_outcome(status: int, body: str, size: int) -> str:
    if status == 200:
        return "OK"
    for r in HARD_REASONS:
        if r in body:
            return "HARD_UNUSUAL"
    for r in SOFT_REASONS:
        if r in body:
            return "SOFT_THROTTLE"
    if status == 429 and not body:
        if size == SIZE_HARD:
            return "HARD_UNUSUAL"
        if size == SIZE_SOFT:
            return "SOFT_THROTTLE"
        return f"429_NO_BODY_size{size}"
    if status == 403 and any(r in body for r in HARD_REASONS):
        return "HARD_UNUSUAL"
    if status == 403:
        return "HARD_403"
    for m in FILTER_MARKERS:
        if m in body:
            return m.replace("PUBLIC_ERROR_", "FILTER_")
    if status == 400:
        m = re.search(r"PUBLIC_ERROR_[A-Z0-9_]+", body)
        return f"FILTER_{m.group(0).replace('PUBLIC_ERROR_', '')}" if m else "FILTER_OTHER_400"
    return f"STATUS_{status}"


def extract_model(body: str) -> str:
    m = re.search(
        r'"(?:imageModelName|videoModelName|videoModelKey|modelName)"\s*:\s*"([^"]+)"',
        body,
    )
    return m.group(1) if m else "?"


def find_captcha_tokens(obj: Any, out: list[str]) -> None:
    if isinstance(obj, dict):
        for k, v in obj.items():
            if re.search(r"captcha", k, re.I) and isinstance(v, dict):
                tok = v.get("token")
                if isinstance(tok, str) and len(tok) > 50:
                    out.append(tok)
            elif isinstance(v, str) and re.search(r"captcha|recaptcha", k, re.I) and len(v) > 100:
                out.append(v)
            else:
                find_captcha_tokens(v, out)
    elif isinstance(obj, list):
        for v in obj:
            find_captcha_tokens(v, out)


@dataclass
class Analysis:
    path: str
    entry_count: int
    window_start: str
    window_end: str
    window_minutes: float
    generate_count: int
    status_hist: dict[int, int] = field(default_factory=dict)
    class_hist: dict[str, int] = field(default_factory=dict)
    model_hist: dict[str, int] = field(default_factory=dict)
    model_class: dict[str, dict[str, int]] = field(default_factory=dict)
    tokens_present: int = 0
    tokens_unique: int = 0
    tokens_missing: int = 0
    cluster_count: int = 0
    cluster_size_hist: dict[int, int] = field(default_factory=dict)
    fan_position_pass: list[tuple[int, int, int, float]] = field(default_factory=list)
    first_soft_s: float | None = None
    first_hard_s: float | None = None
    first_429_s: float | None = None
    gens_before_first_429_60s: int | None = None
    sticky_sparse_fail: list[tuple[float, float, str]] = field(default_factory=list)
    sticky_sparse_ok: list[tuple[float, float, str]] = field(default_factory=list)
    credit_balances: list[int] = field(default_factory=list)
    endpoints: dict[str, int] = field(default_factory=dict)
    notes: list[str] = field(default_factory=list)

    def to_markdown(self) -> str:
        lines = [
            f"# Flow Fixer report",
            f"",
            f"- **File:** `{self.path}`",
            f"- **Entries:** {self.entry_count:,}",
            f"- **Window:** {self.window_start} → {self.window_end} ({self.window_minutes:.1f} min)",
            f"- **Generate calls:** {self.generate_count}",
            f"",
            f"## Outcome classes",
            f"",
        ]
        for k, n in sorted(self.class_hist.items(), key=lambda kv: -kv[1]):
            lines.append(f"- **{k}:** {n}")
        lines += ["", "## HTTP status (generate)", ""]
        for s, n in sorted(self.status_hist.items()):
            lines.append(f"- `{s}`: {n}")
        lines += ["", "## Models", ""]
        for m, n in sorted(self.model_hist.items(), key=lambda kv: -kv[1]):
            mc = self.model_class.get(m, {})
            detail = ", ".join(f"{k}={v}" for k, v in sorted(mc.items(), key=lambda kv: -kv[1])[:6])
            lines.append(f"- `{m}` ×{n} — {detail}")
        lines += [
            "",
            "## reCAPTCHA tokens",
            "",
            f"- present: {self.tokens_present}",
            f"- unique: {self.tokens_unique}",
            f"- missing: {self.tokens_missing}",
            "",
            "## Burst clusters (gap ≤ 2s)",
            "",
            f"- cluster count: {self.cluster_count}",
            f"- size histogram: {dict(sorted(self.cluster_size_hist.items()))}",
            "",
            "## Fan position pass rate",
            "",
            "| pos | ok | total | pass % |",
            "|----:|---:|------:|-------:|",
        ]
        for pos, ok, tot, pct in self.fan_position_pass[:12]:
            lines.append(f"| {pos} | {ok} | {tot} | {pct:.1f}% |")
        lines += ["", "## Milestones", ""]
        if self.first_soft_s is not None:
            lines.append(f"- first soft throttle: +{self.first_soft_s:.1f}s")
        if self.first_hard_s is not None:
            lines.append(f"- first hard unusual: +{self.first_hard_s:.1f}s")
        if self.first_429_s is not None:
            lines.append(
                f"- first 429: +{self.first_429_s:.1f}s "
                f"(gens in prior 60s: {self.gens_before_first_429_60s})"
            )
        if self.sticky_sparse_fail or self.sticky_sparse_ok:
            lines += ["", "## Sticky probes (gap ≥ 60s after last size≥4 cluster)", ""]
            for off, gap, cls in self.sticky_sparse_fail:
                lines.append(f"- FAIL +{off:.1f}s gap={gap:.1f}s → `{cls}`")
            for off, gap, cls in self.sticky_sparse_ok:
                lines.append(f"- OK   +{off:.1f}s gap={gap:.1f}s → `{cls}`")
        if self.credit_balances:
            lines += [
                "",
                "## Credits (when present in HAR)",
                "",
                f"- unique balances: {sorted(set(self.credit_balances))}",
                f"- first→last: {self.credit_balances[0]} → {self.credit_balances[-1]}",
            ]
        if self.notes:
            lines += ["", "## Notes", ""]
            for n in self.notes:
                lines.append(f"- {n}")
        lines.append("")
        return "\n".join(lines)


def analyze_har(path: Path) -> Analysis:
    har = json.loads(path.read_text(encoding="utf-8"))
    entries = sorted(har.get("log", {}).get("entries", []), key=_parse_ts)
    if not entries:
        raise ValueError("HAR has no entries")

    t0 = _parse_ts(entries[0])
    t1 = _parse_ts(entries[-1])
    dur = (t1 - t0).total_seconds()

    endpoints: Counter[str] = Counter()
    for e in entries:
        url = e.get("request", {}).get("url", "")
        if "aisandbox-pa.googleapis.com" in url:
            ep = re.sub(r"https://[^/]+/", "", url).split("?")[0]
            endpoints[ep] += 1

    gens = [e for e in entries if is_generate_url(e.get("request", {}).get("url", ""))]
    timeline: list[tuple[float, int, str, str, dict[str, Any]]] = []
    tokens: list[str] = []
    missing = 0
    class_hist: Counter[str] = Counter()
    status_hist: Counter[int] = Counter()
    model_hist: Counter[str] = Counter()
    model_class: dict[str, Counter[str]] = defaultdict(Counter)

    for e in gens:
        off = (_parse_ts(e) - t0).total_seconds()
        status = int(e.get("response", {}).get("status") or 0)
        body = _resp_text(e)
        size = _resp_size(e)
        cls = classify_outcome(status, body, size)
        model = extract_model(_req_text(e))
        class_hist[cls] += 1
        status_hist[status] += 1
        model_hist[model] += 1
        model_class[model][cls] += 1
        timeline.append((off, status, cls, model, e))

        req_body = _req_text(e)
        found: list[str] = []
        try:
            if req_body:
                find_captcha_tokens(json.loads(req_body), found)
        except json.JSONDecodeError:
            found = re.findall(r'"token"\s*:\s*"([^"]{80,})"', req_body)
        if found:
            tokens.extend(found)
        else:
            # still count redacted placeholders as "present structure"
            if "TOKEN_REDACTED" in req_body or "recaptchaContext" in req_body:
                tokens.append(f"redacted-{len(tokens)}")
            else:
                missing += 1

    # clusters
    clusters: list[list[tuple[float, int, str, str, dict[str, Any]]]] = []
    if timeline:
        cur = [timeline[0]]
        for prev, cur_e in zip(timeline, timeline[1:]):
            if cur_e[0] - prev[0] <= 2.0:
                cur.append(cur_e)
            else:
                clusters.append(cur)
                cur = [cur_e]
        clusters.append(cur)

    size_hist = Counter(len(c) for c in clusters)
    pos_ok: dict[int, list[int]] = defaultdict(lambda: [0, 0])
    for c in clusters:
        for i, t in enumerate(c):
            pos_ok[i][1] += 1
            if t[1] == 200:
                pos_ok[i][0] += 1
    fan = []
    for i in sorted(pos_ok):
        ok, tot = pos_ok[i]
        fan.append((i, ok, tot, 100.0 * ok / tot if tot else 0.0))

    first_soft = next((t[0] for t in timeline if t[2] == "SOFT_THROTTLE"), None)
    first_hard = next((t[0] for t in timeline if t[2] in ("HARD_UNUSUAL", "HARD_403")), None)
    first_429 = next((t[0] for t in timeline if t[1] == 429), None)
    gens_60 = None
    if first_429 is not None:
        gens_60 = sum(1 for t in timeline if first_429 - 60 < t[0] <= first_429)

    sticky_fail: list[tuple[float, float, str]] = []
    sticky_ok: list[tuple[float, float, str]] = []
    big = [c for c in clusters if len(c) >= 4]
    if big and timeline:
        last_big_end = big[-1][-1][0]
        for i, t in enumerate(timeline):
            if t[0] <= last_big_end:
                continue
            prev_off = timeline[i - 1][0] if i else 0.0
            gap = t[0] - prev_off
            if gap >= 60:
                if t[1] == 200:
                    sticky_ok.append((t[0], gap, t[2]))
                else:
                    sticky_fail.append((t[0], gap, t[2]))

    credits: list[int] = []
    for e in entries:
        url = e.get("request", {}).get("url", "")
        if "/v1/credits" in url:
            m = re.search(r'"credits"\s*:\s*(\d+)', _resp_text(e))
            if m:
                credits.append(int(m.group(1)))

    notes: list[str] = []
    hard_n = class_hist.get("HARD_UNUSUAL", 0) + class_hist.get("HARD_403", 0)
    soft_n = class_hist.get("SOFT_THROTTLE", 0)
    filt_n = sum(v for k, v in class_hist.items() if k.startswith("FILTER_"))
    ok_n = class_hist.get("OK", 0)
    if hard_n and fan and fan[0][3] > 70 and len(fan) > 3 and fan[min(3, len(fan) - 1)][3] < 30:
        notes.append(
            "Strong UI-fan-out signature: early positions pass, later positions in the same burst die."
        )
    if hard_n and tokens and len(set(tokens)) >= max(1, int(0.9 * len(tokens))):
        notes.append("Token uniqueness is high — failures do not look like reused/stale reCAPTCHA tokens.")
    if sticky_fail:
        notes.append(
            "Sticky hard-gate evidence: sparse requests after long quiet gaps still failed."
        )
    if filt_n > hard_n and filt_n > ok_n:
        notes.append(
            "Content/policy filters dominate this capture — use a cleaner session for pure traffic claims."
        )
    if soft_n and hard_n:
        notes.append("Both soft throttle and hard unusual-activity gates appear (two different machines).")

    return Analysis(
        path=str(path),
        entry_count=len(entries),
        window_start=t0.isoformat(),
        window_end=t1.isoformat(),
        window_minutes=dur / 60.0,
        generate_count=len(gens),
        status_hist=dict(sorted(status_hist.items())),
        class_hist=dict(class_hist),
        model_hist=dict(model_hist),
        model_class={k: dict(v) for k, v in model_class.items()},
        tokens_present=len(tokens),
        tokens_unique=len(set(tokens)),
        tokens_missing=missing,
        cluster_count=len(clusters),
        cluster_size_hist=dict(size_hist),
        fan_position_pass=fan,
        first_soft_s=first_soft,
        first_hard_s=first_hard,
        first_429_s=first_429,
        gens_before_first_429_60s=gens_60,
        sticky_sparse_fail=sticky_fail,
        sticky_sparse_ok=sticky_ok,
        credit_balances=credits,
        endpoints=dict(endpoints.most_common(20)),
        notes=notes,
    )


def print_analysis(a: Analysis) -> None:
    print(f"FILE: {a.path}")
    print(f"ENTRIES: {a.entry_count:,}  WINDOW: {a.window_minutes:.1f} min")
    print(f"GENERATE: {a.generate_count}")
    print("\nOUTCOMES:")
    for k, n in sorted(a.class_hist.items(), key=lambda kv: -kv[1]):
        print(f"  {n:5d}  {k}")
    print("\nMODELS:")
    for m, n in sorted(a.model_hist.items(), key=lambda kv: -kv[1]):
        print(f"  {n:5d}  {m}  {a.model_class.get(m, {})}")
    print(
        f"\nTOKENS: present={a.tokens_present} unique={a.tokens_unique} missing={a.tokens_missing}"
    )
    print(f"CLUSTERS: {a.cluster_count}  sizes={dict(sorted(a.cluster_size_hist.items()))}")
    print("\nFAN POSITION PASS %:")
    for pos, ok, tot, pct in a.fan_position_pass[:10]:
        bar = "█" * int(pct // 5)
        print(f"  pos {pos:2d}: {pct:5.1f}%  ({ok}/{tot})  {bar}")
    if a.first_soft_s is not None:
        print(f"\nfirst soft:  +{a.first_soft_s:.1f}s")
    if a.first_hard_s is not None:
        print(f"first hard:  +{a.first_hard_s:.1f}s")
    if a.first_429_s is not None:
        print(
            f"first 429:   +{a.first_429_s:.1f}s  "
            f"(gens prior 60s: {a.gens_before_first_429_60s})"
        )
    if a.sticky_sparse_fail or a.sticky_sparse_ok:
        print("\nSTICKY PROBES:")
        for off, gap, cls in a.sticky_sparse_fail:
            print(f"  FAIL +{off:.1f}s gap={gap:.1f}s {cls}")
        for off, gap, cls in a.sticky_sparse_ok:
            print(f"  OK   +{off:.1f}s gap={gap:.1f}s {cls}")
    if a.credit_balances:
        print(
            f"\nCREDITS: {a.credit_balances[0]} → {a.credit_balances[-1]}  "
            f"unique={sorted(set(a.credit_balances))}"
        )
    if a.notes:
        print("\nNOTES:")
        for n in a.notes:
            print(f"  • {n}")
