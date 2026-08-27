# 15 — مرجع API المختصر

هذا الملف خريطة سريعة للواجهات العامة. المرجع النهائي والدقيق هو ملفات `src/index.ts` وملفات `.d.ts` الناتجة من الإصدار المثبت.

## Core

توفر `@mohammedaydan/core` أنواع RenderNode وElementNode وChild، وواجهات التأليف `For` و`Show` و`createContext` و`ErrorBoundary` و`Suspense` و`Form` و`SubmitButton`، إضافة إلى إعادة تصدير أدوات reactivity.

## Renderer

| API                             | الاستخدام             |
| ------------------------------- | --------------------- |
| `escapeHtml(value)`             | Escape نص HTML        |
| `renderElementOpening(node)`    | إخراج opening tag     |
| `renderElementClosing(node)`    | إخراج closing tag     |
| `renderChild(child)`            | رندر متزامن           |
| `renderChildAsync(child)`       | رندر Promise/async    |
| `renderToString(root)`          | HTML كامل متزامن      |
| `renderToStringAsync(root)`     | HTML كامل async       |
| `renderRoute(input)`            | رندر route حسب mode   |
| `renderToStream(root, options)` | ReadableStream تدريجي |

## Router

| API                              | الاستخدام                       |
| -------------------------------- | ------------------------------- |
| `routeFromFile(file)`            | تحويل اسم الملف إلى RouteRecord |
| `matchRoute(route, pathname)`    | مطابقة URL واستخراج params      |
| `resolveRoute(routes, pathname)` | اختيار route من مجموعة          |
| `Link(props)`                    | رابط داخلي typed مع prefetch    |
| `parseUrlParts(url)`             | تحليل pathname وquery وhash     |

## Reactivity

| API                               | الاستخدام                        |
| --------------------------------- | -------------------------------- |
| `state(initial)` / signal factory | قيمة قابلة للتحديث               |
| `computed(fn)`                    | قيمة مشتقة ومخزنة مؤقتًا         |
| `effect(fn)`                      | أثر جانبي مع tracking            |
| `batch(fn)`                       | تجميع تحديثات                    |
| `createRoot(fn)`                  | owner وcleanup                   |
| `onCleanup(fn)`                   | تسجيل cleanup                    |
| `resource(loader, options)`       | loading/value/error وrefetch آمن |
| `SignalOptions.equals`            | comparator لتحديد equality       |
| `dispose()`                       | إيقاف owner/resource             |

## State

| API                           | الاستخدام                     |
| ----------------------------- | ----------------------------- |
| `createStore(initial)`        | Store serializable            |
| `store.get()`                 | قراءة current value           |
| `store.set(update)`           | تحديث immutable أو functional |
| `store.select(selector)`      | Computed selector             |
| `store.dispose()`             | تحرير signal وselectors       |
| `createStateRegistry()`       | تسجيل Stores حسب scope        |
| `setPath(store, path, value)` | تحديث nested path immutable   |
| `lens(store, path)`           | writable focused signal       |

## SEO

| API                                      | الاستخدام                     |
| ---------------------------------------- | ----------------------------- |
| `normalizeSeo(metadata)`                 | validation وتوحيد metadata    |
| `renderHead(metadata)`                   | title/meta/OG/Twitter/JSON-LD |
| `buildSitemap(entries)`                  | XML sitemap                   |
| `buildRobots(sitemapUrl, disallow)`      | robots.txt                    |
| `deriveCanonical(origin, pathname)`      | canonical آمن                 |
| `withCanonical(metadata, ...)`           | إضافة canonical               |
| `generateFeed(items, options)`           | RSS 2.0                       |
| `generateAtomFeed(items, options)`       | Atom                          |
| `deriveBreadcrumbList(pathname, origin)` | Breadcrumb JSON-LD            |
| `validateJsonLd(value)`                  | فحص JSON-LD                   |

## Server

| API                                     | الاستخدام                          |
| --------------------------------------- | ---------------------------------- |
| `createServer(root, options)`           | Node production server             |
| `createMiddleware(root, options)`       | middleware قابل للدمج              |
| `composeMiddleware(...handlers)`        | تركيب middleware بالترتيب          |
| `createSecurityHeaders(options?)`       | middleware لرؤوس حماية Node opt-in |
| `serializeCookie(name, value, options)` | Set-Cookie آمن                     |
| `createDataContext(request)`            | request-scoped context             |
| `defineLoader(loader)`                  | typed route loader                 |
| `parseCookies(requestOrHeader)`         | فك cookies بأمان                   |
| `getCookie(request, name)`              | قراءة cookie واحدة                 |
| `notFound(message?)`                    | Response بحالة 404                 |

