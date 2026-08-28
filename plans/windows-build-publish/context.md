# Feature Context

## Files touched

- `tests/e2e/build-basic-app.mjs` — fileURLToPath fix
- `package.json` (root) — cross-platform build script (already modified pre-session, committing)
- `.npmrc` — new, scope routing only
- `packages/create-nexil-app/package.json` — add `"private": true`
- READMEs (root, create-nexil-app) — CLI naming coherence
- `.github/workflows/publish-packages.yml` — tag-driven release
- SECURITY.md — compromised-token revocation note

## Environment facts (verified)

- Node v25.9.0, pnpm 10.15.0, Windows PowerShell
- User-level `C:\Users\moham\.npmrc` has scope routing + token (works: npm whoami → MohammedAydan)
- `GITHUB_TOKEN` env var is set locally — ASSUME COMPROMISED (was exposed in conversation); never print
- Stale artifacts: `my-nexil-app/` (old @nexil/* scope scaffold), untracked `REPORT.md`

## Open questions resolved

- create-nexil-app == create-nexil byte-for-byte except bin name → supersede (ADR-002)
- Examples are private, no version field needed
