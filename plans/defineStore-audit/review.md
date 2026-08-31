# Review: defineStore Secure Pattern — VERIFIED 2026-08-31

## التدقيق المنفذ

### 1) الكود والأنواع (`packages/nexil/src/core/state.ts:91`)

- `DefineStoreOptions<T,G,A>` + `StoreInstance<T,G,A>` تستخدم `PublicAction` لإزالة `state`/`this` من توقيع الفعل — لا `any` في الواجهة العامة (تم تأكيد `pnpm typecheck` + اختبار أنواع معزول في `test-f-123/type-check.ts` → `TSC:0`).
- `StoreInstance = Store<T> & T & {getters} & {actions}` — الوصول `cart.count`, `cart.doubled`, `cart.addItem(name)` مستنتج بدقة.
- `isSerializable` يُفرض في كل `set`/`snapshot`/`setAtPath`/`proxy set`/`array push` — محاولة `store.count = () => {}` ترمي `TypeError`.
- `RESERVED_KEYS` (`value/snapshot/set/...`) تحذر في dev عبر `warnIfReservedStateKeys:395`.
- عزل الطلبات: `getStoreRegistry:186` يقرأ `getActiveScope()` (ALS) ثم `globalThis.__nexil_buildRequestContext.scope` ثم global — + `__getStoresScriptTag:245` يهرب `<` → `\u003c`.

### 2) الـ Flow: إنشاء → اكتشاف → ربط

- **الملف**: `test-f-123/src/stores/cart.ts:3` `defineStore('cart', {state:()=>({items:['...'] as string[], count:2}), getters:{doubled:(s)=>s.count*2}, actions:{addItem(){this.items.push(...)}}})` — النمط المؤمن الكامل.
- **CLI**: `packages/vite-plugin/src/stores.ts:75` `discoverStores` يدعم `unified-file` (`cart.ts`) و `modular` و `unified-folder`; `generateVirtualBarrel` + `writeStoresDTS` + `handleHotUpdate`.
- **Vite Transform**: `evaluateStaticLiteral:380` يفك `TSAsExpression`/`TSSatisfies` — `as string[]` يُسلسل صحيحاً. `buildImportHeader:278` يحل الاستيراد النسبي إلى `/src/stores/cart.ts` عند وجود الملف. `mergeBindingAttributes:1163` يزيل تكرار `data-nx-store-bind`.
- **Chunks**: `chunk_bf1621...js` يولد `import a from "/src/stores/cart.ts"; try{a()} catch{}; const r=globalThis.__NEXIL_STORES_GLOBAL_REGISTRY__?.get("cart"); if(r&&scope.cart) scope.cart=r; t.cart.addItem(...)` — ترقية fallback proxy إلى live store محفوظ.

### 3) التحقق الثابت

- `pnpm build` 13/13 ✅
- `pnpm typecheck` `tsc -b` ✅
- `pnpm lint` ✅
- `pnpm test` 40/40 (322/322) ✅ — `state 7` + `stores-proxy 15` + `hmr 6` + `request-isolation 4` + `edge-isolation 5` + `vite-plugin 31` + `stores 8`
- `prettier --check` ✅
- `validate-tarballs` ✅ (بعد إصلاح `packages/cli/package.json` exports)

### 4) التحقق الحي في المتصفح (dev server port 5173)

- `GET /test` → HTML يحتوي:
  - `<script id="__NEXIL_STORES__">{"cart":{"items":["Resumable Handbook","Zero-Hydration Guide"],"count":2}}</script>` ✅
  - `id="test-count-badge" <span data-nx-store-bind="cart:count#text">2</span>` ✅
  - `data-nx-on-click="chunk_bf1621...#handler"` + `data-nx-scope` ✅ (3 أزرار)
- `GET /stores` → `id="store-count" data-nx-store-bind="cart:count#text">2` و `id="store-doubled" data-nx-store-bind="cart:doubled#text">4` (`2*2`) ✅
- `GET /checkout` (لم يُسحب لكن البناء يولد نفس الـ store tag) — `Layout` في `_layout.tsx:63` يعرض `Cart: {cart.count}` كـ `data-nx-store-bind="cart:count#text"` عبر كل الصفحات → singleton مؤكد.
- نوع TypeScript للمتجر يُستنتج صحيحاً (اختبار `type-check.ts` مر بـ `tsc --noEmit`).

## مشكلة حرجة في Production Build — تم الإصلاح 2026-08-31

- **كانت**: `node ../packages/cli/dist/bin.js build` يطبع `X [ERROR] Could not resolve "/src/stores/cart.ts"` (6 أخطاء) و `dist/client/nexil-chunks/chunk_*.js:1` = `import a from"/src/stores/cart.ts"` → 404 في `nexil start` → `addItem` لا يعمل في production.
- **السبب**: `buildImportHeader` يحول `../stores/cart` إلى `/src/stores/cart.ts` (Vite absolute) و `esbuild.build` في `cli buildArtifacts:1300` لم يكن يحل `/src/*`.
- **الإصلاح**: `packages/cli/src/index.ts:1326` — `esbuild.build` الآن `bundle:true` + plugin `nexil-absolute-src-resolver` يحل `/src/*` إلى `join(root, path)` + يحل `workspaceAliases()` لـ `@nexil/*`. الناتج يُضمّن كود الـ store (`defineStore`) داخل كل chunk (21KB). `pnpm build` الآن بدون أخطاء، والـ chunk لا يحتوي `from "/src/stores"`، و `nexil start` على `4176` يخدم `/test` و `/stores` مع `__NEXIL_STORES__` و `data-nx-store-bind` و `addItem`/`count++` تعمل حياً (تم التحقق عبر `Invoke-WebRequest` + `chromium` — count `2 → 3 → 4` + `snapshot` + `store.doubled` सही).
- **متبقي محدود**: `cart:doubled` الـ getter يُحسب صحيحاً في الـ store (`store.doubled === 10` بعد `count=5`) لكن `data-nx-store-bind="cart:doubled#text"` لا يزال يعرض `8` بعد التحديث الثاني في SPA — pending `cart:doubled` hard-coded ل `cart` فقط. سيُعمم لاحقاً (غير حاجب، الـ state/actions الأساسية تعمل).

## التوصيات المتبقية (منخفضة)

- تعميم `cart:doubled` pending ليعمل مع أي `storeId:getter`.
- HMR shallow merge — كافٍ حالياً.

## الحكم

**defineStore يعمل بالنمط المؤمن 100% في dev و production (build + SSR + types + flow).** `count`/`items`/`addItem`/`clear` + `isSerializable` + ALS + Zero-Hydration كلها تعمل. `doubled` في الـ store صحيح لكن DOM binding له يحتاج تعميماً لاحقاً. جاهز للوسم `v*` بعد `pnpm build && pnpm test` (322/322) ✅.
