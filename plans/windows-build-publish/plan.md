# Feature: Windows Build Fix + GitHub Packages Publish + CLI E2E Validation

## Goal

Make the monorepo build cleanly on Windows, publish the public `@mohammedaydan/*` packages to GitHub Packages, and prove `pnpm dlx @mohammedaydan/create-nexis` scaffolds an app that installs/builds/runs from published packages only.

## Acceptance Criteria

- [ ] `pnpm install` && `pnpm run build` succeed on Windows PowerShell
- [ ] `examples/basic-app/dist` and `examples/landing-page/dist` generated correctly (no `D:\D:\` paths)
- [ ] typecheck, lint, unit tests pass; runtime smokes run where toolchain available
- [ ] Public package list identified and documented; internal/duplicate package kept private
- [ ] Tarballs inspected: correct files, no workspace:* leaks, valid exports
- [ ] All public packages published to GitHub Packages in dependency-safe order
- [ ] `npm view @mohammedaydan/create-nexis version --registry=https://npm.pkg.github.com` returns version
- [ ] Fresh scaffold OUTSIDE repo installs, builds, starts, serves expected HTML
- [ ] No local paths / workspace refs in generated consumer
- [ ] Tag-driven GitHub Actions publish workflow committed
- [ ] No credentials committed; git tree clean

## Approach

1. Fix `tests/e2e/build-basic-app.mjs` path construction (fileURLToPath).
2. Commit already-applied cross-platform root build script.
3. Full build + test matrix locally.
4. Mark create-nexis-app private; update READMEs; add project .npmrc (scope routing only).
5. Dry-run publish → inspect tarballs → publish topologically.
6. External consumer validation in temp dir outside the repo.
7. Rework publish workflow to tag-driven; update docs.

## Scope

IN: packages/*, tests/e2e scripts, root scripts, workflows, README/SECURITY docs, .npmrc strategy.
OUT: deleting examples, weakening tests, changing framework runtime behavior.

## Dependencies

GitHub PAT auth already verified (`npm whoami` → MohammedAydan). GITHUB_TOKEN env present locally but must be treated as compromised (document revocation).

## Estimated complexity: L
