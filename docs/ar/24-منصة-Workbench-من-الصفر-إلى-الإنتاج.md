# 24 — بناء Nexil Workbench: من مجلد فارغ إلى Production

هذا فصل عملي كامل لتطبيق يعمل بـ Nexil `1.3.1`. اسم التطبيق **Nexil Workbench**، وهو قاعدة معرفة عامة فيها مقالات ثابتة، وفلتر تفاعلي صغير، و`Link` دلالي، وطلب دعم native-first، وحدود جلسة وتفويض يملكها التطبيق، وبيانات وصفية للإنتاج، وبوابة إصدار قابلة للتحقق. هذا لا يعني أن Nexil يوفّر قاعدة بيانات أو directory مستخدمين أو OAuth أو خدمة بريد أو تخزين جلسات دائم؛ هذه قرارات يملكها التطبيق.

## ما الذي ستثبته

| المرحلة    | النتيجة المرئية قبل المتابعة                                              |
| ---------- | ------------------------------------------------------------------------- |
| المشروع    | يخدم `pnpm dev` تطبيق Nexil مولدًا.                                       |
| HTML shell | يظهر العنوان والتنقل والمحتوى قبل JavaScript.                             |
| التوجيه    | تخرج مسارات المقالات الثابتة، والمسار غير المعروف يرد 404 حقيقيًا.        |
| التنقل     | يمكن لـLink داخلي مؤهل استبدال `#app`، ويظل anchor صالحًا بلا JavaScript. |
| التفاعل    | يحمل الفلتر حدّه فقط ويغير هدفه وحده.                                     |
| التعديل    | طلب الدعم له validation وOrigin وauthorization وidempotency واضحة.        |
| الإنتاج    | تراجع metadata والأصول والاختبارات والbudget والتهيئة كـartifact واحد.    |

> **قاعدة:** لا تنتقل لأن الكود يبدو صحيحًا. شغّل فحص نهاية كل مرحلة وافحص HTML أو response الناتج الذي يذكره.

## 0. أنشئ المشروع بأمان

هيئ صلاحية نطاق `@nexil` في بيئة المستخدم أو CI. لا تضع registry token في المستودع أو في `.npmrc` المتتبع. أنشئ المشروع بالإصدار الحالي وثبّت lockfile الناتج من تثبيتك أنت.

```bash
pnpm dlx @nexil/create-nexil@1.0.0 nexil-workbench --yes --ts --template interactive
cd nexil-workbench
pnpm install
pnpm dev
```

ينشئ Starter HTML shell فيه `#app` و`<!--nexil-app-outlet-->`، وroutes وCSS وscripts لـ`dev` و`build` و`start` و`typecheck` و`check` و`analyze`. راجع `package.json` قبل إضافة dependencies. الحزم المولدة ليست مكانًا لوضع credentials.

```bash
pnpm typecheck
pnpm check
```

النتيجة المتوقعة: ينجح TypeScript وتظهر نتيجة passing من `nexil check --budget`. أصلح scaffold قبل إضافة كود التطبيق إن فشل أحدهما.

## 1. ارندر الوثيقة أولًا

أنشئ layout فيه تنقل دلالي وmain landmark. يرندر layout على الخادم مع route الطفل؛ وليس root لتطبيق عميل.

```tsx
// src/routes/_layout.tsx
import { Link } from '@nexil/router'

export default function WorkbenchLayout({ children }: { readonly children: unknown }) {
  return (
    <>
      <a className="skip-link" href="#content">
        Skip to content
      </a>
      <header>
        <Link href="/">Workbench</Link>
        <nav aria-label="Primary navigation">
          <Link href="/articles/">Articles</Link>
          <Link href="/support/">Support</Link>
        </nav>
      </header>
      <main id="content">{children}</main>
      <footer>Built as useful HTML first.</footer>
    </>
  )
}
```

اكتب route رئيسي يمكن قراءته إذا لم تعمل scripts أبدًا.

```tsx
// src/routes/index.tsx
export const seo = {
  title: 'Nexil Workbench',
  description: 'A public knowledge base built with server-rendered HTML.',
}

export default function Home() {
  return (
    <section>
      <h1>Useful documentation before JavaScript.</h1>
      <p>Articles, route links, and support instructions belong in the first response.</p>
      <a href="/articles/">Read the articles</a>
    </section>
  )
}
```

