# Session Log

## Session: 2026-08-25 ~01:30â€“03:00 (local) â€” v2.0.0 GA

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
- External consumer validation at 2.0.0: dlx scaffold â†’ install (all five deps
  resolve at 2.0.0) â†’ build â†’ check:budget â†’ start serves 200 (+bootstrap).
  create-nexis-app alias form verified via pnpm dlx --package=â€¦

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

## Session: 2026-08-25 ~00:20â€“01:30 (local)

### What was done

- Fixed Windows path bugs: `tests/e2e/build-basic-app.mjs` (`new URL().pathname` â†’
  `fileURLToPath`) and `tests/e2e/serve.mjs` (forward-slash containment checks â†’
  `path.relative`). E2E suite went from webServer-timeout to 6/6 passing.
- Full local gate green on Windows PowerShell: build, typecheck, lint,
  80 unit/integration tests, 6 Playwright e2e, node + miniflare smokes.
  Deno smoke unavailable (Deno not installed) â€” environment limitation.
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
  `pnpm dlx @mohammedaydan/create-nexis@latest`: scaffold â†’ install â†’ build â†’ dev (HTTP 200)
  â†’ start (HTTP 200); no workspace/local leaks in package.json or pnpm-lock.yaml.
- New tag-driven `.github/workflows/publish-packages.yml` with gates and tarball validation.
- SECURITY.md: credential handling + compromised-token revocation policy.
- Prettier-normalized repository (format gate was failing before this session).
- Removed stale artifacts: old-scope `my-nexis-app/`, empty `REPORT.md`, logs.

### Decisions made

- create-nexis-app superseded by create-nexis (ADR-002) â€” private, kept for reference.
- Project .npmrc carries scope routing only; tokens stay user-level/env (ADR-003).
- Tag-driven releases instead of per-push publishing (ADR-004).
- Bumped cli/create-nexis to 0.1.2 rather than re-publishing immutable versions.

### Files changed

See commits 17472bb, ba58a88, efbd72d, 6092bd2 (pushed to origin/main).

### State at end of session

- Active feature: windows-build-publish â€” COMPLETE except GitHub-side visibility flip.
- Last completed task: push + quality CI run triggered on 6092bd2.
- Next task: manual one-time visibility change of the 18 GitHub Packages to public
  (no API exists for user-owned npm packages; UI-only).
- Blockers: none for the repo itself.

### Resume instructions

Verify quality.yml finished green for 6092bd2. If the user has flipped package
visibility to public, re-test anonymous `npm view` (still expect 401 â€” GitHub Packages
npm always requires auth; visibility only affects who can install with their own token).
For a release: bump package versions, tag `v<version>`, push tag.

## Session: 2026-08-25 ~02:00-04:00 (local) - Ghost Static File Bypass Remediation

### What was done

- Root-caused the bypass: scaffold index.html carried a full pre-baked page;
  dev used bare Vite (no route handling); build copied that HTML verbatim.
  Renderer/jsx-runtime/signals/resumability never executed.
- Implemented nexisSSRPlugin in dev-server (router match -> ssrLoadModule ->
  renderToString -> renderHead -> bootstrap injection); wired into `nexis dev`.
- nexis build now executes the same SSR engine and prerenders per-route HTML
  to dist/client/<route>/index.html (+ mirrored dist roots).
- core re-exports component/state/computed/batch; jsx-dev-runtime with jsxDEV
  added to core + jsx-runtime (Vite SSR dev transform requirement).
- Chunk hashes normalized across transform/build contexts (root cause of a
  404-on-click: HTML referenced a hash that was never emitted).
- Templates reduced to outlet-only shells; scaffold route uses component/state.
- clean scripts now also remove tsconfig.tsbuildinfo (ADR-008) after composite
  tsc silently skipped emit on stale buildinfo.
- engine-proof e2e suite added (real app scaffold -> build -> prerender assert
  -> preview -> click resume 0->1->2); full suite 9/9 green.
- All public packages bumped to 2.1.0; tag v2.1.0 pushed; publish workflow ran.

### Decisions

- ADR-007: routes are engine-rendered; index.html is a pure shell (outlets only)
- ADR-008: composite clean must remove tsbuildinfo

### State at end of session

- main HEAD = SSR remediation commit; tag v2.1.0 -> publish workflow in flight

## Session: 2026-08-26 - v1.0.0 republish cycles (user-directed resets)

- Cycle A: purged 2.x packages + tags, republished all-at-1.0.0 (18 pkgs) via tag pipeline. Success.
- Cycle B: user re-requested purge/republish after merging PRs #6/#7 (phase-3 GA surface: serve,
  serve-cloudflare, serve-deno, telemetry, og-image packages + showcase example + delegated-events
  bootstrap). Publish FAILED at pack-validation gate: new packages lacked !dist/**/_.test._
  exclusion (gate worked as designed). Fixed 4 manifests; hardened gate (ANSI strip, append-only
  package count >= 20, failure diagnostics); also fixed reintroduced D:\D:\ pathname bug in 8
  showcase benchmark scripts. Re-cut tag at 40d91fb: publish SUCCESS, registry 23 pkgs
  EXACT-1.0.0-ONLY 23/23. Fresh dlx consumer verified (install/build/dev 200 + resume attrs).
- Operational learnings recorded: GitHub Packages allows republishing a deleted version number;
  pnpm local metadata cache can falsely report deleted versions as existing (CI cold runners are
  authoritative); Windows pathname bug keeps resurfacing via Linux-authored scripts - watch for it
  in future PRs touching *.mjs build tooling.

## Session: 2026-08-26 - Branch audit + phase2-parity integration

- Audited all remote branches vs main: fix/production-audit-verification,
  feat/nexis-showcase-benchmarks, feat/tailwind-vscode-api-v1 fully merged
  (0 ahead). feat/phase2-production-parity had 2 commits: Arabic docs
  package (docs/ar, 23 files) + English docs relocated to docs/en.
- Merged --no-ff into main (clean, 7778f23). Deduped English docs:
  docs/en supersedes identical docs/docs_en from PR #7 (ffb1b56).
- Local gates briefly red post-merge: packages/css tailwind-merge symlink
  dangled into a deleted temp workspace fixture (.tmp-engine-proof-*);
  root pnpm install relinked. Note: temp workspaces created inside the
  repo can orphan package symlinks on deletion - reinstall afterwards.
- Gates green: build/typecheck/test/format. Pushed ffb1b56.
