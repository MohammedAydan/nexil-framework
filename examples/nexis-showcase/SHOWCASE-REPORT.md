# Nexis Showcase: Performance, SEO, and Framework Evaluation

**Generated:** 25 August 2026  
**Application:** `examples/nexis-showcase`  
**Framework branch:** `feat/nexis-showcase-benchmarks` (based on the merged production-audit fixes)

## Executive summary

The Nexis showcase is a complete server-rendered and resumable application that exercises the framework’s core element model, fine-grained reactivity, file routing, renderer, Vite compiler, SEO helpers, media helpers, CSS extraction, server utilities, validated actions, state registry, client serialization, and runtime adapters. It publishes seven routes, including three statically expanded dynamic documentation pages. Production-preview measurements show that all published routes return HTTP 200, an unknown route returns HTTP 404, every page carries title, description, canonical, OpenGraph, Twitter, and JSON-LD metadata, and dangerous URL protocols are absent from generated HTML. The optimized resumability bootstrap is 1,374 raw bytes, the two lazy chunks average 315 raw bytes, and production median route latency is 0.58–3.82 ms on the local sandbox. Browser checks passed for SSR content, route navigation, no hydration root, resumable interaction, accessibility landmarks, metadata, 404 behavior, and console cleanliness. The main remaining framework gaps are not basic correctness failures: captured resumability scope is still limited for runtime functions, the built-in production preview path does not itself implement route-directory fallback and 404 semantics, server actions are not automatically bound to route endpoints, and adapter parity, streaming, image transformation, observability, and real-world Core Web Vitals still need broader implementation and deployment testing.

## 1. Application scope and live access

The showcase uses an intentionally editorial dark-cyan visual system rather than a generic framework landing page. The homepage opens with the framework thesis, then exposes a live signal boundary, responsive media attributes, extracted CSS, secure server headers, cookie serialization, SEO artifacts, and adapter capabilities. The feature map documents the package surface, the labs route provides serialized state and action-contract evidence, the dynamic documentation route demonstrates static path expansion, and the status route provides a small operator-facing health page.