استخدم **View Source** وليس Elements فقط: يجب أن يوجد `h1` والنصوص وlandmarks و`href` في الاستجابة الخام. يظل `<a>` صالحًا عمدًا قبل أي enhancement.

## 2. أضف article routes متوقعة

ضع metadata عامة للمقالات في module خادمي. يجعل تصدير static paths عملية build قادرة على إخراج صفحات المقالات المعروفة مقدمًا.

```ts
// src/lib/articles.ts
export const articles = [
  { slug: 'first-boundary', title: 'Find the first boundary', summary: 'Keep interaction narrow.' },
  { slug: 'release-check', title: 'Prove the release', summary: 'Treat output as evidence.' },
] as const

export function getArticle(slug: string) {
  return articles.find((article) => article.slug === slug)
}
```

```tsx
// src/routes/articles/[slug].tsx
import { notFound } from '@nexil/server'
import { getArticle, articles } from '../../lib/articles'

export async function getStaticPaths() {
  return articles.map((article) => ({ params: { slug: article.slug } }))
}

export default function Article({ slug }: { readonly slug?: string }) {
  const article = slug ? getArticle(slug) : undefined
  if (!article) return notFound('Article not found')
  return (
    <article>
      <h1>{article.title}</h1>
      <p>{article.summary}</p>
    </article>
  )
}
```

لا تجعل `slug` غير متحقق منه يختار مسار ملفات أو database query أو cache key أو redirect. ابنِ routes وافحص مجلدات المقالات الناتجة، ثم اطلب مقالًا غير معروف وتأكد من 404 لا صفحة فارغة ناجحة.

## 3. حسّن التنقل من دون استبدال anchors

استخدم `Link` فقط عندما يفيد الانتقال المباشر same-origin مع استبدال اختياري لـ`#app`. يخرج anchor عاديًا مع `data-nx-link`؛ ولا يصنع virtual router أو client component tree.

```tsx
import { Link } from '@nexil/router'

export function ArticleNavigation() {
  return (
    <nav aria-label="Article navigation">
      <Link href="/articles/first-boundary/" prefetch="intent">
        First boundary
      </Link>
      <Link href="/articles/release-check/" prefetch="viewport" transition={false}>
        Release check
      </Link>
      <a href="#comments">Jump to comments</a>
    </nav>
  )
}
```

تبقى hash-only وmodified click وmiddle click وexternal origin و`target` و`download` و`rel="external"` native. يتحول fetch الفاشل أو non-HTML أو outlet الغائب إلى document navigation. `prefetch` تلميح public محدود في الذاكرة؛ لا يحتفظ runtime برد `private` أو `no-store`.

شغّل المتصفح بلا JavaScript وتأكد أن الرابط يعمل. ثم مع JavaScript، ضع marker مؤقت في `window`، وانتقل عبر Link مؤهل، وتحقق من بقاء marker مع تغير title والمحتوى. ارجع إلى اختبارات Router لعقد bypass وhistory وcancellation وfallback الكامل.

## 4. أضف interaction صغيرة قابلة للاستئناف

استعمل Signal لحالة تحكم محلية. يرندر المحتوى الأساسي على الخادم، والنقرة وحدها هي enhancement.

```tsx
// src/components/ArticleFilter.tsx
import { state } from '@nexil/core'

export function ArticleFilter() {
  const active = state(false)
  return (
    <section aria-labelledby="filter-title">
      <h2 id="filter-title">Filter articles</h2>
      <button aria-pressed={active()} onClick$={() => active.set(!active())}>
        Toggle release-ready filter
      </button>
      <p bindHidden$={active}>Showing every article.</p>
      <p bindHidden$={() => !active()}>Showing release-ready articles.</p>
    </section>
  )
}
```

التقط فقط قيم JSON-literal أو Signals أو Stores أو Actions أو ScopeRef مدعومة عبر lazy boundary. DOM nodes وdatabase clients وsecrets وclass instances وقيم request الخاصة غير مدعومة. افحص HTML لعلامات scope المعتمة والشبكة: لا يجب أن يحمل event chunk قبل intent.

