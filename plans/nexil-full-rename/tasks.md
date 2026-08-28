# Tasks: Nexil Full Rename

[ ] T0 — Audit & scaffolding
[ ] grep `nexis` across repo, record in context.md
[ ] create plans/nexil-full-rename/{plan,tasks,context}.md
[ ] run `git status` baseline

[ ] T1 — CLI bin alias
[ ] packages/cli/package.json bin: `"nexil": "dist/bin.js"` + keep `"nexis"`
[ ] packages/cli/src/bin.ts or entry: handle both names (invokedAs)
[ ] verify `pnpm --filter @nexil/cli build` emits both bins

[ ] T2 — Initializer package rename
[ ] copy packages/create-nexis → packages/create-nexil (git mv or copy)
[ ] update packages/create-nexil/package.json name `@nexil/create-nexil`, bins `create-nexil` + `create-nexis` alias, description, repository.directory
[ ] keep packages/create-nexis as compat wrapper OR mark private with re-export
[ ] update pnpm-workspace & tsconfig project references
[ ] update .github/workflows/publish-packages.yml smoke check

[ ] T3 — Starter template (source of truth for generated apps)
[ ] packages/starter/src/index.ts: SHELL_HTML outlets `<!--nexil-*-outlet-->`, BASE_CSS comment, package.json scripts `nexil dev/build/start`, `nexis` key → `nexil`, `.npmrc` kept, `nexil.config.*` filename
[ ] packages/starter/src/node.ts: scaffold writes `nexil.config.*` + compat `nexis.config.*`? decide dual
[ ] update starter tests

[ ] T4 — CLI build pipeline
[ ] packages/cli/src/index.ts: BOOTSTRAP_FILE, CHUNK_DIRECTORY, MANIFEST, STATE_FILE, template injection, config file discovery (`nexil.config.*` primary, fallback `nexis.config.*`), asset names
[ ] packages/vite-plugin/src/*: bootstrap/binding/form globals `__nexil*`, chunk base `nexil-chunks/`
[ ] packages/router/src/navigation.ts: header `X-Nexil-Navigation` already, globals `__nexil*`
[ ] packages/serve, dev-server: env `NEXIL_*` primary + `NEXIS_*` fallback

[ ] T5 — Example directory renames
[ ] git mv examples/nexis-showcase → examples/nexil-showcase
[ ] git mv examples/nexis-workbench → examples/nexil-workbench (if exists)
[ ] update all references in docs, benchmarks, package.json filters

[ ] T6 — Repository URLs
[ ] all packages/*/package.json repository.url `nexis-framework` → `nexil-framework`
[ ] root README, docs links

[ ] T7 — Docs & README bulk
[ ] README.md: `my-nexis-app` → `my-nexil-app`, `nexis dev/build/start` → `nexil ...`, `nexis.config` → `nexil.config`, `nexis-*.js` → `nexil-*.js`, outlet markers, env vars
[ ] docs/en/**, docs/ar/** same
[ ] docs/architecture, plans/ARCH.md, TECH_STACK.md, DECISIONS.md

[ ] T8 — Verify
[ ] pnpm install (if workspace changed)
[ ] pnpm build 34/34
[ ] pnpm test
[ ] pnpm test:e2e (link-navigation + full)
[ ] pnpm exec prettier --write .
[ ] git status + commit

[ ] T9 — Close
[ ] write review.md
[ ] update SESSION_LOG.md, context.md
