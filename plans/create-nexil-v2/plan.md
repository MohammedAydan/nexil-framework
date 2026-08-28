# Plan: create-nexil v2 — Production-Grade Standalone Initializer

## Goal
Harden `@nexil/create-nexil` (`packages/create-nexil`) as a standalone, production-grade initializer without touching any other `packages/*`, without changing `@nexil/starter` public API, and without requiring republish of `@nexil/*@0.0.1`. Support all expected invocation forms (`npx`, `pnpm dlx`, `yarn dlx`, `npm create @nexil/nexil`, `pnpm create @nexil/nexil`, `nexil create`, direct `create-nexil`/`create-nexil-app` bins) with robust parsing, validation, error handling, dry-run, and failure-safe scaffolding.

## Acceptance Criteria
- [ ] `packages/create-nexil/package.json` version bumped `0.0.1` → `0.0.2` (only this package)
- [ ] `packages/create-nexil/src/bin.ts` handles `--help`, `--version`, `--dry-run`, `--yes/-y`, `--ts/--js`, `--tailwind/--no-tailwind`, `--template <name>`/`--template=<name>`, unknown-option errors, correct exit codes (0 success, 1 error), and `create-nexil` vs `create-nexil-app` via `basename`
- [ ] Project-name and destination validation: `assertStarterProjectName`, `isContainedPath` absolute-path escape, traversal (`..`), existing/non-empty dir, race (`EEXIST` on `wx`), permission (`EACCES`/`EPERM`), `ENOSPC` — all produce concise `stderr` messages without stack traces
- [ ] Scaffold is failure-safe: if directory/files were created by this invocation and later step fails, attempt rollback (`rm` directory or written files) — do not leave half-created project claiming success
- [ ] Dry-run (`--dry-run`) lists files that would be created (path + size) and does not touch filesystem
- [ ] Template validation `minimal|interactive|secure-node` with documented contract; each template produces runnable project (`package.json` `nexil dev/build`, `index.html` outlets, `src/routes/index.{tsx,jsx}`, `.npmrc` when not in workspace)
- [ ] Preserves `packages/starter/src/index.ts` / `packages/starter/src/node.ts` API — only re-exports/uses them
- [ ] Publish artifact: `pnpm pack --dry-run` shows `dist/*` + `README.md` + `package.json` only, no `workspace:*` in packed `package.json` dependencies (starter dependency must be `workspace:*` in source but resolved correctly? Actually for publish, `workspace:*` must be replaced — we must ensure `prepublish` or `pnpm publish` replaces it. With current `workspace:*`, `pnpm pack` will keep `workspace:*` which is wrong for publish artifact — must change to `^0.0.1` for publish. But constraint says do NOT change other packages. Need to handle: for `create-nexil`, dependency on `@nexil/starter` is `workspace:*` in source, but when packing/publishing, pnpm should replace with version. With `pnpm publish`, it will publish with `workspace:*`? Need to verify. For isolated initializer, better to keep `workspace:*` in source but ensure `pnpm pack` shows resolved version? We need to check current behavior: `pnpm --filter @nexil/create-nexil pack --dry-run` — starter is `workspace:*`, but published artifact should not contain `workspace:*`. The previous `0.0.1` publish dry-run showed `1.6kB` and no error about workspace. So maybe pnpm handles it via `publishConfig`? Actually pnpm will keep `workspace:*` in packed file unless `publish` replaces it via `workspace:` protocol handling. Need to verify and fix if needed without touching other packages: change `create-nexil/package.json` dependency to `^0.0.1` for publish, but keep `workspace:*` for dev via `pnpm.overrides`? Simpler: keep `workspace:*` and rely on pnpm publish to inline. But requirement says "no workspace:* leaks" — we must verify and if leaks, change to `^0.0.1` (only this package's dependency, not other packages).
- [ ] Tests under `packages/create-nexil` only: parsing, name validation, containment, directory state, error formatting, dry-run, template, scaffold success/failure/rollback, CLI exit codes — all green via `pnpm --filter @nexil/create-nexil test`
- [ ] Generated-project checks: scaffold temp projects for each template×language (6 combos) and verify `package.json` scripts, `nexil` outlets, required files, no `workspace:*` leak
- [ ] `docs/en/03-project-creation.md` updated to reflect new flags/behavior (only this doc, plus `packages/create-nexil/README.md`)

## Approach
1. **Audit current**: `bin.ts` 13 lines, `scaffold.ts` 13 lines re-export, `starter/node.ts` 193 lines already robust (`parseScaffoldArgs`, `isContainedPath`, `assertStarterProjectName`, `scaffoldProject` with `wx` + `ENOENT` handling). Gap is CLI UX/error handling/rollback/dry-run/help/version.
2. **Design new `bin.ts`**: 
   - Import `package.json` version for `--version`
   - Add `--help` text (usage, templates, examples for `npx`, `pnpm dlx`, `npm create`, `pnpm create`)
   - Add `--dry-run` to `ScaffoldOptions` (extend, not modify starter — handle in bin by calling `createStarterFiles` directly and printing, not `scaffoldProject`)
   - Wrap `parseScaffoldArgs`/`scaffoldProject` in try/catch, map known errors to `stderr` + `exit 1` without stack for user errors (`TypeError`/`Error` with known messages), full stack only for unexpected
   - Track `createdDirectory` and `writtenFiles` for rollback: on error after `mkdir`, `rm(directory, recursive, force)`
   - Handle `invokedAs` (`create-nexil` vs `create-nexil-app`) — both valid, same logic, help text shows invoked name
   - Exit codes: 0 success, 1 user error, 1 system error (EACCES/ENOSPC) — never 0 on failure
3. **Extend `ScaffoldOptions` locally** (in `create-nexil`, not starter): `dryRun?: boolean`, `help?: boolean`, `version?: boolean` — parse in `bin.ts` before delegating to starter's `parseScaffoldArgs`, or augment starter's parser via wrapper
4. **Do NOT modify `starter`**: keep `packages/starter/src/node.ts` untouched; if needed, add wrapper logic in `create-nexil/src/scaffold.ts` to expose `dryRun` handling
5. **Bump version**: `packages/create-nexil/package.json:4` `0.0.1`→`0.0.2` (patch, no API break? But new flags are additive, so minor? Use `0.0.2` per instruction)
6. **Update docs**: `packages/create-nexil/README.md` and `docs/en/03-project-creation.md` (only these two) to document new flags and error handling
7. **Test**: add `packages/create-nexil/src/bin.test.ts` and `packages/create-nexil/src/scaffold-impl.test.ts` (or `index.test.ts`) covering all goals; keep tests co-located, no other package tests

## Scope
IN: `packages/create-nexil/**` (src, package.json, README, tests), `docs/en/03-project-creation.md`
OUT: any other `packages/*` (including `@nexil/starter` API), `examples/*`, `pnpm-lock.yaml` (except via `pnpm install` if needed for create-nexil dep), other docs, `README.md` (keep as is, already correct at `0.0.1` — will be `0.0.2` in creation examples? No, generation uses `^0.0.1` for deps, not initializer version — keep README at `0.0.1` for now, or update to `0.0.2`? Better update README creation examples to `0.0.2`? But instruction says only `docs/en/03-project-creation.md` + `packages/create-nexil/README.md` — so leave `README.md` at `0.0.1` for now, or minimal update? We'll keep README at `0.0.1` unless user explicitly wants `0.0.2` there — but creation examples in those two docs should show `@0.0.2`? Actually generated project deps are `^0.0.1`, not initializer version — initializer version `0.0.2` is separate from generated project deps. So docs showing `pnpm dlx @nexil/create-nexil@0.0.1` should be updated to `@0.0.2` after bump. That's within scope (docs/en/03...).
- No workspace-wide build (`pnpm -r build` would rebuild other packages with unpublished starter changes — avoid). Use `pnpm --filter @nexil/create-nexil build` only.
- No `pnpm -r publish`, only `pnpm --filter @nexil/create-nexil pack --dry-run` inspection.

## Dependencies
- Node >=22, pnpm 10.15.0
- Existing `@nexil/starter@0.0.1` published, API `createStarterFiles`, `parseScaffoldArgs`, `scaffoldProject`, `isContainedPath`, `assertStarterProjectName`

## Complexity
M — CLI hardening, error mapping, rollback, dry-run, tests, docs. No starter API change.

## Risks
- `workspace:*` leak in packed tarball if not replaced — must verify via `pnpm pack --dry-run` and change dep to `^0.0.1` only in `create-nexil` if needed (still within scope, not other packages)
- Over-eager rollback deleting user data if directory pre-existed and we mis-detect `createdDirectory` — guard with `entries.length===0` check before `mkdir`
- Stack trace suppression must not hide unexpected bugs — log full error to `stderr` with `cause` when not user error, but still exit 1