## 5. استخدم Context وStore بعمر صريح

Context يمنع prop drilling، وليس store عالميًا للمتصفح أو آلية async ambient context. استخدم ContextScope في عمل SSR/SSG الذي يمر عبر async boundary.

```tsx
import { createContext, createContextScope, provideContext, state } from '@nexil/core'
import { createStore } from '@nexil/state'

const Locale = createContext('en')
const requestScope = createContextScope()
const frenchScope = provideContext(requestScope, Locale, 'fr')
Locale.use(frenchScope) // "fr"

export function LocaleSection() {
  const locale = state('en')
  return Locale.Provider({
    value: locale,
    children: () => <button onClick$={() => locale.set('fr')}>{Locale.use()}</button>,
  })
}

export const visualPreference = createStore({ contrast: 'default' }, 'global')
```

Provider يحل children بصورة متزامنة. مرر `context.scope` أو child scope صريحًا إلى async مع `withContext` ولا تفترض أن Provider يبقى عبر `await`. يبقى Store `global` عبر Link ناجح داخل document واحد فقط؛ يعاد ضبطه عند reload ولا يحتوي secret أو session أو قرار authorization.

اكتب SSR renders منفصلين بقيم ContextScope مختلفة وتأكد أن أحدهما لا يرى الآخر. في المتصفح غيّر preference عالمية، تنقل عبر Link ثم أعد التحميل: قد تبقى في الأولى لكن يجب أن تعاد في الثانية.

## 6. أنشئ طلب دعم native-first

ابدأ بـform حقيقي. يمكن لـJavaScript تحسين feedback، لكن server validation وaccess control هما المصدر الموثوق.

```tsx
// src/routes/support/index.tsx
export default function Support() {
  return (
    <form action="/api/support" method="post">
      <label htmlFor="message">Describe the issue</label>
      <textarea id="message" name="message" minLength={20} required />
      <button type="submit">Send support request</button>
    </form>
  )
}
```

عرّف mutation عبر Action العام. persistence والqueue dependencies يملكهما التطبيق.

```ts
// src/server/support-action.ts
import {
  action,
  assertTrustedOrigin,
  createMemoryIdempotencyStore,
  handleActionRequest,
} from '@nexil/actions'

const idempotency = createMemoryIdempotencyStore()

const supportAction = action({
  endpoint: '/api/support',
  validate(input) {
    const message =
      typeof input === 'object' && input
        ? String((input as { message?: unknown }).message ?? '')
        : ''
    if (message.trim().length < 20)
      throw new Response('Message must contain at least 20 characters.', { status: 400 })
    return { message: message.trim() }
  },
  async authorize({ request }) {
    assertTrustedOrigin(request, ['https://workbench.example'])
    // Resolve application-owned session here before mutation.
  },
  async handle(_context, input) {
    await saveSupportRequest(input) // durable application-owned persistence
    return { accepted: true }
  },
})

export function postSupport(request: Request) {
  return handleActionRequest(request, supportAction, {
    allowedOrigins: ['https://workbench.example'],
    idempotency,
  })
}
```

`createMemoryIdempotencyStore()` يناسب التطوير أو process واحدًا فقط. يحتاج production متعدد instances إلى store دائم مشترك. اختبر form post عاديًا وinput سيئًا وOrigin خاطئًا وidempotency key مكررًا وطلبًا بلا access قبل توصيل queue أو database حقيقية.

## 7. أضف session وسياسة مورد يملكهما التطبيق

يمكن لـNexil قراءة session identifier معتم وتطبيق role أو resource rules، لكنه لا يتحقق من كلمات المرور ولا ينفذ OAuth/OIDC ولا يملك user table.

```ts
// src/server/session.ts
import { createSession, requireAccess, requirePermission, type SessionStore } from '@nexil/security'

interface WorkbenchUser {
  readonly id: string
  readonly tenantId: string
  readonly permissions: readonly string[]
}

const store: SessionStore<WorkbenchUser> = applicationSessionStore
export const sessions = createSession(store, { cookieName: 'workbench_session' })

export async function editArticle(request: Request, article: { readonly tenantId: string }) {
  const { principal } = await sessions.require(request)
  requirePermission(principal, 'article:write')
  await requireAccess(principal, article, (user, resource) => user.tenantId === resource.tenantId)
}
```

