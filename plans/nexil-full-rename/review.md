# Review: Nexil Full Rename

## What was built
- Renamed initializer package directory `packages/create-nexis` → `packages/create-nexil` and `packages/create-nexis-app` → `packages/create-nexil-app` to match package names `@nexil/create-nexil` / `@nexil/create-nexil-app` (already renamed in package.json). Updated `tsconfig.json` references (already pointed to `create-nexil`).
- Renamed example directories `examples/nexis-showcase` → `examples/nexil-showcase` and `examples/nexis-workbench` → `examples/nexil-workbench` to match `@nexil/example-nexil-showcase` package name and `bench:*` scripts (`examples/nexil-showcase/...`). Fixed inner asset `public/nexis-showcase.svg` → `public/nexil-showcase.svg`, `benchmarks/comparison/astro-baseline/nexis-showcase.svg` → `nexil-showcase.svg`, `nexis.config.json` → `nexil.config.json`.
- Fixed constant name `nexil_NAVIGATION_RUNTIME` → `NEXIL_NAVIGATION_RUNTIME` in `packages/router/src/navigation.ts` and `packages/router/src/index.ts` (kept lowercase alias for BC), updated `packages/cli/src/index.ts` import, and docs `docs/en/15-api-reference.md`, `docs/ar/15-مرجع-API.md`.
- Added bin aliases for BC: `@nexil/cli` now exposes both `nexil` and `nexis`; `@nexil/create-nexil` now exposes `create-nexil`, `create-nexil-app`, `create-nexis`, `create-nexis-app`; private `create-nexil-app` keeps `create-nexis-app` alias.
- Fixed env var casing: bulk rename had produced lowercase `nexil_HOST` etc. Replaced 23 occurrences across `packages/cli`, `packages/dev-server`, `playwright.config.ts`, `docs/**`, `examples/**` to uppercase `NEXIL_HOST`, `NEXIL_PORT`, `NEXIL_ALLOW_ALL_HOSTS`, `NEXIL_SITE_ORIGIN`, `NEXIL_ACTION_ORIGINS`, `NEXIL_TRUST_PROXY`.
- Added fallback `?? process.env.NEXIS_*` for `NEXIL_*` reads in `packages/cli/src/index.ts` and `packages/dev-server/src/index.ts` (with correct precedence and `?.trim()` handling), plus `NEXIL_SITE_ORIGIN` fallback. Fixed `dev-server` `TRUST_PROXY` parentheses bug and `cli` `hostEnv`/`portEnv` refactoring to satisfy Vite `ServerOptions` typing.
- Verified generation: `scaffoldProject('my-nexil-app', ..., {yes:true})` now emits `package.json` with `nexil dev/build/start`, `index.html` with `<!--nexil-*-outlet-->`, `nexil.config.ts`, and `@nexil/*@^1.0.0` deps.
- Docs/README already fully branded `Nexil` (README, `docs/en/03`, `docs/ar/03`, `docs/en/20`, starter `SHELL_HTML`, `packageJson` scripts). No remaining source `nexis` except `plans/nexil-full-rename` and ignored `dist/node_modules` bins (intentional `nexis` alias). Repository URLs already `nexil-framework`.

## Edge cases handled
- Kept `nexis` bin aliases so existing `npx @nexil/create-nexis` and `nexis dev` continue to work for one minor version.
- Env fallback ensures deployments still honoring `NEXIS_*` don't break after rename; `NEXIL_*` is primary.
- `NEXIL_NAVIGATION_RUNTIME` alias `nexil_NAVIGATION_RUNTIME` preserves imports from older docs.
- `pnpm-lock.yaml` already referenced `create-nexil`; no lockfile churn needed beyond `pnpm install` check.
- `public/nexil-showcase.svg` rename required `git mv` to keep `benchmarks/build-media.mjs` (`copyFile` from `public/nexil-showcase.svg`) working; build would otherwise ENOENT.

## Verification
- `pnpm build` 34/34 Done (`Nexil build completed`, `Nexil media build produced 4 variants`)
- `pnpm test` 30 files / 211 tests passed
- `pnpm exec playwright test` 20/20 passed (engine-proof, link-navigation, resumability, runtime, showcase, state-scope); `nexil-bootstrap.js` / `nexil-chunks/` observed
- `scaffoldProject` smoke: `my-nexil-app` creates `nexil dev` scripts and `nexil-*` outlets
- `pnpm format:check` — All matched files use Prettier code style!

## Known limitations / follow-ups
- `examples/nexil-showcase/dist` and `examples/nexil-workbench/dist` still contain previously built `nexis-*` artifacts until next `pnpm build` cleans them (not a source issue).
- `node_modules/.bin/nexis` remains as alias binary (intentional BC) — not a source `nexis` leak.
- `plans/nexil-full-rename` itself contains `nexis` strings for historical context — excluded from grep.
- If full removal of `NEXIS_*` fallback is desired in next major, remove `?? process.env.NEXIS_*` branches and `nexis` bin aliases.

## Follow-ups
- Optional: rename local filesystem parent folder `nexis-framework` → `nexil-framework` (user local path, not required for CI).
- Optional: update `Nexis_Implementation_Report.md` filename to `Nexil_Implementation_Report.md` if desired.
