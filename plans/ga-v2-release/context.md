# GA v2 Release — Implementation Context

## Key changes

- `RESUMABILITY_BOOTSTRAP` moved to vite-plugin (single source of truth); imports
  chunks via absolute `/nexil-chunks/` URLs.
- vite-plugin dev middleware serves `/nexil-bootstrap.js` + `/nexil-chunks/:name`
  from the live transform map; generateBundle emits the same paths for builds.
- CLI buildArtifacts emits bootstrap at dist root, chunks under dist/nexil-chunks.
- Handler chunks pass through `transformWithEsbuild(loader:'ts')` when route is
  .ts/.tsx → plain-JS output (regression test added).
- transformNexilSource is now async (esbuild API); plugin.transform + cli await it.
- Scaffold: real counter (onClick$ handler receives {element}), bootstrap script
  tag in shell, DOM lib, reactivity dep, ^2.0.0 ranges, create-nexil-app bin alias,
  invokedAs-aware usage message.
- tests/e2e/deno-runtime.spec.ts: adapter/renderRoute(static|server|isr SWR)/
  escaping/bootstrap-contract checks; playwright testIgnore; CI step added;
  logic locally validated under Node type-stripping.

## Version strategy

All 18 public packages bumped 0.2.x/0.2.1 → 2.0.0 to match the v2.0.0 GA tag.
create-nexil-app package remains private/superseded; its NAME survives as a bin
alias on create-nexil (amends ADR-002).

## Validation evidence

- Local: build/typecheck/lint/format/test/budget/e2e(6)/node-smoke/edge-smoke all 0;
  security audit clean; Deno spec logic verified under Node (6 checks).
- gaapp workspace scaffold: build emits nexil-bootstrap.js + nexil-chunks/chunk_*.js
  with clean JS; check:budget passes; dev serves bootstrap (200) + shell tag present.
