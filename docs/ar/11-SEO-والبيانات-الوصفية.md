# 11 — SEO والبيانات الوصفية

## Head الأساسي

استخدم `renderHead` أو helpers الخاصة بـ SEO بدل كتابة tags عشوائيًا في كل Route. الحد الأدنى لكل صفحة هو title وdescription وcanonical مناسب.

```ts
const seo = {
  title: 'دليل Nexis',
  description: 'شرح عملي لبناء صفحات HTML أولًا.',
  canonical: 'https://example.com/docs/nexis',
  ogType: 'article',
  image: 'https://example.com/og/nexis.png',
}
```

لا تجعل canonical يشير إلى preview hostname إذا كان الموقع النهائي مختلفًا.

## Title وDescription والتوارث

اكتب title فريدًا وواضحًا، وdescription يشرح الصفحة فعلًا. لا تكرر description نفسها لكل routes الديناميكية. يمكن لـ`_layout.*` الأب أن يحدد `titleTemplate` و`openGraph.siteName`، ثم يرث route الابن هذه القيم ويغيّر الحقول التي تخصه فقط. إذا كانت الصفحة غير قابلة للفهرسة استخدم `noindex` بسبب مقصود واضح، وليس لإخفاء مشكلة محتوى.

```ts
export const seo = {
  title: 'Nexis App',
  titleTemplate: '%s · Nexis App',
  openGraph: { siteName: 'Nexis App' },
}
```

## Canonical

`deriveCanonical(origin, pathname)` يتحقق من أن origin صالح وأن pathname محلي. المسارات الديناميكية يجب أن تنتج canonical مختلفًا لكل قيمة حقيقية.

```ts
const canonical = deriveCanonical('https://example.com', '/docs/architecture')
```

لا تسمح بـ `javascript:` أو `data:` أو `vbscript:` في href أو image أو JSON metadata. فحص dangerous protocols جزء من gates.

## JSON-LD

ضع JSON-LD آمنًا عبر `renderHead` أو `validateJsonLd`. يجب أن يحتوي على `@context` و`@type` و`name`، وتحتاج الأنواع المحددة إلى حقول إضافية حسب validator.

```ts
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  name: 'عنوان المقال',
  headline: 'عنوان المقال',
  datePublished: '2026-01-01',
}
```

لا تبالغ في البيانات. يجب أن تطابق ما يظهر للمستخدم، وألا تنشئ Review أو FAQ مزيفًا لأغراض الترتيب.

## Breadcrumbs

`deriveBreadcrumbList('/docs/architecture', origin)` يبني BreadcrumbList من segments المحلية. استخدمه للصفحات المتداخلة، وتأكد أن الروابط الناتجة موجودة فعلًا.

## Sitemap

`buildSitemap` يقبل entries مع URL وchangeFrequency وpriority وalternates وimages حسب API الحالية. يجب أن تكون كل URL مطلقة HTTP(S)، وكل alternate آمنًا، وكل image من host موثوق.

سجّل routes المنشورة فقط. لا تضع query strings لا نهائية أو صفحات error أو مسارات خاصة بالمستخدم في sitemap.

## Robots

`buildRobots(sitemapUrl, disallow)` ينتج robots.txt. اجعل sitemap URL canonical. disallow للمسارات الإدارية أو المؤقتة، لكن لا تستخدم robots كبديل عن authorization أو noindex.

## RSS وAtom

يولد CLI `feed.xml` و`atom.xml` من route records وfeed metadata. يجب أن تكون عناوين العناصر وروابطها صحيحة، وأن تُهرب XML entities، وأن تتضمن المسارات الديناميكية المنشورة فعلًا.

```ts
const feed = generateFeed(items, {
  title: 'آخر التحديثات',
  description: 'أحدث صفحات الموقع',
  link: 'https://example.com/',
  feedUrl: 'https://example.com/feed.xml',
  language: 'ar',
})
```

## OG وTwitter

أضف `og:title` و`og:description` و`og:url` و`og:image` و`og:site_name`، و`twitter:card`. يملك document builder tags الخاصة بـcharset وviewport ويزيل تكرارها. يجب أن يكون OG image مطلقًا وقابلًا للوصول من خارج الموقع، لا مسار preview خاصًا بجهاز المطور.

## Hreflang

إذا كان لديك نسخ لغوية، يجب أن يشير كل alternate إلى صفحة موجودة، وأن يتضمن `x-default` عند الحاجة. لا تضع `hreflang="ar"` لصفحة إنجليزية أو العكس.

## SEO gates

اختبر كل route منشورًا عبر جدول لا عبر صفحة واحدة فقط:

| الفحص       | المطلوب                                  |
| ----------- | ---------------------------------------- |
| title       | موجود وفريد                              |
| description | موجود وغير فارغ                          |
| canonical   | HTTPS ومطابق للمسار                      |
| OpenGraph   | title وURL وimage عند الحاجة             |
| JSON-LD     | context/type/name وحقول النوع            |
| sitemap     | route منشور، لا خطر بروتوكول             |
| links       | لا broken internal links                 |
| head        | لا duplicate metadata أو structural tags |
| feed        | RSS وAtom صالحان                         |
| Lighthouse  | SEO يحقق gate المحدد                     |

لا يعني Lighthouse المحلي أن Google فهرس الموقع أو أن traffic تحسن. هذه قياسات هندسية فقط.

## مختبر Workbench

ابنِ مثال Workbench التنفيذي بالأمر `pnpm --filter @nexis/example-nexis-workbench build`. افحص `sitemap.xml` و`robots.txt` و`feed.xml` و`atom.xml` الناتجة وhead لكل route قبل نقل النمط لخدمة عامة. عيّن `NEXIS_SITE_ORIGIN` إنتاجيًّا مطلقًا خاصًا بك أثناء build التحقق؛ لا تنسخ hostname مثال أو preview إلى canonical.
