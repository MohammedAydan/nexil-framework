# Nexis Showcase — Phase 3 Production GA Report

**Generated:** 25 August 2026
**Application:** `examples/nexis-showcase`
**Framework branch:** `feat/phase2-production-parity`
**Release target:** `v1.0.0 Production GA`
**Author:** Manus AI

## Executive summary

Phase 3 completes the Nexis v1.0.0 Production GA surface on top of the Phase 2 production-parity baseline. The implementation adds computed-cycle diagnostics and store lifecycle cleanup, a reproducible Astro-style client-budget comparison, Lighthouse automation across all seven routes, RSS and Atom feeds, expanded sitemap metadata, typed configuration loading, build-time OG PNG cards, validated redirects, incremental stream traversal with cancellation and flush thresholds, Cloudflare and Deno Fetch handlers, persistent media caching and picture markup, optional LCP/CLS/INP observers, and a local telemetry receiver. The final evaluator passes **27/27 checks**, Lighthouse passes **7/7 routes** with SEO 100, performance 100, and accessibility 100 in this controlled local run, the repository unit/integration suite passes **135/135 tests**, repository E2E passes **13/13**, the Astro comparison gate reports Nexis at **1,940 bytes versus 2,272 bytes**, and build, typecheck, lint, formatting, high-severity audit, parity, budget, and whitespace gates pass. These are reproducible local or CI measurements, not internet production performance, Search Console, rankings, backlink authority, or real-user Core Web Vitals evidence. Remaining deployment work is deliberately documented: arbitrary closure serialization, durable distributed idempotency, full edge static-file deployment adapters, complete external Schema.org validation, consent/retention governance, and real-user field collection still require application and infrastructure decisions.

## 1. Scope and deliverables

The showcase remains an executable application rather than a documentation-only example. It contains SSR pages, nested and dynamic routes, statically expanded documentation paths, resumable interaction boundaries, signal and store state, action transport, server utilities, runtime adapters, responsive media, CSS extraction, canonical and structured metadata, crawl endpoints, media build artifacts, and reproducible performance and SEO measurements.

| Area          | Implementation                                                                                                         | Evidence                                                                                   |
| ------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| State engine  | Computed cycle diagnostics, no-op/memoization/batching preservation, selector and signal disposal                      | `packages/reactivity/src/index.ts`, `packages/state/src/index.ts`, package tests           |
| Scope capture | `ScopeRef` ABI plus component$ capture path for signals/stores/actions and unsupported-capture diagnostics             | `packages/client/src/index.ts`, `packages/vite-plugin/src/index.ts`, plugin tests          |
| SEO and feeds | RSS/Atom feeds, canonical/breadcrumb JSON-LD, hreflang/image sitemap fields, typed config, redirect manifests          | `packages/seo/src/index.ts`, `packages/cli/src/index.ts`, `nexis.config.json`              |
| OG images     | Deterministic build-time SVG-to-PNG social cards with content-addressed cache                                          | `packages/og-image/src/index.ts`, emitted `dist/client/og/*.png`                           |
| Streaming     | Incremental async child traversal, flush thresholds, bounded chunks, backpressure, and immediate abort closure         | `packages/renderer/src/stream.ts`, `packages/renderer/src/stream.test.ts`                  |
| Edge parity   | Cloudflare asset fallback and Deno Fetch handler packages with safe 404/405 and immutable asset headers                | `packages/serve-cloudflare`, `packages/serve-deno`, package tests                          |
| Media         | Responsive `<picture>` markup, WebP/AVIF variants, in-process and optional persistent disk cache                       | `packages/media/src/index.ts`, `benchmarks/build-media.mjs`, media tests                   |
| Observability | Opt-in zero-byte-disabled telemetry, LCP/CLS/INP observers, and local 202 receiver                                     | `packages/telemetry/src/index.ts`, `packages/serve/src/index.ts`, telemetry/server tests   |
| Benchmarks    | Astro-style route-scoped client budget, Lighthouse seven-route hard gates, production route/feed/redirect/OG evaluator | `benchmarks/compare-astro.mjs`, `benchmarks/run-lighthouse.mjs`, `benchmarks/evaluate.mjs` |

The Phase 2 architecture decision is recorded in [`docs/adr/phase-2-production-parity.md`](../../docs/adr/phase-2-production-parity.md). Phase 3 acceptance evidence is generated by the benchmark and Lighthouse scripts listed in Section 10.

