"""Render README / docs chart assets. Synthetic presentation of measured patterns.

Numbers are aggregate patterns from sanitized production HARs (no account IDs,
prompts, or credit balances). See docs/ENG_BRIEF.md.
"""
from __future__ import annotations

from pathlib import Path

import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "assets"
OUT.mkdir(parents=True, exist_ok=True)

# Dark terminal / product aesthetic
BG = "#0d1117"
PANEL = "#161b22"
BORDER = "#30363d"
TEXT = "#e6edf3"
MUTED = "#8b949e"
GREEN = "#3fb950"
AMBER = "#d29922"
RED = "#f85149"
BLUE = "#58a6ff"
PURPLE = "#a371f7"


def style_ax(ax, title: str, subtitle: str | None = None):
    ax.set_facecolor(PANEL)
    ax.figure.set_facecolor(BG)
    ax.set_title(title, color=TEXT, fontsize=14, fontweight="bold", pad=14, loc="left")
    if subtitle:
        ax.text(
            0.0,
            1.02,
            subtitle,
            transform=ax.transAxes,
            color=MUTED,
            fontsize=9,
            va="bottom",
        )
    ax.tick_params(colors=MUTED)
    for spine in ax.spines.values():
        spine.set_color(BORDER)
    ax.yaxis.label.set_color(MUTED)
    ax.xaxis.label.set_color(MUTED)


def chart_fan_position():
    """Fan-position pass rates — the smoking chart."""
    # Measured pattern from retry-storm style session (aggregate)
    positions = list(range(0, 9))
    # smoothed illustrative of measured collapse (pos0 ~90%, late ~0%)
    rates = [90.5, 52.9, 31.2, 33.3, 33.3, 12.5, 20.0, 20.0, 0.0]
    # second series: video lockout pattern (steeper drop after pos0)
    rates_video = [92.6, 11.5, 7.7, 7.7, 23.1, 7.7, 15.4, 8.3, 0.0]

    fig, ax = plt.subplots(figsize=(10, 5.2), dpi=160)
    style_ax(
        ax,
        "Pass rate by fire-order inside a UI burst",
        "Same batch ID · gap ≤ 2s clusters · first request often lives, the rest die",
    )

    x = np.arange(len(positions))
    w = 0.38
    bars1 = ax.bar(x - w / 2, rates, w, color=BLUE, label="Image retry storm", zorder=3)
    bars2 = ax.bar(x + w / 2, rates_video, w, color=PURPLE, alpha=0.85, label="Video lockout", zorder=3)

    ax.axhline(50, color=BORDER, ls="--", lw=1, zorder=1)
    ax.set_xticks(x)
    ax.set_xticklabels([f"pos {p}" for p in positions], color=MUTED)
    ax.set_ylabel("Pass rate (%)", color=MUTED)
    ax.set_ylim(0, 105)
    ax.set_xlim(-0.6, len(positions) - 0.4)
    ax.legend(facecolor=PANEL, edgecolor=BORDER, labelcolor=TEXT, loc="upper right")
    ax.grid(axis="y", color=BORDER, alpha=0.5, zorder=0)

    # callout
    ax.annotate(
        "UI multi-output / Retry\nfires these in parallel",
        xy=(0, 90.5),
        xytext=(2.2, 78),
        color=TEXT,
        fontsize=9,
        arrowprops=dict(arrowstyle="->", color=MUTED),
        bbox=dict(boxstyle="round,pad=0.35", fc=BG, ec=BORDER),
    )
    ax.annotate(
        "per-call scorer\nstarves the tail",
        xy=(8, 2),
        xytext=(5.5, 40),
        color=TEXT,
        fontsize=9,
        arrowprops=dict(arrowstyle="->", color=RED),
        bbox=dict(boxstyle="round,pad=0.35", fc=BG, ec=RED),
    )

    fig.tight_layout()
    path = OUT / "fan_position.png"
    fig.savefig(path, facecolor=BG, bbox_inches="tight", pad_inches=0.25)
    plt.close(fig)
    print("wrote", path)


