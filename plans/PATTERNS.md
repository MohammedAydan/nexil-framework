# Engineering Patterns

## Pattern: Windows-safe URL-to-path in ESM scripts [feature: windows-build-publish]

- **Problem:** `new URL(...).pathname` returns `/D:/...` on Windows; `path.resolve('/D:/x')` yields `D:\D:\x` (ENOENT mkdir bug).
- **Solution:** Always `fileURLToPath(import.meta.url)` then `dirname()`/`resolve()`.
- **Example:** `tests/e2e/build-landing-page.mjs` (correct) vs old `tests/e2e/build-basic-app.mjs` (buggy).
- **Gotchas:** Applies to every `.mjs` helper that derives paths from import.meta.url.

## Pattern: pnpm publish workspace:* rewriting

- **Problem:** Published manifests cannot contain `workspace:*`.
- **Solution:** `pnpm publish` rewrites `workspace:*` → actual workspace version in the packed manifest. Validate via `--dry-run --pack-destination` + tarball inspection before real publish.
- **Gotchas:** Dependency packages must actually be published too, or consumer installs 404.

## Pattern: GitHub Packages auth boundaries

- **Problem:** Tokens must not land in repo files; installs need auth.
- **Solution:** Project `.npmrc` holds scope routing only; token via env substitution or user-level config; CI uses ephemeral npmrc from `secrets.GITHUB_TOKEN`.
- **Gotchas:** `${VAR}` expansion works in .npmrc only if the var exists; otherwise literal string causes 401.