## 2. Functional verification

The final repository verification was run on Linux with Node `v22.13.0` and pnpm `10.15.0`. The build traversed all workspace packages and application fixtures. The full Vitest run covered 26 test files and 135 tests. Production benchmarks, the Astro comparison, and Lighthouse audits were run against the official route-aware server. The Deno runtime source was exercised through Node 22’s strip-types fallback with all six checks passing; the sandbox does not contain a `deno` executable, so the exact Deno command remains a CI/environment verification step.

| Verification                    |           Result | Notes                                                               |
| ------------------------------- | ---------------: | ------------------------------------------------------------------- |
| Workspace build and typecheck   |           Passed | All workspace packages and application fixtures                     |
| Unit/integration tests          |      **135/135** | 26 Vitest files                                                     |
| Showcase browser evaluator      |        **19/19** | SSR, ScopeRef interaction, action POST, routes, 404, console checks |
| Deno runtime source fallback    |          **6/6** | Node 22 strip-types; local Deno binary unavailable                  |
| Repository E2E                  | **13/13 passed** | Fixture and showcase servers managed automatically                  |
| Production evaluator            |        **27/27** | Routes, feeds, redirects, OG cards, SEO, crawler, media, budgets    |
| Lighthouse hard gates           |          **7/7** | SEO 100, performance 100, accessibility 100 in local mobile lab run |
| Astro client-JS comparison      |       **Passed** | Nexis 1,940 B vs Astro-style baseline 2,272 B                       |
| Lint, format, audit, whitespace |           Passed | ESLint, Prettier, high-severity audit, `git diff --check`           |

The browser action test exposed and corrected an important event-order issue: a form’s native submit navigation can occur before a lazy handler finishes importing. The bootstrap now prevents submit synchronously, then imports the handler and performs the action request. This is covered by the 19/19 browser artifact and the repository showcase E2E test.

## 3. Resumability and ScopeRef contract

The client package now supports tagged references for serializable values, live signals, stores, actions, and explicitly unsupported captures. The registry validates stable IDs, exposes `resolve`, `inspectScope`, `dispose`, and `disposeAll`, and releases registered signal/store resources. The Vite transform returns `scopeCaptures` and non-fatal `warnings` metadata. A `state(...)`, `computed(...)`, `createStore(...)`, or `action(...)` declaration is classified as a supported capability; arbitrary runtime objects and closures are reported as unsupported rather than silently serialized.

The showcase homepage emits `data-nx-scope` for a live signal reference. Its `onClick$` handler reads and updates the signal after the lazy chunk is imported. The browser check confirms visible mutation without a hydration root. The implementation is intentionally explicit: the current compiler does not infer and serialize arbitrary runtime values or reconstruct closures from source alone.

The raw production bootstrap is **1,621 bytes** and **930 bytes gzip**. The client budget remains below the existing 2,048-byte raw bootstrap gate and the 1,024-byte gzip CLI gate. The three generated chunks are 319, 312, and 711 bytes raw. Static routes continue to report zero route-specific JavaScript.

## 4. Action transport

Actions are available at `POST /__nexis/actions/<route>/<name>`. The transport accepts JSON, URL-encoded forms, and multipart forms, runs validation before authorization and handling, checks trusted origins, applies a shared idempotency store when an `Idempotency-Key` is supplied, and returns either `{ ok: true, data }` or `{ ok: false, errors }`. The development server and official production server use the same action pipeline. The labs route exports `submit`, and its browser form performs a real POST round-trip returning `Action result: queued:Ada`.

The transport is progressive-enhancement friendly because the form has a normal `action` and `method="post"`. The resumable enhancement adds JSON conversion and synchronous submit prevention only when the client boundary is activated. Unit coverage includes invalid input, rejected origins, duplicate keys, JSON, form data, method rejection, and success envelopes.

The public temporary HTTPS preview required the development server to reconstruct the request origin from trusted `x-forwarded-proto` and `x-forwarded-host` headers. This behavior is opt-in through `NEXIS_TRUST_PROXY=1`; it must only be enabled behind a proxy that sanitizes and sets those headers. Without that deployment setting, the public browser action correctly fails closed with `Forbidden origin` rather than accepting an untrusted origin.

