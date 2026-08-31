# Plan: defineStore Secure Pattern Audit & End-to-End Flow Verification

## Goal

التأكد أن `defineStore` يعمل بالنمط المؤمن الصحيح 100%، يعتمد على TypeScript types، ويغطي الـ flow كاملاً من إنشاء ملف الـ store حتى ربطه بالصفحات وتنفيذ المنطق المخصص له، مع التحقق في المتصفح.

## Acceptance Criteria

- [ ] `defineStore(id, {state, getters, actions})` ينشئ متجراً متزامناً مع `isSerializable` وعزل الطلبات (ALS) و Zero-Hydration عبر `__NEXIL_STORES__`.
- [ ] TypeScript يستنتج `state` و `getters` و `actions` (this) بدقة — لا `any` في الواجهة العامة.
- [ ] إنشاء ملف `src/stores/<id>.ts` (unified) أو `store.ts` (split) يتم اكتشافه عبر `discoverStores` ويُصدّر عبر `$stores/<id>` و `virtual:nexil-stores`.
- [ ] ربط المتجر في صفحة (`const cart = useCartStore(); {String(cart.count)}` / `bindText$={cart.count}` / `onClick$={() => cart.addItem()}`) يولد `data-nx-store-bind` و `data-nx-scope` صحيحة.
- [ ] التحقق الثابت: `pnpm build` + `pnpm typecheck` + `pnpm lint` + `pnpm test` + `prettier --check` + `validate-tarballs` كلها خضراء.
- [ ] التحقق الحي: تشغيل `test-f-123` في المتصفح يثبت SSR + تفاعل + singleton عبر التنقل.

## Approach

1. قراءة `packages/nexil/src/core/state.ts` (types + runtime) و `packages/vite-plugin/src/index.ts` (ASTEvaluator, importHeader, chunk binding) و `packages/vite-plugin/src/stores.ts` و `packages/nexil/src/client/index.ts`.
2. تدقيق أنواع `StoreInstance` و `PublicAction` يدوياً + عبر `tsc -b` واختبار أنواع معزول.
3. تتبع flow الإنشاء: CLI `scaffoldStore` → ملف على القرص → `discoverStores` → aliases → transform → client hydration.
4. تشغيل كل الاختبارات وضبط التنسيق.
5. تشغيل خادم dev/preview والتحقق عبر Playwright / fetch للـ HTML وتفاعل الأزرار.

## Scope IN

- `defineStore` unified + `createStore` modular (للمقارنة)
- TypeScript types
- Vite discovery + chunk/store binding
- Client hydration + SSR ALS

## Scope OUT

- إعادة تصميم الـ store (لا تغيير واجهة)
- تغيير إصدارات الحزم

## Complexity: M
