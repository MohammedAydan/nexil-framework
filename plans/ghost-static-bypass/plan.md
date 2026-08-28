# Feature: Ghost Static File Bypass Remediation (SSR Pipeline Restoration)

## Goal

Eliminate the bypass where `nexis dev`/`start` served a pre-baked static `index.html` while the framework pipeline (renderer, JSX runtime, signals, resumability serializer) never executed.

## Root cause (verified)

Scaffold templates shipped a full marketing page as `index.html`; CLI dev used plain Vite with no route handling; build copied that HTML verbatim into dist. Result: users saw a "working" app that was a pure static file server.

## Fix shipped

1. Templates reduced to outlet-only shell (`nexis-head/app/scripts-outlet`).
2. `@nexil/dev-server` now exports `nexisSSRPlugin(root)`: Vite SSR middleware — router matching → `ssrLoadModule` → `renderToString` → SEO head injection → resumability bootstrap injection.
3. `nexis dev` mounts `[nexis(transform), nexisSSRPlugin]`; `nexis build` runs the same engine at build time and prerenders every route to `dist/client/<route>/index.html` (+ mirrored preview roots), keeping server modules/chunks/bootstrap/manifest emission.
4. `core` re-exports `component`, `state`, `computed`, `batch` (signals via new dependency on reactivity); core+jsx-runtime expose `./jsx-dev-runtime` with `jsxDEV` for Vite SSR dev transform.
5. Chunk hashes normalized (`normalizeIdForHash`) so dev/build/preview reference identical emitted files.
6. Cross-runtime hardening: `sharp.d.ts` removed once real types resolved; clean scripts remove `*.tsbuildinfo` (ADR-008).

## Proof

- `tests/e2e/engine-proof.spec.ts` (3 tests): scaffolds a REAL app in temp, installs workspace deps, builds, asserts prerendered HTML contains engine stamp + serialized handler attrs, serves it via vite preview, clicks counter 0→1→2 through the lazy chunk. Green locally; part of default suite (serial mode, dedicated port 4317).
- Mission sequence executed live: clean→build→scaffold→`pnpm dev` → GET / contains "Rendered via Nexil SSR Engine" + `data-nx-on-click="chunk_*.js#handler_*"` + SEO title injected → app build OK → full e2e 9/9 → security clean.
- Full gates green: build/typecheck/lint/format/test(81)/budget/e2e(9)/security.

## Release

All public packages bumped 2.0.0 → 2.1.0 (scaffold ranges ^2.1.0) because published 2.0.0 lacks the SSR engine — shipping only the repo fix would leave external consumers on the bypass path. Tag v2.1.0 drives publication.