A production deployment must replace the default process-local idempotency store with a durable, bounded store shared by all instances. Origin policy must also be configured to the deployment’s actual site origins; the showcase’s demonstration action is not a substitute for an application-specific CSRF and authorization policy.

## 5. Official production server and runtime parity

`@mohammedaydan/serve` is now the supported route-aware Node server. It maps `/` and nested paths to generated `index.html` files, serves a built-in HTML 404 document or an application `404.html`, accepts `GET` and `HEAD`, rejects other methods with `405`, prevents traversal candidates, sets MIME types, and applies revalidation caching to HTML and immutable caching to assets. The CLI exposes this implementation through `nexis serve`; the showcase benchmark wrapper imports the package rather than carrying a bespoke server implementation.

The official server was exercised against the full built output. The final production benchmark confirms that all seven routes return 200, the unknown route returns a real HTML 404, `HEAD` and `405` behavior are covered by package tests, action transport works, and sitemap/robots files are served as dedicated endpoints.

Adapter parity coverage now compares Node, Cloudflare-style, and Deno-style handlers for status, headers, body output, server cache privacy, and portable conformance. The new Cloudflare and Deno packages provide Fetch-native handler factories, immutable asset headers, safe 404/405 behavior, and fallback delegation to the application handler. Renderer streams traverse async child trees incrementally, flush the first shell early, respect configurable thresholds and chunk bounds, pause under backpressure, and close promptly on client abort.

## 6. Media and observability

The media package now exposes `buildImageVariants`, persistent `cacheDir` support, and `pictureMarkup`. It hashes source bytes and requested widths, writes WebP and AVIF outputs, returns exact variant byte counts and cache-hit status, and emits accessible `<picture>` markup with AVIF/WebP sources and a fallback `<img>`. The showcase build generated four variants at widths 320 and 640; the output is recorded in `dist/client/media-manifest.json` and measured recursively by the benchmark collector. The OG package separately generates deterministic build-time PNG cards with content-addressed cache hits.

Telemetry remains opt-in and zero-byte-disabled. Enabled clients can send the documented low-cardinality events plus LCP, CLS, and INP measurements through `navigator.sendBeacon`; unsupported PerformanceObserver entry types are ignored. The official server now exposes a local `POST /__nexis/telemetry` receiver returning `202` for valid object envelopes and `400` for malformed bodies. Production deployments still need consent, sampling, privacy retention, authentication, and durable ingestion decisions.

## 7. Performance results

The final production snapshot was collected from the official route-aware server at `127.0.0.1:4175`, with five sequential requests per route. These values reflect the sandbox’s local filesystem, CPU, Node version, and process state. They exclude DNS, TLS, network transfer, CDN behavior, edge cold starts, browser parsing, font loading, image decoding, and real-user scheduling.

| Route                | HTML raw | HTML gzip | Median local latency | Status |
| -------------------- | -------: | --------: | -------------------: | -----: |
| `/`                  |  8,204 B |   2,791 B |              2.07 ms |    200 |
| `/features`          |  5,365 B |   1,994 B |              1.83 ms |    200 |
| `/labs`              |  5,028 B |   1,910 B |              0.96 ms |    200 |
| `/docs/architecture` |  2,411 B |     949 B |              0.90 ms |    200 |
| `/docs/resumability` |  2,437 B |     981 B |              0.84 ms |    200 |
| `/docs/performance`  |  2,403 B |     968 B |              0.79 ms |    200 |
| `/status`            |  3,439 B |   1,307 B |              0.82 ms |    200 |
| Unknown route        |    128 B |     116 B |              0.93 ms |    404 |

![Route size and latency](benchmarks/assets/route-size-latency.png)

| Client artifact               | Raw bytes | Gzip bytes |
| ----------------------------- | --------: | ---------: |
| Resumability bootstrap        |   1,621 B |      930 B |
| Lazy chunk: largest           |     711 B |      417 B |
| All three lazy chunks         |   1,342 B |      852 B |
| Bootstrap plus chunks         |   2,963 B |    1,782 B |
| Extracted showcase stylesheet |   9,152 B |    2,952 B |

![Client asset footprint](benchmarks/assets/asset-footprint.png)

The development snapshot is retained separately in [`benchmark-results-dev.json`](benchmarks/benchmark-results-dev.json). Its median route timings ranged from **1.68 ms to 3.04 ms** across the same seven routes and it returned `Cache-Control: no-store`, as expected for the development server. The official production snapshot is [`benchmark-results-production.json`](benchmarks/benchmark-results-production.json).

