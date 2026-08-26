# 13 — Testing and Performance

## Test layers

A single component test is not enough. Nexis applications need several layers:

| Layer          | What it verifies                                                |
| -------------- | --------------------------------------------------------------- |
| Unit           | Signals, SEO, Router, Actions, Media, Renderer                  |
| Integration    | Build, CLI, ScopeRef, and server contracts                      |
| E2E            | Browser interaction, chunks, native forms, routes, 404, console |
| Runtime parity | Node, Deno, Cloudflare, and Fetch contracts                     |
| Benchmark      | Bytes, latency, SEO, feeds, media, and redirects                |

## Verification commands

```bash
pnpm build
pnpm typecheck
pnpm test
pnpm test:parity
pnpm check:budget
pnpm test:node-runtime
pnpm test:edge
pnpm test:e2e
pnpm lint
pnpm format:check
pnpm audit --audit-level=high
git diff --check
```

`test:deno:e2e` requires an actual `deno` executable. A Node strip-types fallback is not evidence that Deno itself ran.

## Resumability and binding tests

In E2E, verify that:

- No application handler or binding effect runs during initial paint when the route is static.
- Static routes request no JavaScript.
- The event bootstrap loads only when an event boundary is present.
- `nexis-bindings.js` is emitted and injected only for routes containing binding metadata.
- A binding route preserves its SSR value before any interaction.
- A Signal update mutates only the bound text node or scalar property; the component is not rerun and the page is not navigated.
- The correct lazy event chunk loads after interaction when an event boundary is present.
- The browser console stays clean and route cleanup disposes binding effects.

## Client budgets

The compiler enforces limits such as a raw Bootstrap under 2048 bytes and limits on chunks and gzip output. Do not raise a limit only to make a build pass; document the reason and measure the user impact.

```text
Static route        → 0 route-specific JS
Interactive route  → bootstrap + smallest lazy chunk
```

## Astro comparison

`bench:compare` compares equivalent routes rather than summing every chunk in the entire site. The baseline should have comparable HTML, interaction, and assets. Store the measured file list in the artifact so the result can be audited.

## Lighthouse

`bench:lighthouse` runs mobile audits for the seven showcase routes and applies SEO, performance, and accessibility gates. Scores vary with Chromium, CPU, and cache state.

Separate:

- Lab metrics: Lighthouse.
- Field metrics: telemetry and real-user Web Vitals.
- Server metrics: latency, errors, and cache hits.

A local Lighthouse score is not a substitute for Real User Monitoring.

## Server measurement

The production benchmark measures sequential localhost requests. It does not include TLS, DNS, CDN behavior, cold starts, or the user’s network. Use medians and p95 values with enough samples, and never infer traffic, rankings, or search visibility from a local benchmark.

## Stream tests

Test parity between buffered and streamed HTML, chunk bounds, backpressure, abort behavior, cancellation hooks, and prompt closure when a client disconnects.

## SEO tests

Collect every published route and verify titles, descriptions, canonicals, Open Graph, Twitter, JSON-LD, dangerous URLs, broken links, duplicate signatures, sitemap, robots, RSS, and Atom.

## Security tests

Test malformed input, Origin checks, duplicate idempotency keys, request size, traversal, method rejection, cookies, headers, and JSON-LD escaping. A dependency audit is not a replacement for a threat model.

## Flaky tests

Do not rerun a test until it passes and hide the issue. Record the environment, port, and process state. Stop stale development servers, repair workspace links, and remove temporary artifacts before retrying.

## Performance report

Every report should state the commit, Node, pnpm, and browser versions; the routes tested; raw and gzip bytes; whether the test was local or remote; thresholds and results; and limitations that prevent overclaiming.
