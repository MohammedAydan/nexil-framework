# Nexis showcase benchmarks

This directory contains a reproducible evaluation harness for the Nexis showcase application. The benchmark process measures the generated manifest, raw and gzip asset sizes, HTML response sizes, local route latency, HTTP status behavior, cache headers, resumability boundaries, action POST envelopes, sitemap and robots endpoints, crawler link integrity, JSON-LD schema shape, build-time media variants, dangerous URL output, and browser interaction. It does not measure search rankings, organic traffic, Core Web Vitals from real users, or external crawl coverage.

## Run the suite

From the repository root, build the framework and showcase first:

```bash
pnpm install --offline --no-frozen-lockfile
pnpm build
pnpm --filter @mohammedaydan/example-nexis-showcase build
```

Start the showcase in another terminal with `pnpm --filter @mohammedaydan/example-nexis-showcase dev`, or let the benchmark start a clean dev server automatically, then run:

```bash
cd examples/nexis-showcase
pnpm bench
pnpm evaluate
python3 benchmarks/generate-charts.py
node benchmarks/browser-evaluate.mjs
cd ../..
pnpm exec playwright test tests/e2e/showcase.spec.ts tests/e2e/engine-proof.spec.ts --workers=1

# Optional official production-server run after `pnpm build`:
cd examples/nexis-showcase
node benchmarks/serve-production.mjs
# In another terminal:
BENCH_USE_EXISTING=1 BENCH_PORT=4173 pnpm bench
pnpm evaluate
```

The JSON and CSV outputs are generated in this directory. The charts are written to `assets/` and the narrative report is `../SHOWCASE-REPORT.md`.

## Acceptance thresholds

| Dimension                 |                                                                Threshold |
| ------------------------- | -----------------------------------------------------------------------: |
| Published showcase routes |                                                                 HTTP 200 |
| Unknown route             |                                                                 HTTP 404 |
| Bootstrap                 |                                                Less than 2,048 raw bytes |
| Average lazy chunk        |                                                Less than 2,048 raw bytes |
| Median local HTML latency |                                               Less than 250 ms per route |
| SEO head coverage         |      Title, description, canonical, OpenGraph URL, Twitter card, JSON-LD |
| Output safety             |                  No `javascript:`, `vbscript:`, or `data:` URL protocols |
| Development cache policy  |                                                `Cache-Control: no-store` |
| Browser interaction       |          Resumable ScopeRef signal and action form complete successfully |
| Action transport          |    POST returns `{ ok: true, data }`; invalid origin/replay are rejected |
| Crawl endpoints           | `sitemap.xml` and `robots.txt` return 200 and reference published routes |
| Crawler integrity         |           No broken internal page links or duplicate metadata signatures |
| JSON-LD schema            |                   schema.org context, supported type, and non-empty name |
| Media pipeline            |                               At least two non-empty build-time variants |
| Telemetry default         |                             Disabled output is exactly zero script bytes |

These thresholds are engineering regression gates, not production guarantees. Network conditions, hosting topology, compression configuration, browser version, and application content must be controlled before comparing runs across environments.