## 8. SEO and crawler results

Technical SEO coverage passes on **7/7 measured routes** for title, description, canonical, OpenGraph URL, Twitter card, JSON-LD presence, schema-level JSON-LD shape, and dangerous-protocol scanning. Dynamic documentation routes now derive unique canonical paths from their resolved path instead of sharing one hard-coded canonical.

| SEO or crawl dimension                           |   Result |
| ------------------------------------------------ | -------: |
| Title                                            |      7/7 |
| Meta description                                 |      7/7 |
| Canonical                                        |      7/7 |
| OpenGraph title and URL                          |      7/7 |
| Twitter card                                     |      7/7 |
| JSON-LD presence                                 |      7/7 |
| JSON-LD context/type/name check                  |      7/7 |
| Dangerous URL protocol scan                      |      7/7 |
| `sitemap.xml` endpoint                           | HTTP 200 |
| `robots.txt` endpoint                            | HTTP 200 |
| Broken internal page links                       |        0 |
| Duplicate canonical/title/description signatures |        0 |

The build emits `sitemap.xml`, `robots.txt`, and a standards-aligned RSS feed from the expanded route manifest. The sitemap builder supports validated hreflang and image entries, while the CLI derives breadcrumb JSON-LD and route-specific OG image metadata. The collector also asserts the configured `/docs` 308 redirect and the feed’s expanded documentation items. Schema checking remains deliberately conservative: it validates schema.org context, a supported type, a non-empty name, and type-specific required fields; it is not a complete external Schema.org validator.

![SEO coverage](benchmarks/assets/seo-coverage.png)

No Search Console, analytics, backlink, keyword, country, ranking, indexation, or organic-traffic data was provided or inferred. This report therefore makes no claim about search visibility, rankings, traffic, backlink authority, or real-user Core Web Vitals.

## 9. Security evaluation

The final security evidence consists of existing security-isolation tests, targeted action transport tests, safe URL and CSS output checks, protocol scanning, request-size bounding for Node action requests, traversal rejection in the official server, origin validation, replay protection, safe cookie and header helpers, and a high-severity dependency audit with no known vulnerabilities reported by pnpm.

| Security control                                         | Evidence status                                           |
| -------------------------------------------------------- | --------------------------------------------------------- |
| Dangerous `javascript:`, `vbscript:`, and `data:` output | Measured: no findings in seven generated pages            |
| Server action validation before handling                 | Unit-tested                                               |
| Trusted-origin enforcement                               | Unit-tested and retained in action pipeline               |
| Idempotency replay rejection                             | Unit-tested; shared in-process server store               |
| Request body limit                                       | Implemented at 1 MiB in Node server adapter               |
| Static path traversal rejection                          | Unit-tested through official server behavior              |
| HTML escaping and JSON-LD script safety                  | Existing SEO/renderer tests pass                          |
| Dependency audit                                         | `pnpm audit --audit-level=high`: no known vulnerabilities |

The audit does not claim an authenticated penetration test or production security certification. Remaining deployment hardening includes durable idempotency, rate limiting, secret and error redaction policy, authenticated action authorization, CSRF policy review for every origin, distributed request limits, CSP nonce management, and monitoring of lockfile changes.

## 10. Reproducible benchmark artifacts

The benchmark commands and thresholds are documented in [`benchmarks/README.md`](benchmarks/README.md). The main artifacts are:

| Artifact                            | Purpose                                                       |
| ----------------------------------- | ------------------------------------------------------------- |
| `benchmark-results-production.json` | Official production-server snapshot                           |
| `benchmark-results-dev.json`        | Development-server comparison snapshot                        |
| `benchmark-routes-production.csv`   | Route-level production CSV                                    |
| `benchmark-routes-dev.csv`          | Route-level development CSV                                   |
| `evaluation.json`                   | 27-gate production acceptance result                          |
| `browser-evaluation.json`           | 19-check Chromium result                                      |
| `benchmark-comparison-astro.json`   | Route-scoped Astro-style client-JS comparison                 |
| `lighthouse-*.json`                 | Per-route Lighthouse lab reports                              |
| `lighthouse-summary.json`           | Seven-route SEO/performance/accessibility gate                |
| `run-benchmarks.mjs`                | Route, asset, action, crawler, SEO, feed, and media collector |
| `evaluate.mjs`                      | Threshold evaluator                                           |
| `run-lighthouse.mjs`                | Lighthouse automation and hard gates                          |
| `compare-astro.mjs`                 | Reproducible client-budget comparison                         |
| `build-media.mjs`                   | Reproducible build-time media step                            |
| `serve-production.mjs`              | Configured wrapper around the official serve package          |
| `assets/*.png`                      | Measurements rendered as report charts                        |
| `screenshots/` and `visual-qa.md`   | Desktop/mobile visual evidence                                |
| `live-browser-qa.md`                | Temporary public URL route/control QA and proxy finding       |

