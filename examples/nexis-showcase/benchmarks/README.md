# Nexis showcase benchmarks

This directory contains a reproducible evaluation harness for the Nexis showcase application. The benchmark process measures the generated manifest, raw and gzip asset sizes, HTML response sizes, local route latency, HTTP status behavior, cache headers, resumability boundaries, SEO head coverage, dangerous URL output, and browser interaction.

## Run the suite

From the repository root, build the framework and showcase first:

```bash
pnpm install --offline --no-frozen-lockfile
pnpm build
pnpm --filter @mohammedaydan/example-nexis-showcase build
```

Start the showcase in another terminal with `pnpm --filter @mohammedaydan/example-nexis-showcase dev`, then run:

```bash
cd examples/nexis-showcase
BENCH_USE_EXISTING=1 pnpm bench
pnpm evaluate
python3 benchmarks/generate-charts.py
cd ../..
pnpm exec playwright test tests/e2e/showcase.spec.ts --workers=1
```

The JSON and CSV outputs are generated in this directory. The charts are written to `assets/` and the narrative report is `../SHOWCASE-REPORT.md`.

## Acceptance thresholds

| Dimension                 |                                                           Threshold |
| ------------------------- | ------------------------------------------------------------------: |
| Published showcase routes |                                                            HTTP 200 |
| Unknown route             |                                                            HTTP 404 |
| Bootstrap                 |                                           Less than 2,048 raw bytes |
| Average lazy chunk        |                                           Less than 2,048 raw bytes |
| Median local HTML latency |                                          Less than 250 ms per route |
| SEO head coverage         | Title, description, canonical, OpenGraph URL, Twitter card, JSON-LD |
| Output safety             |             No `javascript:`, `vbscript:`, or `data:` URL protocols |
| Development cache policy  |                                           `Cache-Control: no-store` |
| Browser interaction       |                     Resumable button changes text without hydration |

These thresholds are engineering regression gates, not production guarantees. Network conditions, hosting topology, compression configuration, browser version, and application content must be controlled before comparing runs across environments.
