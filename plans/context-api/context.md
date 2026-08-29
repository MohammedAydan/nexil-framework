# Context: context-api

## Files touched (recon)

- `package.json:15` scripts, `pnpm-workspace.yaml:1`, `packages/*/package.json` (19 pkgs)
- `packages/core/src/index.ts:93` ContextScope, `103` createRequestContext, `155` Context, `167` activeContextScope singleton, `233` createContext
- `packages/server/src/index.ts:1` DataContext, `127` requestContextFromData
- `packages/client/src/index.ts:176` materializeScope, `497` stableHash, `537` createScopeRegistry
- `packages/vite-plugin/src/index.ts:143` captureExpressionWithImports, `699` on*$ boundary, `850` ScopeRef kinds
- `packages/vite-plugin/src/bootstrap.ts:2` + `external-bootstrap.ts` + `external-bindings.ts` registry & dispose
- `packages/renderer/src/modes.ts:36` renderRoute, `packages/router/src/navigation.ts:76` swap/dispose
- `plans/ARCH.md`, `plans/context.md`, `docs/adr/phase-2-production-parity.md`

## Current flaw

`activeContextScope` mutable global breaks §6. Must move to `AsyncLocalStorage` per-request + keep explicit `scope` threading for SSG/sync composition.

## Next step

Implement T1-T2 in `packages/core/src/index.ts` (ALS, useContext free export, value-type checks) then T4 registry extension. Do not touch unrelated packages without arch reason.