The current production evaluator artifact records **27 passed checks out of 27**. The current browser evaluator records **19 passed checks out of 19**. The CI-mode repository Playwright run passed **13/13 tests**. The full Vitest run passed **135/135 tests**. The exact Deno test source passed **6/6** through the local Node strip-types fallback; this is not a claim of local Deno execution. These artifacts should be regenerated rather than hand-edited when source or environment changes.

## 11. Remaining framework gaps and priorities

The implementation closes the Phase 3 acceptance surface without implying feature-complete production maturity. Remaining gaps are ordered by deployment risk and architectural leverage.

1. **Complete resumability serialization.** ScopeRef and component$ capture classification now cover signals, stores, actions, and unsupported captures, but arbitrary closure values are still not serialized or reconstructed. A future capture pass needs explicit serializable-value boundaries, source-to-runtime manifests, and route-transition ownership.

2. **Durable action execution.** The transport validates origins, schemas, and replay keys, but the default idempotency store remains process-local. Production deployments need durable bounded replay storage, rate limiting, authenticated authorization hooks, and application-specific CSRF policy.

3. **Full edge static-serving parity.** Cloudflare and Deno now expose portable handler factories and asset semantics. Provider-specific generated-static deployment integration, cache invalidation, action routing, and observability wiring still require deployment adapters and runtime validation.

4. **Field-observability governance.** The client observes LCP/CLS/INP only when explicitly enabled, and the Node receiver is intentionally minimal. Consent UX, sampling, privacy retention, durable ingestion, cache-hit dashboards, and real-user field baselines remain application responsibilities.

5. **Complete SEO validation.** Feeds, sitemap alternates/images, redirects, breadcrumbs, route metadata, and Lighthouse gates are covered. Full external Schema.org validation, pagination conventions, video sitemap support, crawl-budget diagnostics, and Search Console integration remain outside this release.

6. **Routing and compiler completeness.** Layout composition, query-parameter schemas, method-specific route handlers, typed API routes, route-level cache invalidation watchers, and richer deployment adapter configuration remain future work.

## 12. Final assessment

Phase 3 and the v1.0.0 Production GA acceptance surface are complete against the reproducible gates defined in this repository. The showcase exercises state lifecycle, component$ capture classification, action transport, official serving, edge handler parity, incremental streaming, responsive media, build-time OG cards, feeds, sitemap/robots/redirect outputs, optional field observers, Astro comparison, Lighthouse, crawler, security, and client-byte budgets. The remaining items are explicit deployment and ecosystem responsibilities rather than hidden behind a passing demo; no claim is made about internet production performance, rankings, traffic, backlinks, or real-user field data.

## References

[1]: benchmarks/benchmark-results-production.json 'Final official production benchmark snapshot'
[2]: benchmarks/benchmark-results-dev.json 'Final development benchmark snapshot'
[3]: benchmarks/evaluation.json 'Final 27-gate acceptance evaluation'
[4]: benchmarks/browser-evaluation.json 'Final 19-check browser evaluation'
[5]: ../../tests/e2e/showcase.spec.ts 'Repository showcase Playwright coverage'
[6]: ../../packages/seo/src/index.ts 'Nexis SEO helpers and schema validation'
[7]: ../../packages/serve/README.md 'Official route-aware production server'
[8]: ../../docs/adr/phase-2-production-parity.md 'Phase 2 production parity architecture decision'
[9]: benchmarks/live-browser-qa.md 'Temporary public browser QA log'
[10]: benchmarks/lighthouse-summary.json 'Seven-route Lighthouse lab gate'
[11]: benchmarks/benchmark-comparison-astro.json 'Astro-style client budget comparison'
