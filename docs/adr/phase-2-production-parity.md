# ADR: Phase 2 production parity contracts

**Status:** Accepted for the Phase 2 implementation

**Decision:** Nexil adds additive, runtime-portable contracts for resumable scope capture, routed server actions, route-aware production serving, adapter and stream parity, build-time media variants, opt-in telemetry, and crawlable SEO endpoints. Existing APIs remain valid; the new contracts are explicit at the boundary and fail closed when a value cannot be safely resumed.

## ScopeRef ABI

A resumable handler receives `{ element, event, scope }`. Server-produced metadata uses tagged references with one of five kinds: `value`, `signal`, `store`, `action`, or `unsupported`. Signal and store references carry a stable ID and serializable initial value. Action references carry a local endpoint. Plain values must pass the existing serializability guard. Unsupported captures produce a compiler warning and are ignored in production rather than causing arbitrary code execution; development tooling may elevate the warning to an error.

The browser registry is content-addressed, inspectable, and disposable. A route transition may dispose its scope, and global registries must be explicitly retained. No generated handler may depend on a closure that was not represented by a ScopeRef.

## Action transport

Actions are exposed as `POST /__nexil/actions/<route>/<name>`. The transport accepts JSON and `application/x-www-form-urlencoded` or multipart form data, validates before handling, checks same-origin or an explicit origin allowlist, and applies an idempotency key when supplied. Responses use `{ ok: true, data }` or `{ ok: false, errors }`. Progressive-enhancement forms remain valid when JavaScript is unavailable.

## Production serving and runtime parity

`@nexil/serve` is the official Node-compatible static server. It maps generated route directories to `index.html`, serves a framework 404 document, supports `GET` and `HEAD`, rejects other methods with `405`, prevents traversal, and applies revalidation caching to HTML and immutable caching to hashed assets. The CLI `nexil serve` command uses this package. Node, Cloudflare-style, and Deno-style adapters continue to expose the same request/response contract. Stream rendering is bounded, cancellation-aware, and byte-identical to buffered rendering.

## Media, telemetry, and SEO

Image variants are generated at build time from a content-addressed cache. Native transformation failure falls back to the original asset with a warning. Telemetry is opt-in, uses a versioned low-cardinality event schema, sends through `navigator.sendBeacon`, and emits zero client bytes when disabled. Builds emit `sitemap.xml` and `robots.txt`; canonical URLs are derived from the resolved pathname unless explicitly overridden, and JSON-LD is checked for schema.org context, supported type, and name.

## Verification and budgets

The Phase 2 benchmark suite records route status, HTML and gzip bytes, local latency, client assets, action round-trips, crawler integrity, sitemap/robots output, JSON-LD schema checks, image variants, and browser interactions. The existing client budgets remain hard gates: resumability bootstrap below 2 KB raw and average interactive chunk below 2 KB raw. These are local reproducibility thresholds, not field performance claims.
