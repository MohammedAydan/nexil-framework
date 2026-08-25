# Visual QA Notes

**Capture command:** `node benchmarks/capture-screenshots.mjs`  
**Viewports:** desktop 1440×1000 and mobile 390×844 CSS pixels  
**Routes captured:** `/`, `/features`, `/labs`, `/docs/performance`

## Inspected evidence

The desktop homepage presents a clear thesis-led hero, a visible runtime signal panel, deliberate display/body typography pairing, restrained dark-cyan palette, strong section dividers, and a consistent card/grid system. The interactive boundary is visually isolated and the footer remains aligned with the same editorial system. The full-page capture showed no visible horizontal overflow or broken asset region.

The mobile homepage collapses the hero and card grids into a readable single-column flow. The signal panel and interactive button remain visible, code specimens wrap within their cards, tap targets are separated, and the footer remains inside the viewport width. The mobile capture is intentionally tall because it preserves all showcase sections rather than hiding them behind desktop-only content.

No visual defect was observed in the two inspected homepage captures. The remaining screenshot files were generated for the feature, labs, and dynamic documentation routes and are retained as supporting QA artifacts; automated browser checks also covered their titles, landmarks, 404 behavior, interaction, and console cleanliness.
