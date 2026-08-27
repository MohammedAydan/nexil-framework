# 20 — CLI وملف التهيئة

## أوامر CLI

| الأمر                             | الوظيفة                                 |
| --------------------------------- | --------------------------------------- |
| `nexis build`                     | بناء routes وHTML والأصول والـ metadata |
| `nexis preview`                   | معاينة production build                 |
| `nexis serve`                     | تشغيل production server على build جاهز  |
| `nexis generate route <path>`     | إنشاء route بأمان                       |
| `nexis generate component <name>` | إنشاء component بأمان                   |
| `nexis add action <name>`         | إنشاء server action scaffold            |
| `nexis doctor`                    | فحص config وshell وroute structure      |
| `nexis doctor --json`             | تقرير تشخيصي versioned للاستهلاك في CI  |
| `nexis test`                      | تشغيل workflow الاختبارات               |
| `nexis upgrade`                   | فحص متطلبات الترقية                     |
| `nexis --help`                    | عرض الأوامر والخيارات                   |
| `create-nexis-app`                | إنشاء مشروع جديد                        |

استخدم scripts في `package.json` لتوحيد الخيارات داخل الفريق بدل تمرير flags مختلفة يدويًا في كل مرة. في v1.3.1 يقبل `create` الخيار `--template minimal|interactive|secure-node`، ويصدر `doctor --json` تقريرًا versioned. استخدم `_layout.*` للتخطيطات المتداخلة؛ تبقى `layout.*` مدعومة للتوافق، ولا تتحول route groups إلى أجزاء من URL.

## تشخيص قابل للاستهلاك الآلي

استخدم `nexis doctor --json` عندما تحتاج CI أو مولد مشروع أو تكامل editor إلى تقرير ثابت. يحتوي إصدار التقرير `1` على حالة `ok` أو `warn` أو `error` وفحوصات لـ package manifest وscripts lifecycle ومجلد routes وHTML outlets وNexis config ونية trusted proxy وإعدادات security headers الصريحة.

```bash
nexis doctor --json > nexis-doctor.json
```

التحذير دعوة للمراجعة وليس دليلًا على أن الاستضافة آمنة أو غير آمنة. خصوصًا عند تفعيل `trustProxy`، لا يستطيع فحص CLI إثبات أن proxy في البنية التحتية يستبدل forwarded headers فعلًا.

## ملف التهيئة

يدعم المشروع `nexis.config.json` و`nexis.config.js` و`nexis.config.mjs` و`nexis.config.ts`. يجب أن يصدر الملف object configuration صالحًا.

```ts
import type { NexisBuildConfig } from '@mohammedaydan/cli'

export default {
  siteOrigin: 'https://example.com',
  routesDir: './src/routes',
  outputDir: './dist',
  feed: {
    title: 'Example',
    description: 'Example updates',
    language: 'ar',
  },
  redirects: [{ from: '/legacy', to: '/', status: 308 }],
} satisfies NexisBuildConfig
```

استخدم `satisfies` حتى يراجع TypeScript الحقول دون فقدان أنواع القيم الحرفية.

## القواعد الأمنية للتهيئة

- JSON غير صالح يجب أن يفشل بوضوح.
- لا تشغّل source configuration غير موثوق في CI.
- لا تضع secrets في config التي تدخل Git.
- تحقق من redirect targets محليًا وآمنًا.
- اجعل `siteOrigin` صريحًا في كل deployment.

## إعدادات feed

تستخدم feed metadata لإخراج RSS وAtom. يجب أن يكون title وdescription غير فارغين، وlink وfeedUrl عناوين HTTP(S) صحيحة. تتوسع dynamic static routes في feed فقط إذا دخلت عملية build ضمن route records.

## إعدادات redirects

مثال آمن:

```json
{
  "redirects": [{ "from": "/docs", "to": "/docs/architecture", "status": 308 }]
}
```

لا تسمح بـ `javascript:` أو protocol غير HTTP(S)، ولا تستخدم redirect مفتوحًا من query parameter.

## بيئات متعددة

يمكن إنشاء config مختلفة للـ preview والإنتاج، لكن لا تجعل canonical وfeed وrobots تختلط بين البيئتين. استخدم متغيرات بيئة أو ملفات واضحة، وسجّل site origin في artifact.

## خروج build

راجع هذه الملفات بعد البناء:

```text
dist/client/index.html
dist/client/nexis-manifest.json
dist/client/nexis-state.js
dist/client/nexis-bootstrap.js
dist/client/nexis-bindings.js
dist/client/nexis-forms.js
dist/client/nexis-navigation.js  # Routes التي تحتوي Link دلالي فقط
dist/client/sitemap.xml
dist/client/robots.txt
dist/client/feed.xml
dist/client/atom.xml
dist/nexis-redirects.json
dist/client/og/
dist/client/images/
```

يخرج `nexis-navigation.js` فقط عندما يحتوي HTML الناتج على `Link` دلالي، ويسجل `BuildRouteRecord.navigationGzipBytes` القيمة `0` في غير ذلك. يفرض `nexis check` ميزانية مستقلة قدرها 6 KiB gzip لـruntime التنقل بالإضافة إلى ميزانيات route وbootstrap الحالية. راجع الـmanifest الناتج وسجل البناء باعتبارهما مصدر حقيقة خاصًا بالإصدار.

## CI

اقترح pipeline بهذا الترتيب:

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm typecheck
pnpm test
pnpm lint
pnpm format:check
pnpm audit --audit-level=high
pnpm test:e2e
pnpm bench:lighthouse
```

احفظ artifacts المهمة، ولا تنشر إذا كان build أو gate فاشلًا. راجع [ملاحظات v1.1.0](../releases/v1.1.0-ar.md) لقائمة الترقية الكاملة.