نفذ durable storage وexpiry وrevocation وaudit records داخل التطبيق. cookie هو identifier معتم فقط؛ لا تثق في role أو tenant أو ownership يرسله form أو المتصفح. اختبر الجلسة الغائبة والمنتهية والملغاة والصلاحية الخاطئة وtenant الخاطئ، وتأكد أن الطلب المرفوض لا يستدعي mutation.

## 8. أخرج metadata وmedia للاكتشاف

كل route عامة تحتاج metadata دقيقة. استخدم origin إنتاجي مطلقًا حقيقيًا؛ لا تجعل preview URL canonical.

```tsx
// src/routes/articles/index.tsx
export const seo = {
  title: 'Workbench articles',
  description: 'Public documentation for building and operating Nexil applications.',
  canonical: 'https://workbench.example/articles/',
}
```

استعمل route inventory العامة نفسها لـsitemap وrobots وRSS وAtom. للصور ذات المعنى، وفر dimensions وfallback وalt دقيقًا.

```tsx
<picture>
  <source srcSet="/images/workbench-960.avif" type="image/avif" />
  <source srcSet="/images/workbench-960.webp" type="image/webp" />
  <img src="/images/workbench-960.jpg" width="960" height="540" alt="Workbench article overview" />
</picture>
```

افحص `sitemap.xml` و`robots.txt` وfeeds وtitle وdescription وcanonical وOpen Graph بعد البناء. تحقق من URL protocols قبل قبول input، واجعل telemetry اختيارية ومحدودة البيانات.

## 9. ابنِ artifact الإنتاج وشغّله

اجعل التهيئة مراجعَة وصريحة. دورة Node production المعتادة:

```bash
pnpm typecheck
pnpm check
pnpm build
pnpm start
```

في Node استخدم `nexil start` المولد أو `@nexil/serve`. استعمل Deno أو Cloudflare adapter عندما يكون runtime Fetch-native هو هدف النشر الحقيقي. عرّف `siteOrigin` وredirects وcache وheaders وtrusted-proxy في config مراجع. فعّل trust للـproxy فقط عندما ينظف forwarded headers ويعيد بناءها بأمان.

| المجال     | فحص Production                                                                                      |
| ---------- | --------------------------------------------------------------------------------------------------- |
| HTML       | اجلب كل URL مهم وتحقق من title وheading وcanonical والتنقل بلا JavaScript.                          |
| Routes     | افحص static route وserver route إن وجدت و404 و`HEAD` وredirect ورفض method.                         |
| Link       | افحص direct swap وBack/Forward وhash وmodified-click bypass وcancellation وnative fallback.         |
| Forms      | افحص native/enhanced submit إن وجد وvalidation وOrigin وsession وauthorization وduplicate handling. |
| Assets     | تأكد من dimensions وvariants وfallback لكل صورة مهمة وافحص media cache limits.                      |
| Security   | شغّل dependency/secret scans وتحقق من headers وcookie flags عبر HTTPS حقيقي.                        |
| Operations | سجّل runtime وcommit وbuild command وbudgets وhealth check وlogs وrollback artifact وalert owner.   |

## الخطوة التالية

هذا الفصل طريق عبر الفريمورك وليس بديلًا عن API reference الدقيقة. اقرأ أدلة [إنشاء المشروع](./03-إنشاء-المشروع.md) و[التوجيه والرندر](./05-التوجيه-والرندر.md) و[التفاعلية](./06-التفاعلية-وScopeRef.md) و[الحالة وContext](./07-الحالة-والتفاعلية.md) و[Actions والنماذج](./08-الأفعال-والنماذج.md) و[SEO](./11-SEO-والبيانات-الوصفية.md) و[الخادم والنشر](./12-الخادم-والنشر.md) و[الاختبار](./13-الاختبار-والأداء.md) و[الأمان](./21-المصادقة-والتفويض-وmiddleware.md).

مثال Workbench التنفيذي واختباراته هما مصدر الحقيقة للأوامر هنا. إذا كانت integration مطلوبة وغير موجودة، أضفها كـapplication boundary واختبرها؛ لا تفترض أنها مشحونة تلقائيًا مع Nexil.
