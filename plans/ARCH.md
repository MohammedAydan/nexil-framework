# System Architecture

## Overview

Monorepo producing 19 scoped packages. Examples consume workspace deps locally; external consumers consume published versions from GitHub Packages via the `create-nexis` CLI.

## Architecture Pattern

pnpm workspace monorepo, package-per-directory, TypeScript compiled per-package (`tsc -p`), root `tsc -b` project references for typecheck. Vite-based dev/build tooling in `@nexil/cli`.

## Core Components

| Component                          | Responsibility                           | Location                |
| ---------------------------------- | ---------------------------------------- | ----------------------- |
| core                               | JSX runtime source, HTML primitives      | `packages/core`         |
| compiler                           | Nexil transform, budget checks           | `packages/compiler`     |
| vite-plugin                        | Vite integration, `transformNexilSource` | `packages/vite-plugin`  |
| cli (`nexis` bin)                  | dev/build/start/check/analyze/routes     | `packages/cli`          |
| create-nexis (`create-nexis` bin)  | Project scaffolder (public entry point)  | `packages/create-nexis` |
| media                              | Image/font pipeline (sharp)              | `packages/media`        |
| server/actions/adapters/dev-server | HTTP layer                               | `packages/*`            |

## Dependency Graph (internal, verified from package.json)

```
Tier 0 (no internal deps): adapters, compiler, core, css, media, reactivity, router, seo
Tier 1: client(→core) jsx-runtime(→core) renderer(→core) server(→core)
        state(→core,reactivity) vite-plugin(→compiler)
Tier 2: actions(→server) dev-server(→adapters) cli(→compiler,vite-plugin)
Tier 3: create-nexis (standalone bin)
```

## Data Flow

User runs `pnpm dlx @nexil/create-nexis my-app --yes --ts` → scaffold writes package.json depending on published versions (^0.1.x) → user installs from GitHub Packages → `nexis dev/build` drives Vite + compiler.

## Boundaries & Invariants

- Generated apps must never contain `workspace:*` or local filesystem paths.
- Scaffold detects monorepo context ONLY when run inside the framework checkout (pnpm-workspace.yaml + packages/cli + packages/core present); otherwise publishes-version mode.
- Private/internal packages must never be published.

## Security Model

- Auth: GitHub PAT via user-level `.npmrc` or `${GITHUB_TOKEN}`/`${NODE_AUTH_TOKEN}` env substitution; never committed.
- CI: `GITHUB_TOKEN` with `contents: read`, `packages: write`.
