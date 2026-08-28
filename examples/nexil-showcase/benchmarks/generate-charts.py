from __future__ import annotations

import json
from pathlib import Path

import matplotlib.pyplot as plt

ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / "assets"
ASSETS.mkdir(exist_ok=True)
DATA = json.loads((ROOT / "benchmark-results.json").read_text())
ROUTES = DATA["routes"]["measured"]

plt.rcParams.update({
    "figure.dpi": 160,
    "font.family": "DejaVu Sans",
    "axes.facecolor": "#0b1722",
    "figure.facecolor": "#0b1722",
    "axes.edgecolor": "#244456",
    "axes.labelcolor": "#e7f3f1",
    "xtick.color": "#8da5b3",
    "ytick.color": "#8da5b3",
    "text.color": "#e7f3f1",
    "grid.color": "#244456",
})

labels = [route["path"] for route in ROUTES]
bytes_raw = [route["bytes"] for route in ROUTES]
latencies = [route["latencyMs"]["median"] for route in ROUTES]

fig, ax1 = plt.subplots(figsize=(10, 4.8))
ax1.bar(labels, bytes_raw, color="#63e6d2", alpha=0.86, label="HTML bytes")
ax1.set_ylabel("HTML response bytes")
ax1.grid(axis="y", alpha=0.35)
ax1.tick_params(axis="x", rotation=25)
ax2 = ax1.twinx()
ax2.plot(labels, latencies, color="#ffca72", marker="o", linewidth=2.2, label="Median latency")
ax2.set_ylabel("Median latency (ms)")
ax1.set_title("nexil showcase route size and local latency")
fig.tight_layout()
fig.savefig(ASSETS / "route-size-latency.png", bbox_inches="tight")
plt.close(fig)

seo_names = ["Title", "Description", "Canonical", "OpenGraph", "Twitter", "JSON-LD", "Safe URLs"]
seo_values = [sum(route["seo"][key] for route in ROUTES) for key in ["title", "description", "canonical", "openGraph", "twitter", "jsonLd", "noDangerousUrl"]]
fig, ax = plt.subplots(figsize=(8.5, 4.4))
ax.bar(seo_names, seo_values, color="#63e6d2")
ax.set_ylim(0, len(ROUTES) + 0.5)
ax.set_ylabel(f"Routes passing (of {len(ROUTES)})")
ax.set_title("SEO and output-safety coverage")
ax.grid(axis="y", alpha=0.35)
ax.tick_params(axis="x", rotation=20)
fig.tight_layout()
fig.savefig(ASSETS / "seo-coverage.png", bbox_inches="tight")
plt.close(fig)

bootstrap = DATA["assets"]["bootstrap"]["bytes"]
chunk_total = sum(chunk["bytes"] for chunk in DATA["assets"]["chunks"])
css_total = sum(asset["bytes"] for asset in DATA["assets"]["assets"] if asset["name"].endswith(".css"))
fig, ax = plt.subplots(figsize=(7.5, 4.4))
ax.bar(["Bootstrap", "Lazy chunks", "CSS"], [bootstrap, chunk_total, css_total], color=["#ffca72", "#63e6d2", "#ff816e"])
ax.set_ylabel("Raw bytes")
ax.set_title("Client boundary and CSS footprint")
ax.grid(axis="y", alpha=0.35)
fig.tight_layout()
fig.savefig(ASSETS / "asset-footprint.png", bbox_inches="tight")
plt.close(fig)

print(f"Generated charts in {ASSETS}")
