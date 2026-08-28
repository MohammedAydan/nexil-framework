# Project: Nexil Framework

## Purpose

HTML-first, resumable TypeScript web framework. Monorepo of scoped packages (`@nexil/*`) published to GitHub Packages, with a scaffolding CLI (`create-nexis`) that generates consumer apps.

## Current Status

- Active feature: windows-build-publish (complete — CI green on 0f4210e)
- Overall health: green
- Last updated: 2026-08-25

## Critical Constraints

- Must build/run on Windows PowerShell, Linux, macOS (no Unix-only shell in npm scripts)
- No tokens/credentials ever committed
- Generated apps must consume published packages only (no workspace leaks)
- Registry: `https://registry.npmjs.org/` for scope `@nexil`
- Prettier format gate is enforced in CI; run `pnpm exec prettier --write .` before committing new files

## Active Features

- windows-build-publish: complete

## Known Issues / Tech Debt

- A GitHub PAT was exposed in a prior conversation; user must revoke it (policy in SECURITY.md)
- All 18 published packages are PRIVATE on GitHub Packages. Visibility flip is a manual UI-only action per package (no REST API for user-owned npm packages). Anonymous installs return 401 regardless — GitHub Packages npm always requires auth.
- Deno smoke test cannot run locally (Deno not installed); it runs in CI via quality.yml

## Team / Ownership

- All areas: MohammedAydan