## Actions

راجع `@mohammedaydan/actions` لتعريف Action handlers، validation، origin policy، idempotency، typed envelopes، وparsing JSON/form/multipart.

يدعم `ProductionServerOptions` الخيارين `securityHeaders?: SecurityHeadersOptions`
و`trustProxy?: boolean`. تشمل `SecurityHeadersOptions` مراجع مخصصة لـ
`frameOptions` و`referrerPolicy` و`permissionsPolicy`، إضافة إلى
`contentSecurityPolicy` و`strictTransportSecurity` كخيارات opt-in. لا تفعّل
`trustProxy` إلا عندما ينظف proxy مضبوط headers، ولا ترسل HSTS إلا إذا كانت حدود TLS
معلومة.

## Vite plugin

| API                                          | الاستخدام                                                                                      |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `nexis(options)`                             | Vite plugin                                                                                    |
| `transformNexisSource(source, id, options?)` | تحليل source؛ وخيار `scopeSerialization: 'external'` ينتج مفاتيح ScopeRef معتمة وحمولات خارجية |
| `externalizeScopeAttributes(html, id)`       | استبدال ScopeRef المضمنة في HTML بمفاتيح معتمة وإرجاع الحمولات الخارجية                        |
| `classifyScopeCaptures(...)`                 | تصنيف value/signal/store/action/unsupported                                                    |
| `RESUMABILITY_BOOTSTRAP`                     | bootstrap الأساسي                                                                              |
| `RESUMABILITY_BOOTSTRAP_EXTERNAL`            | runtime production لحل مفاتيح ScopeRef من `nexis-state.js`                                     |
| `RESUMABILITY_FORMS`                         | runtime للنماذج التدريجية                                                                      |
| `enhanceForms(options)`                      | تحسين Form مع native fallback                                                                  |
| `bindSignalToDOM(scopeId, node, target)`     | ربط Signal بهدف DOM                                                                            |

## Media

`buildImageVariants` يبني WebP/AVIF ويعيد metadata عن bytes وcache hit. `pictureMarkup` يبني markup responsive. `cacheDir` يفعّل cache persistent اختياري.

## Starter Engine

تصدّر `@mohammedaydan/starter` القيم `STARTER_TEMPLATES` و`resolveStarterOptions` و`createStarterFiles(options)`. واجهة الجذر portable وتعيد سجلات typed من الشكل `{ path, content }` فقط. ويصدّر `@mohammedaydan/starter/node` كذلك `parseScaffoldArgs()` و`scaffoldProject()` لاستخدام CLI الذي يكتب فعليًا على نظام الملفات.

## Telemetry

| API                              | الاستخدام                          |
| -------------------------------- | ---------------------------------- |
| `createTelemetry(options)`       | عميل events اختياري                |
| `observeWebVitals(options)`      | observers لـ LCP/CLS/INP           |
| `renderTelemetryScript(options)` | script أو empty string عند التعطيل |
| `telemetryEventSchema`           | شكل الأحداث                        |

## Edge

`createDenoHandler` و`createDenoAdapterHandler` و`serveDeno` لـ Deno. `createCloudflareHandler` و`createCloudflareAdapterHandler` و`withCloudflareContext` لـ Cloudflare. كلاهما يعتمد Fetch-native contracts ويحتاج fallback أو assets حسب التصميم.

## CLI

CLI يكتشف routes، يركّب `_layout.*` بشكل متداخل، يقرأ config، يبني HTML وassets والـ lazy chunks والـ runtimes، يولد feeds وsitemap وrobots وredirect manifest وOG cards، ويكتب manifest. في v1.2.0 يدعم `create` القوالب `minimal` و`interactive` و`secure-node`، وتُصدر `nexis doctor --json` تقرير `DoctorReport` مُرقمًا. تصدّر الحزمة كذلك `diagnoseProject(root): Promise<DoctorReport>`. التقرير وسيلة مراجعة محلية وليس إثباتًا لسلامة proxy أو TLS أو CSP في البنية التحتية. استخدم CLI عبر scripts بدل استدعاء helpers الداخلية من التطبيق دون سبب.
