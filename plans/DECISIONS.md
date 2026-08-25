# Architecture Decisions

## ADR-001: Cross-platform cleanup â€” no shell find/rm in scripts

- **Date:** 2026-08-25
- **Status:** Accepted (already applied locally; committed this session)
- **Context:** Root `build` used `find ... -exec rm -rf`, which fails on Windows PowerShell.
- **Decision:** Use `pnpm -r --sort build` alone; per-package builds already clean their outputs. Keep `.gitignore` covering `dist/`.
- **Consequences:** Works on all platforms; no cleanup script needed for correctness.

## ADR-002: create-nexis is the public scaffolder; create-nexis-app is superseded

- **Date:** 2026-08-25
- **Status:** Accepted
- **Context:** `packages/create-nexis-app` is a byte-identical duplicate of `packages/create-nexis` except bin name. Publishing both confuses consumers.
- **Decision:** Keep `@mohammedaydan/create-nexis` as the single public initializer. Mark `@mohammedaydan/create-nexis-app` `"private": true` (build still runs; never published) and update its README to point at create-nexis. Update root README accordingly.
- **Alternatives considered:** Publish both (confusing); delete the package (loses history/reference).
- **Consequences:** One canonical scaffold command; no accidental duplicate publication.
- **Amendment (GA):** The `create-nexis-app` NAME survives as a second bin on `@mohammedaydan/create-nexis` (`npm exec --package @mohammedaydan/create-nexis -- create-nexis-app â€¦`), satisfying initializer-name compatibility without a duplicate package.

## ADR-003: Secure registry configuration strategy

- **Date:** 2026-08-25
- **Status:** Accepted
- **Context:** Repo needs scopeâ†’GitHub Packages routing locally and in CI without committing secrets.
- **Decision:** Commit project `.npmrc` containing ONLY `@mohammedaydan:registry=https://npm.pkg.github.com`. Auth comes from user-level `.npmrc` or `${GITHUB_TOKEN}`/`${NODE_AUTH_TOKEN}` env vars. CI writes an isolated npmrc from GITHUB_TOKEN into runner temp.
- **Consequences:** No credential can leak via the repo; local dev keeps working via existing user config.

## ADR-004: Tag-driven release workflow

- **Date:** 2026-08-25
- **Status:** Accepted
- **Context:** Publishing should be deliberate, not per-push.
- **Decision:** `publish-packages.yml` triggers on version tags `v*`: install â†’ typecheck/lint/test â†’ build â†’ pack dry-run validation â†’ publish in topological order â†’ smoke-verify create-nexis resolvable. Uses GITHUB_TOKEN with `contents: read` + `packages: write`.
- **Consequences:** Reproducible releases; no long-lived secrets.

## ADR-005: Resumability runtime uses stable absolute chunk URLs

- **Date:** 2026-08-25
- **Status:** Accepted
- **Context:** The bootstrap imported chunks relatively from build-only paths; dev had no way to serve them, so interactive templates only worked post-build with custom hosting. Also, TypeScript handler expressions leaked type annotations into plain-JS chunks.
- **Decision:** `RESUMABILITY_BOOTSTRAP` (owned by vite-plugin) imports `/nexis-chunks/<file>`. The plugin's dev middleware serves bootstrap+chunks from live transforms; builds emit identical static paths. TypeScript route chunks pass through esbuild (`loader: 'ts'`) so emitted code is always plain JS. `transformNexisSource` is async accordingly.
- **Consequences:** Identical interactive behavior in dev and production; self-describing artifacts (`nexis-bootstrap.js`, `nexis-chunks/`, `nexis-manifest.json`).

## ADR-006: v2.0.0 GA aligns repo tag with the package version line

- **Date:** 2026-08-25
- **Status:** Accepted
- **Context:** Packages sat at 0.1.x while the project narrative declared v2.0.0 GA.
- **Decision:** All 18 public packages move to 2.0.0; scaffold templates depend on ^2.0.0; tag `v2.0.0` triggers publication through the existing pipeline.
- **Consequences:** Tag ↔ registry versions match; consumers receive coherent ^2.0.0 ranges.

## ADR-007: Routes are rendered by the engine; index.html is a pure shell

- **Date:** 2026-08-25
- **Status:** Accepted
- **Context:** Audit found the "ghost static file" bypass: scaffolded `index.html` carried a full pre-baked landing page, so `nexis dev`/`start` displayed static markup while `src/routes/index.tsx` was never parsed or rendered â€” the renderer, JSX runtime, signals, and resumability serializer were all bypassed.
- **Decision:** (1) Templates ship a minimal shell containing only `<!--nexis-head-outlet-->`, `<!--nexis-app-outlet-->`, `<!--nexis-scripts-outlet-->`. (2) `@mohammedaydan/dev-server` exports `nexisSSRPlugin(root)`: a Vite SSR middleware that matches requests via `@mohammedaydan/router`, loads route modules through `ssrLoadModule`, renders via `@mohammedaydan/renderer`'s `renderToString`, injects SEO head via `renderHead`, and injects the resumability bootstrap when `data-nx-on-click` is present. (3) `nexis build` executes the same engine at build time, prerendering per-route HTML into `dist/client/<route>/index.html` plus mirrored preview roots. (4) `core` re-exports `component`/`state`/`computed`/`batch` (signals from `@mohammedaydan/reactivity`) so templates can use the documented API surface.
- **Alternatives considered:** keeping the marketing HTML as the served shell (rejected: it is precisely the bypass); separate dev HTTP server inside dev-server (rejected: duplicates Vite, breaks HMR).
- **Consequences:** JSX runtime and signals execute during every render path; handler chunks resolve to real emitted files (chunk hashes normalized across transform/build contexts); interactive proof is enforced by `tests/e2e/engine-proof.spec.ts`.

## ADR-008: Composite clean must remove tsbuildinfo

- **Date:** 2026-08-25
- **Status:** Accepted
- **Context:** After `pnpm -r clean` deleted only `dist/`, composite `tsc -p` considered projects up-to-date via stale `tsconfig.tsbuildinfo` and silently skipped emit, producing "successful" builds with no output (masked missing workspace links).
- **Decision:** Every package's `clean` removes both `dist` and `tsconfig.tsbuildinfo`; root `scripts/clean.mjs` does the same across packages/examples plus Playwright artifacts.
- **Consequences:** `pnpm -r clean && pnpm -r build` always produces real artifacts.

- **Date:** 2026-08-25
- **Status:** Accepted
- **Context:** Packages sat at 0.1.x while the project narrative declared v2.0.0 GA.
- **Decision:** All 18 public packages move to 2.0.0; scaffold templates depend on ^2.0.0; tag `v2.0.0` triggers publication through the existing pipeline.
- **Consequences:** Tag â†” registry versions match; consumers receive coherent ^2.0.0 ranges.
