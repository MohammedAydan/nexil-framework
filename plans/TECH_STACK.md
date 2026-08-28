# Tech Stack

## Runtime

| Layer           | Technology | Version                             | Notes                  |
| --------------- | ---------- | ----------------------------------- | ---------------------- |
| Language        | TypeScript | ^5.8.0                              | per-package tsc builds |
| Runtime         | Node.js    | >=22.0.0 (local: v25.9.0)           |                        |
| Package Manager | pnpm       | 10.15.0 (pinned via packageManager) |                        |

## Tooling

| Tool       | Version | Config File             |
| ---------- | ------- | ----------------------- |
| ESLint     | ^9.0.0  | `eslint.config.mjs`     |
| Prettier   | ^3.0.0  | `.prettierrc.json`      |
| Vitest     | ^3.0.0  | `vitest.config.ts`      |
| Playwright | ^1.62.1 | `playwright.config.ts`  |
| Vite       | ^7.3.6  | used by cli/vite-plugin |

## Key External Deps

| Package                        | Where Used                   |
| ------------------------------ | ---------------------------- |
| sharp ^0.35.3                  | media                        |
| @babel/parser, @babel/traverse | vite-plugin (+ root devDeps) |
| magic-string                   | vite-plugin (+ root devDeps) |
| vite ^7.3.6                    | cli, vite-plugin             |

## Key Conventions

- Scope: `@nexil/*`; registry `https://registry.npmjs.org/`
- Build: `tsc -p tsconfig.json` per package; root scripts use pnpm filters only (cross-platform)
- E2E build helpers live in `tests/e2e/*.mjs` and must use `fileURLToPath(import.meta.url)`
