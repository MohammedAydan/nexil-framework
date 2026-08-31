# Context: real-browser-state-verification

## Files to create / modify

- `tests/e2e/fixtures/state-verification/` — new minimal Nexil app (src/routes/*, vite.config.ts, package.json)
- `tests/e2e/state-verification.spec.ts` — new Playwright spec (real-browser, not mocked)
- `packages/create-nexil/src/starter/*` — verify already @0.2.1, fix name `nexil`→`@nexil/core` if found
- `packages/nexil/src/core/*` — potential fixes: state.ts proxy, reactivity.ts, client/index.ts materializeScope, og-image.ts lazy
- `packages/vite-plugin/src/*` — potential fixes: scope capture for store.lens/select, data-nx-store-bind emission
- `packages/cli/src/*` — potential fixes: dev-server injection
- `STATE_TYPES.md` — update if patterns wrong
- `playwright.config.ts` — add webServer for new fixture if needed (or reuse existing serve.mjs)

## New deps

None — Playwright already in devDeps, Chromium installed via quality.yml

## Env vars needed

None

## Open questions

- Should `store.select(s => s.count)` auto-unwrap in JSX `{...}` without `()`? Currently requires `()` or `bindText$`. Browser proof will decide if framework should auto-unwrap.
- `test-f-123/src/routes/index.tsx:21-24` shows 3 anti-patterns (select without (), counter without (), onClick without $) — fix via framework better DX or via docs/linter?
- `test-f-123` was scaffolded with old `nexil@^0.2.1` — confirm new `d7d580a` scaffold now emits `@nexil/core@^0.2.1` (see `templates/template-fullstack/package.json:13`)

## References

- Bad example: `D:\Projects\Test\test-nexis-framwork\test-f-123\src\routes\index.tsx:1-29`
- State guide: `STATE_TYPES.md` (just rewritten for 0.2.1)
- Existing e2e: `tests/e2e/state-scope.spec.ts:1`, `stores-smoke.spec.ts`, `stores-level2.spec.ts`
- Playwright config: `playwright.config.ts:24` basic-app/landing-page build + showcase dev

## Current state

- `test-f-123` demonstrates incorrect usage that a developer would naturally write after reading old docs
- `pnpm build` currently green at 0.2.1 after `cd47d18` (format fix)
- `quality` `33318593551` success, `publish-npmjs` `33318593540` success
