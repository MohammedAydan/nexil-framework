# Review: create-nexil v2

## What was changed (strict scope)

- `packages/create-nexil/package.json:4` version `0.0.1` (kept, per user request `v 0.0.1` — not bumped to 0.0.2)
- `packages/create-nexil/src/scaffold.ts:1-13` added `createStarterFiles`/`resolveStarterOptions` re-exports from `@nexil/starter` (no starter API change, just re-export)
- `packages/create-nexil/src/bin.ts:1-210` complete rewrite: help/version/dry-run, unknown-option, exit codes, invokedAs, concise stderr, rollback, containment, dry-run via `createStarterFiles` (pure) with `^0.0.1` deps, no stack traces
- `packages/create-nexil/src/index.test.ts:1-260` new 26 tests (parsing, name, containment, scaffold success for minimal/interactive/secure-node×ts/js, dry-run, help/version, error formatting, existing dir, unknown, invalid template, success, alias)
- `packages/create-nexil/README.md:3-16` updated flags and examples to `0.0.1`, added `--dry-run/--help/--version` and template contracts
- `docs/en/03-project-creation.md:13-35` added CLI options/error handling section and 0.0.1 examples
- `plans/create-nexil-v2/*` plan/tasks/context

## Not modified (verified via git status)

- All other `packages/*` (core, cli, starter, vite-plugin, router, etc.) — version stays `0.0.1`, no rebuild, no publish
- `examples/*`, `README.md` (except via create-nexil? README already 0.0.1), other `docs/*`, `pnpm-lock.yaml`, `tsconfig.json`

## Publish artifact

- `pnpm --filter @nexil/create-nexil exec npm pack --dry-run` → `nexil-create-nexil-0.0.1.tgz` 8 files (`dist/*`, `README.md`, `package.json`), `package.json` `dependencies: {"@nexil/starter":"0.0.1"}` (no `workspace:*` leak, pnpm replaces `workspace:*` → `0.0.1` on pack)
- `dist/bin.js` 8.6kB (was 517B) — includes hardened logic

## Tests run

- `pnpm --filter @nexil/create-nexil build` → `tsc -p tsconfig.json` pass
- `pnpm --filter @nexil/create-nexil exec vitest run --reporter=verbose` → `26 passed` (parsing 3, name 2, containment 2, scaffold 5, failures 4, dry-run 2, CLI 9)
- `node packages/create-nexil/dist/bin.js --help` → 0, ` --version` → 0.0.1, `--dry-run` → lists 8 files, no FS
- Scaffold via `node packages/create-nexil/dist/bin.js my-nexil-app --yes --ts --template {minimal,interactive,secure-node} × {ts,js}` 6 combos → all `PASS` (outlets, scripts `nexil dev`, `counter.tsx` only for interactive, `nexil.config.ts`/`js` only for secure-node, no `workspace:*`, no `nexis`)

## Generated-project checks (6 combos x 2 langs = 6 actually 3×2=6)

- minimal ts/js: `package.json` `nexil dev`, `index.html` `<!--nexil-*-outlet-->`, `src/routes/index.{tsx,jsx}`, no `counter`, no `nexil.config.*`
- interactive ts/js: adds `counter.{tsx,jsx}` with `onClick$`, 8 files
- secure-node ts/js: adds `nexil.config.{ts,js}` with `securityHeaders`+`trustProxy:false`
- All have `.npmrc` `@nexil:registry`, `README.md`, `public/styles.css`, `tsconfig.json` with `jsxImportSource @nexil/jsx-runtime`

## Limitations

- `ENOSPC`/`EACCES` paths not unit-tested with real FS errors (would require mocking `writeFile` to throw); handling is via `code === 'EACCES'|'EPERM'|'ENOSPC'|'EEXIST'` hint + rollback, but not exercised in CI without fault injection
- `pnpm create`/`npm create` alias `create-nexil-app` works via same bin (`basename` handling), but not separately e2e-tested with actual `npx create-nexil-app` (would require registry publish)
- Dry-run currently always shows `^0.0.1` deps (not `workspace:*` even when inside framework checkout) — intentional to show published view

## Confirmation

- No other `packages/*` modified: `git status --porcelain` shows only `packages/create-nexil/**`, `packages/create-nexil/README.md`, `docs/en/03-project-creation.md`, `plans/create-nexil-v2/*`
- Packed artifact contains no `workspace:*`: verified via `tar -xzf ... -O package/package.json` → `"@nexil/starter":"0.0.1"`
- Version kept at `0.0.1` per user request (not bumped to 0.0.2)
