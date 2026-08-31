# Context: defineStore-audit

## Files to read

- `packages/nexil/src/core/state.ts` — defineStore/createStore, StoreInstance, PublicAction, createProxiedStore, HMR, ALS
- `packages/nexil/src/core/reactivity.ts` — signal/computed/batch
- `packages/vite-plugin/src/stores.ts` — discoverStores, virtual barrel, DTS
- `packages/vite-plugin/src/index.ts` — evaluateStaticLiteral, buildImportHeader, classifyScopeCaptures, chunk store init
- `packages/nexil/src/client/index.ts` — hydrateNexilStoresFromDocument, getStorePathSignal
- `packages/cli/src/index.ts` — scaffoldStore
- `test-f-123/src/stores/cart.ts` — example unified store
- `test-f-123/src/routes/test.tsx` + `stores.tsx` + `checkout.tsx` — usage
- `tests/e2e/stores-*.spec.ts` — expected behavior

## Key Decisions to verify

- Secure pattern = isSerializable + ALS isolation + Zero-Hydration + fine-grained proxy + batch
- Types rely on TypeScript inference (no any in public overloads)

## Open Questions

- هل `cart:doubled` hard-coded في الـ runtime سيُعمم لاحقاً؟ (مؤجل حسب review.md)
- هل HMR shallow merge كافٍ للـ flow الحالي؟
