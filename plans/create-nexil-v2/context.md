# Context: create-nexil v2

## Files to create/modify (strict scope)

- `packages/create-nexil/package.json` — version 0.0.1→0.0.2, verify dependency @nexil/starter
- `packages/create-nexil/src/bin.ts` — full CLI hardening (help/version/dry-run/unknown/exit codes/invokedAs/error formatting/rollback)
- `packages/create-nexil/src/scaffold.ts` — keep re-export, optionally add wrapper for dryRun if needed (no starter API change)
- `packages/create-nexil/src/*.test.ts` — new tests (bin, scaffold, isContainedPath, name, dry-run, template, rollback)
- `packages/create-nexil/README.md` — update to 0.0.2 and new flags
- `docs/en/03-project-creation.md` — update initializer version + flags

## Files explicitly NOT to touch

- Any other `packages/*` (core, cli, starter, vite-plugin, router, etc.) — version stays 0.0.1, no rebuild
- `examples/*`, `README.md` (keep 0.0.1), other `docs/*`, `pnpm-lock.yaml` (unless pnpm install for create-nexil dep change), `tsconfig.json`

## Dependencies

- `@nexil/starter@0.0.1` published, API:
  - `parseScaffoldArgs(args: readonly string[]): {name?, options: ScaffoldOptions}`
  - `assertScaffoldProjectName(name)`, `isContainedPath(parent, child)`, `scaffoldProject(name, parent, options)`
  - `createStarterFiles(options: StarterOptions): StarterFile[]` (pure, no FS)
  - `ScaffoldOptions {language?, tailwind?, template?, yes?}`

## Current state (baseline)

- `bin.ts:12` — `if (!name) throw new Error(Usage: ...)` → unhandled, stack trace exposed
- `scaffold.ts:13` — pure re-export, no error handling, no dry-run, no help/version
- No tests under `packages/create-nexil` (only `packages/starter/src/index.test.ts` exists)
- `package.json:4` version `0.0.1`, `dependencies: @nexil/starter: workspace:*` — pack dry-run currently shows 8 files, need to verify workspace leak after build

## Open questions

- Should `--dry-run` also simulate `pnpm-workspace.yaml` creation when inside framework checkout? Yes, list it but don't write.
- Rollback scope: if `mkdir` succeeded and 1 file written then 2nd fails with ENOSPC, remove entire directory (since we created it) — safe because we checked `entries.length===0` before.
- Exit codes: `0` help/version/dry-run success, `1` user error (invalid name, unknown flag, existing dir), `1` system error (EACCES, ENOSPC) — never throw raw.
- Template contracts: `minimal` → no `counter.tsx`, no `nexil.config.*`; `interactive` → `counter.tsx` + button `onClick$`; `secure-node` → `nexil.config.ts` with `securityHeaders` + `trustProxy:false`