The running development application is available at **[Open the Nexis Showcase](https://5173-iy9pzx89dcpgt94u8wm8i-f0b5585c.sg1.manus.computer/)**. This is a temporary sandbox URL and is not a persistent production deployment. The link currently serves the running development server on port 5173.

| Route                | Purpose                                                 | Interaction | SEO head |
| -------------------- | ------------------------------------------------------- | ----------: | -------: |
| `/`                  | Full feature showcase and resumable signal demo         |         Yes | Complete |
| `/features`          | Framework package inventory                             |          No | Complete |
| `/labs`              | State, action, security, serialization, and adapter lab |         Yes | Complete |
| `/docs/architecture` | Dynamic documentation page                              |          No | Complete |
| `/docs/resumability` | Dynamic documentation page                              |          No | Complete |
| `/docs/performance`  | Dynamic documentation page                              |          No | Complete |
| `/status`            | Operator-facing health and coverage page                |          No | Complete |

## 2. Feature coverage

The implementation uses the following framework capabilities in executable application code rather than only describing them. Core components and validated JSX nodes are used throughout the routes. Reactivity uses `state`, `computed`, and `batch`; state uses a route-scoped registry and serializable store snapshots. The router is exercised through static, nested, and dynamic files under `src/routes`. Rendering and the compiler are exercised by SSR output, static CSS extraction, lazy `onClick$` boundaries, and generated chunks. The SEO package generates route head metadata, sitemap and robots previews, while media generates responsive `srcset` data and font-face rules. Server utilities create request data, CSP headers, and secure cookies; actions define validation, origin authorization, and idempotency; adapters expose the Node capability contract; and the client package serializes resume state and creates handler references. The feature map is available at `/features` and the live contract values are visible at `/labs`.

## 3. Functional and browser evaluation

The browser evaluation passed **18 of 18 checks**. It confirmed that the home page is server-rendered, contains a Nexis resumability boundary, does not include a React hydration root, and changes the signal button text after a browser click. It also visited every published route and verified a single main landmark, a document title, and a JSON-LD script. The unknown-route check returned a visible 404 response, and the browser produced no application console errors. The repository-level Playwright test independently passed **3 of 3 tests**, including the same interaction path against the live application.[1]

| Browser check group         |    Result |
| --------------------------- | --------: |
| SSR and no-hydration checks |       3/3 |
| Resumable interaction       |       1/1 |
| Route titles and landmarks  |     12/12 |
| Unknown-route behavior      |       1/1 |
| Console cleanliness         |       1/1 |
| **Total**                   | **18/18** |

## 4. Performance evaluation

The production-preview benchmark measured five requests per route against the built static output using Node 22.13.0 on Linux. Median latency ranged from **0.58 ms to 3.82 ms**. The homepage is the largest HTML response at 7,794 bytes raw and 2,724 bytes gzip because it intentionally contains the complete feature specimen. Dynamic documentation pages are approximately 2.3–2.4 KB raw. The production client boundary is compact: the bootstrap is 1,374 bytes raw and 651 bytes gzip; the two interactive chunks are 318 and 312 bytes raw. The combined raw bootstrap-plus-chunk footprint is 2,004 bytes, while compiled CSS is 9,176 bytes across the generated framework CSS and showcase stylesheet.[2]

![Route size and production latency](benchmarks/assets/route-size-latency.png)

| Route                | HTML raw | HTML gzip | Median latency | Status |
| -------------------- | -------: | --------: | -------------: | -----: |
| `/`                  |  7,794 B |   2,724 B |        1.94 ms |    200 |
| `/features`          |  5,293 B |   1,966 B |        1.81 ms |    200 |
| `/labs`              |  4,530 B |   1,723 B |        0.92 ms |    200 |
| `/docs/architecture` |  2,331 B |     932 B |        0.89 ms |    200 |
| `/docs/resumability` |  2,357 B |     963 B |        0.79 ms |    200 |
| `/docs/performance`  |  2,325 B |     951 B |        0.81 ms |    200 |
| `/status`            |  3,203 B |   1,257 B |        0.80 ms |    200 |
| Unknown route        |      9 B |      29 B |        0.58 ms |    404 |

![Client boundary and CSS footprint](benchmarks/assets/asset-footprint.png)

These figures are local engineering measurements, not field performance. They exclude DNS, TLS, network transfer, browser parsing, font loading, image decoding, edge cold starts, and third-party integrations. The benchmark deliberately separates raw and gzip bytes, but it does not yet calculate transfer waterfalls, TTFB from a remote region, LCP, CLS, INP, or memory use in a representative browser population.

## 5. SEO evaluation

SEO coverage passed **7 of 7 measured routes** for title, meta description, canonical URL, OpenGraph title and URL, Twitter card, JSON-LD, and dangerous-URL scanning. The dynamic documentation pages retain valid route-specific HTML while being generated from one parameterized source file. Canonical values are absolute HTTPS URLs and the JSON-LD payload is escaped by the framework SEO helper. The showcase also generates and displays sitemap and robots artifacts, although these artifacts are currently demonstrated in application output rather than automatically mounted as dedicated `/sitemap.xml` and `/robots.txt` endpoints.[2] [3]

![SEO and output-safety coverage](benchmarks/assets/seo-coverage.png)

| SEO or safety dimension | Passing routes |
| ----------------------- | -------------: |
| Title                   |            7/7 |
| Description             |            7/7 |
| Canonical               |            7/7 |
| OpenGraph               |            7/7 |
| Twitter card            |            7/7 |
| JSON-LD                 |            7/7 |
| Dangerous protocol scan |            7/7 |

This is a structural SEO evaluation. It does not measure search impressions, rankings, crawl frequency, indexation, backlink authority, real-user page experience, or image-search performance. A production SEO program would add Search Console, analytics, crawl, backlink, and field Core Web Vitals exports.

## 6. Security evaluation

The application’s output passed the implemented safety probes. Generated HTML contained no `javascript:`, `vbscript:`, or `data:` URL protocols. The app uses CSP, `X-Content-Type-Options`, `Referrer-Policy`, and Permissions Policy generation; secure, HttpOnly, SameSite cookies; trusted-origin authorization; idempotency keys; serializable resume state; and safe image and CSS helpers. The security benchmark is intentionally evidence-led: it validates concrete output and package contracts rather than claiming that a local demonstration proves production security.[4]

The remaining security work is deployment-specific. A full assessment still needs authenticated endpoint testing, CSRF behavior on actual action endpoints, dependency lockfile monitoring in CI, server error redaction, request-size limits, rate limiting, asset-origin policy, and a second independent audit run. Those are hardening and coverage gaps until a concrete exploit is demonstrated.

## 7. Benchmark suite

The benchmark suite is reproducible from `examples/nexis-showcase/benchmarks`. `run-benchmarks.mjs` measures route status, HTML size, gzip size, five-sample min/median/max latency, cache policy, interactive boundaries, SEO tags, and client asset sizes. `evaluate.mjs` applies 14 regression gates. `browser-evaluate.mjs` runs direct Chromium checks against the live development server, while `tests/e2e/showcase.spec.ts` integrates the same behavior into the repository’s Playwright suite. `generate-charts.py` produces the report visuals from measured JSON data, and `serve-production.mjs` gives the generated route directories true production-like path and 404 behavior without the SPA fallback of a generic preview server.

The final production-preview evaluation passed **14 of 14 gates**. The development browser evaluation passed **18 of 18 checks**. The separate repository Playwright file passed **3 of 3 tests**. The raw JSON, CSV, evaluation output, and charts are stored alongside this report.[1] [2]

| Benchmark gate       |          Target |       Result |
| -------------------- | --------------: | -----------: |
| Published routes     |    7 × HTTP 200 |       Passed |
| Unknown route        |        HTTP 404 |       Passed |
| SSR document size    |          >600 B |       Passed |
| Dynamic static paths |         3 pages |       Passed |
| Interactive routes   |   Home and labs |       Passed |
| SEO head             |      7/7 routes |       Passed |
| Dangerous URL scan   |      0 findings |       Passed |
| Bootstrap            |    <2,048 B raw |      1,374 B |
| Average lazy chunk   |    <2,048 B raw |        315 B |
| Median route latency |         <250 ms | 0.58–3.82 ms |
| Cache policy         | Explicit policy |       Passed |

## 8. What is still missing from the framework

The first gap is **complete resumability scope reconstruction**. The compiler can rewrite free identifiers through a `scope` object, but the browser bootstrap currently receives serialized plain data. It cannot recreate arbitrary signal setters, closures, server action instances, or other runtime capabilities from that payload. The showcase therefore keeps browser handlers self-contained and uses state/reactivity in SSR-visible demonstrations. A complete implementation needs a documented capture ABI, serializable signal/store references, lifecycle ownership, and a runtime scope registry that can safely reattach only supported capabilities.

The second gap is **production route serving integrated into the framework toolchain**. The CLI correctly emits route directories, but a generic Vite preview falls back to the root document for paths such as `/features` and unknown URLs. The showcase adds a route-aware benchmark server to evaluate the generated output correctly. Nexis should ship an official preview server or adapter that maps `/path` to `dist/client/path/index.html`, preserves assets, supports HEAD and method semantics, and returns 404 for unknown paths without requiring an application-specific wrapper.

The third gap is **server action endpoint integration**. The actions package provides validation, authorization, trusted-origin, and idempotency primitives, but the showcase must define an action object without a first-class Nexis route declaration that turns it into a POST endpoint. The framework still needs a standard action transport, CSRF/origin policy integration, request body parsing, response serialization, error contract, and client invocation helper.

The fourth gap is **runtime parity and streaming depth**. Node, Cloudflare, and Deno adapter types exist, but broad conformance tests for streaming, headers, aborts, file access, crypto, and edge-specific limits are still needed. The renderer exposes stream and render-mode contracts, yet the benchmark does not compare streaming output against buffered output under load or verify backpressure and disconnect behavior.

The fifth gap is **media and observability completeness**. The media package has safe attribute and download helpers, but image transformation relies on optional native tooling and the showcase does not ship generated WebP/AVIF variants or a production image cache. The framework also lacks built-in field telemetry for TTFB, LCP, CLS, INP, route errors, chunk-load failures, cache hit rate, and resumability activation. These are necessary to turn the current local benchmark into a production performance program.

The sixth gap is **SEO endpoint and validation breadth**. Head tags are strong for the tested routes, but sitemap and robots helpers are not automatically exposed as standard endpoints, canonical metadata for dynamic parameters is not automatically route-derived, and the framework does not yet run a crawler-level validation pass for internal links, hreflang, pagination, duplicate content, or XML response headers. Structured-data validation is currently syntactic rather than schema-level.

## 9. Visual QA

The final screenshot pass covered the homepage, feature inventory, labs, and dynamic performance documentation routes at desktop and mobile viewports. The inspected desktop and mobile homepage captures showed the intended thesis-led hierarchy, responsive single-column collapse, readable code specimens, separated tap targets, visible interaction boundary, and no observed horizontal overflow or broken asset region. The complete screenshot set and review notes are retained under `benchmarks/screenshots/` and `benchmarks/visual-qa.md`.

## 10. Final prioritization

1. **Problem:** Captured resumability scope does not reconstruct runtime functions or signal capabilities in the browser.  
   **Fix:** Define and implement a safe scope ABI with serializable references, lifecycle cleanup, and explicit supported-capability rules.

2. **Problem:** Production route serving and preview fallback behavior are not integrated as a first-class Nexis contract.  
   **Fix:** Ship an official route-aware preview/adapter server with nested-directory mapping, asset caching, HEAD support, and true 404 responses.

3. **Problem:** Server actions are defined as primitives but are not automatically exposed through a framework route and client transport.  
   **Fix:** Add typed POST action routes with body validation, trusted-origin/CSRF enforcement, idempotency, response serialization, and client calls.

4. **Problem:** Local benchmarks do not measure remote field performance, edge parity, streaming behavior, or Core Web Vitals.  
   **Fix:** Add repeatable browser/network benchmarks, adapter conformance suites, streaming load tests, and optional RUM instrumentation.

## References

[1]: ../../tests/e2e/showcase.spec.ts 'Nexis showcase Playwright evaluation'
[2]: benchmarks/benchmark-results-production.json 'Production-preview benchmark results'
[3]: ../../packages/seo/src/index.ts 'Nexis SEO helpers and validation'
[4]: ../../packages/server/src/index.ts 'Nexis server security headers and cookie helpers'
[5]: benchmarks/visual-qa.md 'Showcase screenshot visual-QA notes'
