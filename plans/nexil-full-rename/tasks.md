# Tasks: Nexil Full Rename

[x] T0 — Audit & scaffolding
[x] grep `nexil` across repo, record in context.md
[x] create plans/nexil-full-rename/{plan,tasks,context}.md
[x] run `git status` baseline

[x] T1 — CLI bin alias
[x] packages/cli/package.json bin: `"nexil": "dist/bin.js"` + keep `"nexil"`
[x] packages/cli/src/bin.ts or entry: handle both names (invokedAs)
[x] verify `pnpm --filter @nexil/cli build` emits both bins

[x] T2 — Initializer package rename
[x] copy packages/create-nexil → packages/create-nexil (git mv or copy)
[x] update packages/create-nexil/package.json name `@nexil/create-nexil`, bins `create-nexil` + `create-nexil` alias, description, repository.directory
[x] keep packages/create-nexil as compat wrapper OR mark private with re-export
[x] update pnpm-workspace & tsconfig project references
[x] update .github/workflows/publish-packages.yml smoke check

[x] T3 — Starter template (source of truth for generated apps)
[x] packages/starter/src/index.ts: SHELL_HTML outlets `<!--nexil-*-outlet-->`, BASE_CSS comment, package.json scripts `nexil dev/build/start`, `nexil` key → `nexil`, `.npmrc` kept, `nexil.config.*` filename
[x] packages/starter/src/node.ts: scaffold writes `nexil.config.*` + compat `nexil.config.*`? decide dual
[x] update starter tests

[x] T4 — CLI build pipeline
[x] packages/cli/src/index.ts: BOOTSTRAP_FILE, CHUNK_DIRECTORY, MANIFEST, STATE_FILE, template injection, config file discovery (`nexil.config.*` primary, fallback `nexil.config.*`), asset names
[x] packages/vite-plugin/src/*: bootstrap/binding/form globals `__nexil*`, chunk base `nexil-chunks/`
[x] packages/router/src/navigation.ts: header `X-Nexil-Navigation` already, globals `__nexil*`
[x] packages/serve, dev-server: env `NEXIL_*` primary + `NEXIL_*` fallback

[x] T5 — Example directory renames
[x] git mv examples/nexil-showcase → examples/nexil-showcase
[x] git mv examples/nexil-workbench → examples/nexil-workbench (if exists)
[x] update all references in docs, benchmarks, package.json filters

[x] T6 — Repository URLs
[x] all packages/*/package.json repository.url `nexil-framework` → `nexil-framework`
[x] root README, docs links

[x] T7 — Docs & README bulk
[x] README.md: `my-nexil-app` → `my-nexil-app`, `nexil dev/build/start` → `nexil ...`, `nexil.config` → `nexil.config`, `nexil-*.js` → `nexil-*.js`, outlet markers, env vars
[x] docs/en/**, docs/ar/** same
[x] docs/architecture, plans/ARCH.md, TECH_STACK.md, DECISIONS.md

[x] T8 — Verify
[x] pnpm install (if workspace changed)
[x] pnpm build 34/34
[x] pnpm test
[x] pnpm test:e2e (link-navigation + full)
[x] pnpm exec prettier --write .
[x] git status + commit

[x] T9 — Close
[x] write review.md
[ ] update SESSION_LOG.md, context.md
