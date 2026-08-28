# Plan: Nexil Full Rename (nexil → nexil)

## Goal

Complete the `Nexil`→`Nexil` rebrand that was left half-done: rename every remaining user-facing `nexil` string to `nexil` across docs, README, CLI, starter, vite-plugin, router, dev-server, serve, and generated artifacts, while keeping `nexil` aliases for one minor version for backward compat.

## Acceptance Criteria

- [ ] `pnpm dlx @nexil/create-nexil@1.0.0 my-nexil-app --yes --ts` scaffolds, installs, builds, and `nexil dev` serves 200
- [ ] `pnpm dlx @nexil/create-nexil` still works via bin alias (compat)
- [ ] `nexil` binary works; `nexil` binary still works via alias
- [ ] Generated project uses `nexil.config.ts`, `nexil dev/build/start`, `<!--nexil-*-outlet-->`, `nexil-*.js`, `nexil-chunks/`, `nexil-manifest.json`
- [ ] `NEXIL_*` env vars are primary; `NEXIL_*` still read as fallback with deprecation warning
- [ ] `X-Nexil-Navigation` header is primary (already done); `X-Nexil-Navigation` fallback removed or kept as alias — documented
- [ ] `__nexil*` globals are primary; `__nexil*` aliases kept for one version if feasible
- [ ] README.md, docs/en/**, docs/ar/** contain zero `nexil` except in “Migrated from” notes and compat tables
- [ ] `examples/nexil-showcase` → `examples/nexil-showcase` (git mv), `examples/nexil-workbench` → `examples/nexil-workbench` (if exists)
- [ ] `packages/create-nexil` → `packages/create-nexil` (new canonical, old kept as compat re-export or bin alias)
- [ ] All 23 packages publish as `@nexil/*@1.0.0` with `repository.url` pointing to `nexil-framework`
- [ ] CI gates green: `pnpm build` 34/34, `pnpm test` 211+, `pnpm test:e2e` 20/20, `pnpm format:check`

## Approach

1. Audit: grep for `nexil` (case variants) and classify (done in context.md)
2. Create `plans/nexil-full-rename` scaffolding
3. Implement in layers:
   - Layer 0: `packages/cli` bin alias, `packages/create-nexil` → `packages/create-nexil` (copy + alias), `packages/starter` template strings
   - Layer 1: CLI build pipeline (asset names, manifest, chunks, config file name, outlet markers)
   - Layer 2: Runtime globals/headers/env (`NEXIL_*` → `NEXIL_*`, `__nexil*` → `__nexil*`, `X-Nexil-Navigation`)
   - Layer 3: Rename example directories via `git mv`
   - Layer 4: Docs/README bulk replace (`nexil` → `nexil` except compat notes)
   - Layer 5: Repository URLs `nexil-framework` → `nexil-framework`
4. Keep compat shims: CLI reads both `nexil.config.*` and `nexil.config.*`, bin has both names, env fallback, header/runtime dual-write where cheap
5. Update `pnpm-workspace.yaml` if package dirs renamed
6. Run `pnpm install --no-frozen-lockfile` if needed, `pnpm build`, `pnpm test`, `pnpm test:e2e` subset, `pnpm exec prettier --write .`
7. Commit + push

## Scope

IN: docs, README, starter, cli, vite-plugin, dev-server, serve, router, examples, repository URLs
OUT: git history rewrite, npm registry org rename (already `@nexil`), folder `nexil-framework` on disk (local path, not required)

## Dependencies

- Node 22, pnpm 10.15
- Playwright browsers installed

## Complexity

XL — touches ~40 files + 2 directory renames + bin aliases. Risk: broken e2e if asset names/outlet markers not updated atomically.

## Notes

Previous partial rename left `nexil-*` artifacts intentional for BC. This plan makes `nexil-*` canonical and retains `nexil-*` as alias where zero-cost; otherwise breaking with migration note in docs.
