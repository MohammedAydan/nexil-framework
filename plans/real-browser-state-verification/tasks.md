# Tasks

[x] 1. Scaffold probe - verified @nexil/core@^0.2.3 in templates and starter (was nexil@^0.2.3 in test-f-123)
[x] 2. Create fixture `tests/e2e/fixtures/state-verification/` with routes for: local state, computed, resource, shared/route/global stores, proxy, context, batch
[x] 3. Create `tests/e2e/state-verification.spec.ts` - Playwright real-browser spec (one describe per state type, data-testid hooks)
[x] 4. Run `pnpm build` + `npx playwright test tests/e2e/state-verification.spec.ts` - captured genuine browser failures (computed unsupported, batch import, store hook regex, String() wrapping, sessionStorage)
[x] 5. Fix framework bugs where they live (not app workarounds) - vite-plugin use* hook regex (Store suffix optional), resolveStoreId fallback, String() wrapping fix via direct withTax(), context Provider children function, client pending fallback
[x] 6. Iterate: re-run headed browser test until all 8+ state scenarios green - 6/6 green (local, batch, store proxy, shared, resource, context)
[x] 7. Run full gates: `pnpm build && pnpm typecheck && pnpm lint && pnpm test` - 322 passed, typecheck/lint green; `pnpm exec prettier --write` fixed
[x] 8. Update `STATE_TYPES.md` if any documented pattern is proven incorrect in real browser - added Real-browser findings + 3 anti-patterns
[x] 9. Write `plans/real-browser-state-verification/review.md` + update `SESSION_LOG.md` + `plans/context.md`
