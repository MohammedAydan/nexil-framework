# Nexil showcase benchmarks

This directory contains a reproducible evaluation harness for the Nexil showcase application. The benchmark process measures the generated manifest, raw and gzip asset sizes, HTML response sizes, local route latency, HTTP status behavior, cache headers, resumability boundaries, action POST envelopes, sitemap/robots/feed endpoints, declarative redirects, crawler link integrity, JSON-LD schema shape, build-time media and OG variants, dangerous URL output, Astro-style client budgets, Lighthouse lab scores, and browser interaction. It does not measure search rankings, organic traffic, Core Web Vitals from real users, or external crawl coverage.

## Run the suite

From the repository root, build the framework and showcase first:

```bash
pnpm install --offline --no-frozen-lockfile
pnpm build
pnpm --filter @nexil/example-nexis-showcase build
```

Run the complete GA sequence from the repository root:

```bash
pnpm install --offline --no-frozen-lockfile
pnpm build
pnpm bench:compare
pnpm bench:production
pnpm bench:lighthouse
pnpm --filter @nexil/example-nexis-showcase evaluate
pnpm test:parity
pnpm check:budget
pnpm test:node-runtime
pnpm test:edge
pnpm test:e2e
```

For an isolated manual production run, use `BENCH_PORT=4175 pnpm --filter @nexil/example-nexis-showcase bench`; the benchmark starts `benchmarks/serve-production.mjs`, which loads `nexis.config.json` and serves the official `@nexil/serve` implementation. `pnpm bench:lighthouse` starts its own clean production server when `LIGHTHOUSE_ORIGIN` is unavailable. Set `LIGHTHOUSE_USE_EXISTING=1` when intentionally auditing an already-running deployment. The browser-only evaluator and chart generation remain available from `examples/nexis-showcase`:

```bash
cd examples/nexis-showcase
python3 benchmarks/generate-charts.py
node benchmarks/browser-evaluate.mjs
cd ../..
```

The JSON and CSV outputs are generated in this directory. The charts are written to `assets/` and the narrative report is `../SHOWCASE-REPORT.md`.

## Acceptance thresholds

| Dimension                 |                                                                             Threshold |
| ------------------------- | ------------------------------------------------------------------------------------: |
| Published showcase routes |                                                                              HTTP 200 |
| Unknown route             |                                                                              HTTP 404 |
| Bootstrap                 |                                                             Less than 2,048 raw bytes |
| Average lazy chunk        |                                                             Less than 2,048 raw bytes |
| Median local HTML latency |                                                            Less than 250 ms per route |
| SEO head coverage         |                   Title, description, canonical, OpenGraph URL, Twitter card, JSON-LD |
| Output safety             |                               No `javascript:`, `vbscript:`, or `data:` URL protocols |
| Development cache policy  |                                                             `Cache-Control: no-store` |
| Browser interaction       |                       Resumable ScopeRef signal and action form complete successfully |
| Action transport          |                 POST returns `{ ok: true, data }`; invalid origin/replay are rejected |
| Crawl endpoints           | `sitemap.xml`, `robots.txt`, and `feed.xml` return 200 and reference published routes |
| Declarative redirects     |                        `/docs` returns a manual 308 with a safe local Location header |
| Crawler integrity         |                        No broken internal page links or duplicate metadata signatures |
| JSON-LD schema            |                       schema.org context/type/name plus type-specific required fields |
| Media pipeline            |                   WebP/AVIF variants, responsive picture markup, persistent cache API |
| OG image pipeline         |                          Build-time deterministic PNG card emitted for each SEO route |
| Telemetry default         |                                          Disabled output is exactly zero script bytes |
| Astro client budget       |                          Nexil route-scoped client JS no larger than baseline fixture |
| Lighthouse lab gates      |                       SEO 100, performance ≥95, accessibility ≥95 on all seven routes |
| Edge handler parity       |                           Cloudflare and Deno Fetch handlers pass package conformance |

These thresholds are engineering regression gates, not production guarantees. Network conditions, hosting topology, compression configuration, browser version, and application content must be controlled before comparing runs across environments.
