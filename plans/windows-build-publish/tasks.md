# Tasks

- [x] Bootstrap plans/
- [x] Fix tests/e2e/build-basic-app.mjs Windows path bug
- [x] Fix tests/e2e/serve.mjs Windows containment-check bug (E2E timeout)
- [x] Verify basic-app + landing-page dist outputs
- [x] Run pnpm install + full build on Windows
- [x] Run typecheck / lint / unit tests (80 pass)
- [x] Run e2e (6 pass) + node/edge smokes; deno unavailable (documented)
- [x] Audit all package.json metadata for publishability
- [x] Public list = all packages/* except create-nexis-app (now private)
- [x] Exclude compiled *.test.* from tarballs via files negation
- [x] Add project .npmrc (scope routing only); verify no secrets
- [x] Fix recursive publish filter failure (quote stripping) via pnpm -C packages
- [x] Dry-run publish + inspect tarballs (no workspace:* leaks)
- [x] Publish 18 public packages v0.1.0; cli+create-nexis bumped to 0.1.2
- [x] Verify npm view from GitHub Packages
- [x] Scaffold app OUTSIDE repo via pnpm dlx; install/build/dev/start/smoke OK
- [x] Verify generated consumer has no local/workspace deps (pkg.json + lockfile)
- [x] Tag-driven publish workflow
- [x] Update README/SECURITY docs (incl. revoke compromised token note)
- [x] Prettier normalize repo (format gate was already failing pre-session)
- [~] Final clean commit(s); tree clean

## Post-publish discovery
- All 18 packages landed PRIVATE on GitHub Packages (`access: public` in
  publishConfig does NOT control GitHub visibility). No REST API exists to flip
  visibility for user-owned npm packages (404 on change-visibility endpoint).
  Manual one-time UI step required per package — documented in README.
- Anonymous installs return 401 even for public packages: platform behavior of
  GitHub Packages npm registry. Consumers need a PAT with read:packages.