def chart_outcomes():
    fig, axes = plt.subplots(1, 2, figsize=(10, 4.6), dpi=160)
    fig.set_facecolor(BG)

    # Retry storm
    ax = axes[0]
    style_ax(ax, "Retry storm (~4 min)", "One creative family · mass Retry")
    sizes = [44, 98, 1]
    labels = ["OK 200", "Hard unusual", "Filter 400"]
    colors = [GREEN, RED, AMBER]
    wedges, texts, autotexts = ax.pie(
        sizes,
        labels=None,
        colors=colors,
        autopct=lambda p: f"{p:.0f}%" if p > 3 else "",
        startangle=90,
        pctdistance=0.72,
        wedgeprops=dict(width=0.45, edgecolor=BG, linewidth=2),
    )
    for t in autotexts:
        t.set_color(TEXT)
        t.set_fontsize(10)
        t.set_fontweight("bold")
    ax.legend(
        wedges,
        [f"{l}  ({n})" for l, n in zip(labels, sizes)],
        facecolor=PANEL,
        edgecolor=BORDER,
        labelcolor=TEXT,
        loc="lower center",
        bbox_to_anchor=(0.5, -0.08),
    )
    ax.set_aspect("equal")

    # Soft → hard escalation schematic counts from long session (traffic only)
    ax = axes[1]
    style_ax(ax, "Long session traffic gates", "Soft throttle then sticky hard gate")
    cats = ["OK", "Soft\nthrottle", "Hard\nunusual"]
    vals = [240, 40, 48]
    cols = [GREEN, AMBER, RED]
    bars = ax.bar(cats, vals, color=cols, zorder=3, width=0.62)
    ax.set_ylabel("Generate calls", color=MUTED)
    ax.grid(axis="y", color=BORDER, alpha=0.5, zorder=0)
    for b, v in zip(bars, vals):
        ax.text(
            b.get_x() + b.get_width() / 2,
            v + 4,
            str(v),
            ha="center",
            va="bottom",
            color=TEXT,
            fontsize=11,
            fontweight="bold",
        )
    ax.set_ylim(0, max(vals) * 1.18)
    ax.tick_params(axis="x", colors=MUTED)

    fig.suptitle(
        "Flow Fixer — outcome classification",
        color=TEXT,
        fontsize=13,
        fontweight="bold",
        y=1.02,
    )
    fig.tight_layout()
    path = OUT / "outcomes.png"
    fig.savefig(path, facecolor=BG, bbox_inches="tight", pad_inches=0.3)
    plt.close(fig)
    print("wrote", path)


def chart_architecture():
    fig, ax = plt.subplots(figsize=(10, 4.2), dpi=160)
    ax.set_facecolor(BG)
    fig.set_facecolor(BG)
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 4)
    ax.axis("off")
    ax.set_title(
        "What one click actually does on the wire",
        color=TEXT,
        fontsize=14,
        fontweight="bold",
        loc="left",
        pad=8,
    )
    ax.text(
        0,
        3.55,
        "Flow UI multiplies human actions into N independently scored generate calls",
        color=MUTED,
        fontsize=9,
    )

    def box(x, y, w, h, text, color=PANEL, ec=BORDER, tc=TEXT, fs=10):
        p = FancyBboxPatch(
            (x, y),
            w,
            h,
            boxstyle="round,pad=0.02,rounding_size=0.15",
            facecolor=color,
            edgecolor=ec,
            linewidth=1.5,
            transform=ax.transData,
            zorder=2,
        )
        ax.add_patch(p)
        ax.text(x + w / 2, y + h / 2, text, ha="center", va="center", color=tc, fontsize=fs, fontweight="medium", zorder=3)

    box(0.2, 1.5, 1.8, 1.1, "Human click\noutput = 4", PANEL, BLUE)
    box(2.5, 1.5, 2.0, 1.1, "UI fan-out\n4× HTTP POST\nsame batch ID", PANEL, PURPLE)
    box(5.0, 2.35, 2.0, 0.9, "Call #1  →  200", "#12261e", GREEN, GREEN, 9)
    box(5.0, 1.25, 2.0, 0.9, "Calls #2–4  →  429", "#2a1214", RED, RED, 9)
    box(7.5, 1.5, 2.2, 1.1, "reCAPTCHA\nper-call score\nTOO_MUCH_TRAFFIC", PANEL, AMBER)

    def arrow(x1, y1, x2, y2, c=MUTED):
        ax.annotate(
            "",
            xy=(x2, y2),
            xytext=(x1, y1),
            arrowprops=dict(arrowstyle="-|>", color=c, lw=1.6),
            zorder=1,
        )

    arrow(2.0, 2.05, 2.5, 2.05, BLUE)
    arrow(4.5, 2.05, 5.0, 2.75, GREEN)
    arrow(4.5, 2.05, 5.0, 1.7, RED)
    arrow(7.0, 2.75, 7.5, 2.2, AMBER)
    arrow(7.0, 1.7, 7.5, 2.0, AMBER)

    ax.text(
        0.2,
        0.55,
        "Retry / Retry-All can fire 12–20 scored calls in a few seconds → soft throttle → sticky hard gate",
        color=MUTED,
        fontsize=9,
    )
    ax.text(
        0.2,
        0.2,
        "Flow Fixer measures this from a Chrome HAR — it does not generate media or bypass scoring.",
        color=MUTED,
        fontsize=8,
        style="italic",
    )

    path = OUT / "architecture.png"
    fig.savefig(path, facecolor=BG, bbox_inches="tight", pad_inches=0.25)
    plt.close(fig)
    print("wrote", path)


