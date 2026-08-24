# Project: Nexis Framework

## Purpose

HTML-first, resumable TypeScript web framework. Monorepo of scoped packages (`@mohammedaydan/*`) published to GitHub Packages, with a scaffolding CLI (`create-nexis`) that generates consumer apps.

## Current Status

- Active feature: windows-build-publish (fix Windows build, publish to GitHub Packages, validate CLI end-to-end)
- Overall health: green
- Last updated: 2026-08-25

## Critical Constraints

- Must build/run on Windows PowerShell, Linux, macOS (no Unix-only shell in npm scripts)
- No tokens/credentials ever committed
- Generated apps must consume published packages only (no workspace leaks)
- Registry: `https://npm.pkg.github.com` for scope `@mohammedaydan`

## Active Features

- windows-build-publish: in progress

## Known Issues / Tech Debt

- A GitHub PAT was exposed in a prior conversation; user must revoke it (documented in SECURITY.md)
- `my-nexis-app/` and `REPORT.md` at repo root are stale artifacts from an older scaffold using the obsolete `@nexis/*` scope

## Team / Ownership

- All areas: MohammedAydan
