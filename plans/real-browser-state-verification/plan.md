# Plan: Real-Browser State Verification & Framework Fixes

## Goal

Prove that every state primitive documented in `STATE_TYPES.md` (local/shared/route/layout/global stores, signals, computeds, resources, context, batch, effects, resumability) works end-to-end in a **genuine real-browser** (Playwright Chromium) run of a freshly scaffolded project, and fix any framework bugs found _directly in the framework_ (not workarounds in the app).

## Acceptance Criteria (testable, not vague)

1.  **Fresh scaffold is green:** `pnpm dlx create-nexil@0.2.1 test-verify --yes --ts` produces a project whose `package.json` contains `"@nexil/core": "^0.2.1"` (not `"nexil"`), whose `pnpm install && pnpm build` succeeds, and whose `pnpm dev` serves.
2.  **Local signals:** `tests/e2e/state-verification.spec.ts` proves `state(0)` and `useState(0)` increment/decrement/reset in browser on first `onClick$` (chunk loads, scope materializes, value persists).
3.  **Computed & Resource:** Computed derived from local signal updates without manual effect; `resource` shows `loading → value` transition in browser.
4.  **Store scopes:** `local`, `shared` (via `createStateRegistry`), `route` (`registry.getOrCreate('route', ...)`), `global` (survives `Link` navigation, resets on full reload) — all verified via `lens`, `select`, `snapshot`, `setPath` in browser.
5.  **Proxy direct access:** `store.count++` and `store.items.push(...)` (array proxy) mutate and render via `data-nx-store-bind` without manual `set`.
6.  **Context:** `createContext` with `Provider`/`use` and `runWithScope` per-request isolation — no cross-request leak in parallel browser contexts.
7.  **Batch & Effects:** `batch` coalesces, `effect`/`watch`/`untrack`/`createRoot`/`onCleanup` importable from `@nexil/core` and dispose correctly.
8.  **Resumability payload:** Multiple `onClick$` handlers closing over same `state` share one live `ScopeSignal`; non-literal `state(load())` degrades to `unsupported` diagnostic, not crash.
9.  **All existing gates stay green:** `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test` (319+), `pnpm test:e2e` (existing 13+ plus new spec), `pnpm format:check`.
10. **Framework fixes land where the bug lives:** No app-level workarounds for framework shortcomings (e.g., if `store.select` requires `()` in JSX, fix the JSX transform or provide `bindText$` helper, not just docs).

## Approach

- **Scaffold probe:** Re-run `create-nexil` with `--yes --ts` into a temp dir (like `scaffold-smoke.test.ts` does) and assert the generated `package.json` uses `@nexil/core@^0.2.1` (regression for `test-f-123` bug where `"nexil": "^0.1.0"` was emitted). Fix is in `packages/create-nexil/src/starter/**` + `packages/cli/src/starter/**` (already bumped to `0.2.1`, but verify name is `@nexil/core` not `nexil`).
- **Fixture app:** Create `tests/e2e/fixtures/state-verification/` — a minimal Nexil app (routes: `/`, `/about`, `/items/[id]`, `_layout`) that declaratively exercises every state primitive. Each route is a pure function of its state, with `data-testid` hooks for Playwright. Build it once in `playwright.config.ts:webServer` (like `basic-app`/`landing-page`).
- **Playwright spec:** `tests/e2e/state-verification.spec.ts` — one `describe` per state type, each test does: `goto('/route')` → assert initial HTML (0 JS) → `click('[data-testid=inc]')` → assert DOM update → `click` again → assert persistence → `reload` or `click('a[href="/about"]')` → assert scope lifetime (global persists, route resets). Use `expect` + `page.waitForFunction` for `data-nx-store-bind` effects. No mocked browser — real Chromium via `playwright.config.ts`.
- **Framework fixes (as they appear):**
  - If `getCart().select(s => s.total)` renders `[object Object]` instead of number, fix is to make `select` auto-unwrapped in JSX or improve `state-scope.spec.ts` docs + provide `bindText$` example. Prefer framework fix where the bug is: e.g., if `store.select` signal is not materialized in `data-nx-scope`, fix `vite-plugin` scope capture.
  - If `store.count` rendered as `{counter}` without `()` shows stale, check `client/index.ts:materializeScope` and `vite-plugin` transform for direct signal reads in JSX.
  - If `onClick` without `$` is used in scaffold, the linter should warn; fix is to generate `onClick$` in starters.
  - Sharp/Deno-style import-time errors (already fixed `og-image.ts` lazy import) — verify no new ones.
- **Verification:** Run `pnpm test:e2e --grep="state-verification"` locally with `HEADLESS=false` for visual confirmation, then `pnpm check` full gate. Keep `workers: 1` to avoid symlink races (existing config).

## Scope

**IN:**

- Fresh scaffold validation + `state-verification` fixture + spec + any framework bug fixes in `packages/nexil/src/core/*`, `packages/nexil/src/client/*`, `packages/vite-plugin/src/*`, `packages/cli/src/*`
- Updates to `STATE_TYPES.md` if a pattern is proven wrong in real browser
- `test-f-123/src/routes/index.tsx` as a reference bad-example to fix (document correct vs incorrect)

**OUT:**

- Publishing / version bumps beyond `0.2.1` (already done in `d7d580a`)
- New store types outside `StateScope` union
- Rewriting snapshot strategy or selector GC

## Dependencies

- Playwright Chromium (already in `quality.yml` via `pnpm exec playwright install --with-deps chromium`)
- Existing `tests/e2e/serve.mjs` fixture server (reuse, don't duplicate)

## Estimated Complexity

L — comprehensive browser matrix + potential compiler/client fixes; but surgical — most state code already exists, we are proving and hardening it.

## Risks

- Vite-plugin scope capture for `store.lens` / `store.select` may need new `ScopeRefKind` handling (like `store` already has) — mitigated by expanding `STATE_TYPES.md` pending map.
- `test-f-123` shows developers will write `store.select(...)` without `()` — framework should either auto-unwrap in JSX text nodes or the error must be obvious. We will choose the least surprising fix after browser proof.
