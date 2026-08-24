# Session Log

## Session: 2026-08-25 ~01:30–03:00 (local) — v2.0.0 GA

### What was done

- Resumability runtime unified (ADR-005): RESUMABILITY_BOOTSTRAP owned by
  vite-plugin, imported via absolute /nexis-chunks/ URLs; dev middleware serves
  bootstrap+chunks; builds emit identical static paths; TS handler chunks pass
  through esbuild (plain-JS output guaranteed, regression-tested).
- transformNexisSource became async (esbuild); all callers updated.
- Scaffold templates upgraded: real resumable counter, bootstrap script tag,
  DOM libs, reactivity dependency, ^2.0.0 ranges, create-nexis-app bin alias
  (ADR-002 amendment), invokedAs-aware usage message.
- README rewritten as GA documentation hub (truthful APIs only).
- tests/e2e/deno-runtime.spec.ts added (adapters/renderRoute modes incl ISR
  SWR/escaping/bootstrap contract); playwright testIgnore; CI steps added;
  --allow-env required (vite probes env); bootstrap extracted to zero-dep
  module so the spec never loads vite under Deno.
- All 18 public packages bumped to 2.0.0 (ADR-006); tag v2.0.0 pushed;
  Publish packages workflow completed SUCCESS on first live run.
- External consumer validation at 2.0.0: dlx scaffold → install (all five deps
  resolve at 2.0.0) → build → check:budget → start serves 200 (+bootstrap).
  create-nexis-app alias form verified via pnpm dlx --package=…

### Incident notes

- Accidentally overwrote vite-plugin/src/index.ts with a fragment (write tool
  misuse); restored from git immediately, then applied the intended edit.
- Two CI quality failures were caught and root-caused: (1) Deno env capability,
  (2) vite-in-barrel layering; both fixed and pushed.

### State at end of session

- Registry: all packages at 2.0.0 (publish workflow green).
- Main HEAD da94162 awaiting green quality confirmation (deno fix).
- Next: none blocking; optional follow-up = route HTML emission in build
  (documented roadmap in README limitations discussion).

## Session: 2026-08-25 ~00:20–01:30 (local)

### What was done

- Fixed Windows path bugs: `tests/e2e/build-basic-app.mjs` (`new URL().pathname` →
  `fileURLToPath`) and `tests/e2e/serve.mjs` (forward-slash containment checks →
  `path.relative`). E2E suite went from webServer-timeout to 6/6 passing.
- Full local gate green on Windows PowerShell: build, typecheck, lint,
  80 unit/integration tests, 6 Playwright e2e, node + miniflare smokes.
  Deno smoke unavailable (Deno not installed) — environment limitation.
- Publishing readiness:
  - Recursive publish filter never matched in npm scripts on Windows
    (single quotes not stripped by cmd). Replaced with `pnpm -C packages publish -r`.
  - Excluded compiled `*.test.*` from tarballs via `files` negation in all 18 manifests.
  - Marked `@mohammedaydan/create-nexis-app` private (byte-identical legacy duplicate
    of create-nexis); README points to canonical initializer.
  - Added project `.npmrc` (scope routing only, no credentials).
- Published 18 packages to GitHub Packages at v0.1.0; republished
  `cli` + `create-nexis` at 0.1.1 then 0.1.2 after scaffold DX fixes.
- Scaffold improvements (both cli and create-nexis copies): standalone apps now get
  `pnpm.onlyBuiltDependencies` and a `start` script.
- End-to-end consumer validation outside the repo via
  `pnpm dlx @mohammedaydan/create-nexis@latest`: scaffold → install → build → dev (HTTP 200)
  → start (HTTP 200); no workspace/local leaks in package.json or pnpm-lock.yaml.
- New tag-driven `.github/workflows/publish-packages.yml` with gates and tarball validation.
- SECURITY.md: credential handling + compromised-token revocation policy.
- Prettier-normalized repository (format gate was failing before this session).
- Removed stale artifacts: old-scope `my-nexis-app/`, empty `REPORT.md`, logs.

### Decisions made

- create-nexis-app superseded by create-nexis (ADR-002) — private, kept for reference.
- Project .npmrc carries scope routing only; tokens stay user-level/env (ADR-003).
- Tag-driven releases instead of per-push publishing (ADR-004).
- Bumped cli/create-nexis to 0.1.2 rather than re-publishing immutable versions.

### Files changed

See commits 17472bb, ba58a88, efbd72d, 6092bd2 (pushed to origin/main).

### State at end of session

- Active feature: windows-build-publish — COMPLETE except GitHub-side visibility flip.
- Last completed task: push + quality CI run triggered on 6092bd2.
- Next task: manual one-time visibility change of the 18 GitHub Packages to public
  (no API exists for user-owned npm packages; UI-only).
- Blockers: none for the repo itself.

### Resume instructions

Verify quality.yml finished green for 6092bd2. If the user has flipped package
visibility to public, re-test anonymous `npm view` (still expect 401 — GitHub Packages
npm always requires auth; visibility only affects who can install with their own token).
For a release: bump package versions, tag `v<version>`, push tag.
