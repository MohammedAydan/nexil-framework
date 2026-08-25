# Chart QA — Phase 2 production snapshot

The regenerated `route-size-latency.png` chart is legible at 1584×752, uses a clear dual-axis presentation, and shows route labels rotated without overlap. The HTML byte bars use the left axis and the median latency line uses the right axis. The homepage is visibly the largest HTML response, while documentation routes cluster at the smallest sizes and latencies.

The regenerated `asset-footprint.png` chart is legible at 1184×688. Bootstrap and lazy chunks are grouped separately from CSS, making the client-boundary footprint clear. The CSS bar is intentionally much larger than the JavaScript boundary and remains readable without clipping.

The existing SEO chart remains consistent with the seven-route technical SEO results and the dark showcase palette. No chart showed clipping, missing labels, or unreadable text in visual inspection.