def chart_cli_preview():
    """Terminal-style preview image for README."""
    fig, ax = plt.subplots(figsize=(10, 5.5), dpi=160)
    ax.set_facecolor("#010409")
    fig.set_facecolor(BG)
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.axis("off")

    # window chrome
    frame = FancyBboxPatch(
        (0.03, 0.05),
        0.94,
        0.9,
        boxstyle="round,pad=0.01,rounding_size=0.02",
        facecolor="#010409",
        edgecolor=BORDER,
        linewidth=1.5,
        transform=ax.transAxes,
    )
    ax.add_patch(frame)
    # title bar
    bar = FancyBboxPatch(
        (0.03, 0.88),
        0.94,
        0.07,
        boxstyle="round,pad=0.005,rounding_size=0.02",
        facecolor=PANEL,
        edgecolor=BORDER,
        linewidth=1,
        transform=ax.transAxes,
    )
    ax.add_patch(bar)
    for i, c in enumerate(["#ff5f56", "#ffbd2e", "#27c93f"]):
        ax.plot(0.06 + i * 0.025, 0.915, "o", color=c, markersize=7, transform=ax.transAxes)
    ax.text(0.5, 0.915, "flowfixer analyze capture.har", ha="center", va="center", color=MUTED, fontsize=9, transform=ax.transAxes, family="monospace")

    lines = [
        (GREEN, "$ python -m flowfixer analyze capture.har"),
        (MUTED, ""),
        (TEXT, "FILE: capture.SANITIZED.har"),
        (MUTED, "ENTRIES: 1,893   WINDOW: 4.2 min"),
        (TEXT, "GENERATE: 143"),
        (MUTED, ""),
        (TEXT, "OUTCOMES:"),
        (GREEN, "     44  OK"),
        (RED, "     98  HARD_UNUSUAL"),
        (AMBER, "      1  FILTER_OTHER_400"),
        (MUTED, ""),
        (TEXT, "FAN POSITION PASS %:"),
        (GREEN, "  pos  0:  90.5%  ██████████████████"),
        (BLUE, "  pos  1:  52.9%  ██████████"),
        (AMBER, "  pos  2:  31.2%  ██████"),
        (RED, "  pos  6+:  0.0%"),
        (MUTED, ""),
        (PURPLE, "NOTES:"),
        (MUTED, "  • Strong UI-fan-out signature"),
        (MUTED, "  • Token uniqueness high — not stale captcha"),
    ]
    y = 0.82
    for color, line in lines:
        ax.text(
            0.07,
            y,
            line,
            color=color,
            fontsize=9.2,
            family="monospace",
            transform=ax.transAxes,
            va="top",
        )
        y -= 0.035

    path = OUT / "cli_preview.png"
    fig.savefig(path, facecolor=BG, bbox_inches="tight", pad_inches=0.2)
    plt.close(fig)
    print("wrote", path)


def main():
    chart_architecture()
    chart_fan_position()
    chart_outcomes()
    chart_cli_preview()
    print("assets →", OUT)


if __name__ == "__main__":
    main()
