# Nexis Architecture Decision Records

These decisions are binding for the v2 implementation unless superseded by a new ADR. The v1 decisions ADR-001 through ADR-008 remain active where they do not conflict with this index.

## ADR-009 — No VDOM or diffing engine

**Status:** Accepted.
**Decision:** Reactivity is implemented with signals and compiler-known direct DOM updates. Nexis will not ship a virtual DOM, reconciliation loop, or tree diffing engine.
**Rationale:** The framework contract prioritizes minimal client code and fine-grained updates. Introducing a VDOM, even temporarily, would create an incompatible runtime assumption and obscure the cost model.
**Consequence:** Renderer and compiler tests must assert direct binding contracts; any proposal for VDOM requires a new superseding ADR.

## ADR-010 — Resumability instead of hydration

**Status:** Accepted.
**Decision:** Interactive boundaries serialize resumable state and handler references into the rendered document. The client resumes work on demand instead of rerunning component setup during initial load.
**Rationale:** This enforces zero unnecessary JavaScript execution at initial paint and keeps the bootstrap below the defined budget.
**Consequence:** Serialization is versioned and limited to explicit serializable values; unsupported closures and class instances are compiler errors.

## ADR-011 — Explicit render modes with static default

**Status:** Accepted.
**Decision:** Routes use explicit `static`, `isr`, `server`, or `partial` render modes. Static generation is the default.
**Rationale:** Prebuilt HTML is the lowest-latency path and avoids server work where per-request data is not needed.
**Consequence:** Cache and revalidation semantics must be explicit; SSR cannot be enabled as a hidden global default.

## ADR-012 — Zero-runtime CSS

**Status:** Accepted.
**Decision:** The default CSS strategy extracts styles at build time. CSS Modules and Tailwind are drivers over this contract and cannot add runtime JavaScript for styling.
**Rationale:** Styling must not consume the client budget or introduce a second runtime.
**Consequence:** Client graph tests and build artifacts must prove no styling runtime is shipped.

## ADR-013 — Web Standard APIs and edge-first core

**Status:** Accepted.
**Decision:** Core request and response contracts use Web Standard APIs. Node, Cloudflare Workers, and Deno Deploy are adapters over the same core.
**Rationale:** Portability and geographic deployment are architectural requirements from Phase 1.
**Consequence:** Node-specific APIs are forbidden in core packages and adapter capability differences must be documented.

## ADR-014 — Performance budgets are hard CI gates

**Status:** Accepted.
**Decision:** CI fails on 0 KB static-route JS violations, interactive route output above 15 KB gzipped, or bootstrap output above 1 KB gzipped.
**Rationale:** A budget that does not fail builds is not an enforceable architecture constraint.
**Consequence:** Overrides must be explicit, justified, and reviewable; a global budget relaxation is not allowed.

## ADR-015 — Media optimization is core behavior

**Status:** Accepted.
**Decision:** Image and font optimization are part of the framework contract rather than optional plugins.
**Rationale:** Dimensions, loading behavior, font delivery, and modern formats directly affect layout stability and loading performance.
**Consequence:** Media fixtures and output validation are release gates; missing image dimensions are compiler errors.

## ADR-016 — Phase 2 production parity contracts

**Status:** Accepted. See [phase-2-production-parity.md](./phase-2-production-parity.md) for the ScopeRef, action transport, serve, streaming, media, telemetry, and SEO contracts.

## Governance

Every new feature must document whether it affects serialization, caching, security boundaries, client bundle size, or the four core commitments. A feature that cannot preserve those commitments belongs behind an experimental flag or in a plugin.
