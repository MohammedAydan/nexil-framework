# Nexis v1.3.0: تنقل Link وContextScope صريح

> **الحالة: v1.3.0 غير منشور.** إصدار Nexis `v1.2.0` منشور. يصف هذا المستند محتوى الحزم المستهدف بعد هذا tag، ولا يمثل إصدارًا قابلًا للتثبيت حتى يتم tag لالتزام الإصدار وينتهي النشر إلى GitHub Packages.

## تنقل Link دلالي بلا Virtual DOM

يوسع `@mohammedaydan/router` واجهة `Link` بعلامة `data-nx-link` دلالية مع الحفاظ على `href` محلي مطلق عادي. يبقى Link anchor عاديًا للـcrawlers والمتصفحات بلا JavaScript. يخرج البناء `nexis-navigation.js` فقط في Routes التي يحتوي HTML الناتج لها على هذه العلامة، ويسجل `BuildRouteRecord.navigationGzipBytes` تكلفته المضغوطة لكل route بقيمة `0` عند عدم وجود Link.

يقبل runtime الصغير المفوض primary clicks غير المعدلة داخل same-origin فقط. يجلب مستند HTML عاديًا، ويتحقق من outlet المملوك للفريمورك `#app`، ويحدث metadata التي يملكها، ويستبدل outlet مباشرة، مع History وscroll restoration وprefetch عام محدود وإلغاء الطلبات المتقاطعة وتنظيف bfcache وView Transitions اختيارية. يُمنع تكرار prefetch الناجح للـanchor نفسه، وتُعاد استجابة عامة قابلة للتخزين من cache ذاكرة الجلسة المحدود، أما `private` و`no-store` فلا يُحتفظ بهما ويُجلبان من جديد عند الزيارة. يحتفظ بمخارج المتصفح الطبيعية ويعود لتنقل عادي عندما تفشل استجابة HTML أو تكون غير مكتملة. لا يركب client renderer ولا ينشئ virtual tree ولا يعمل diff لمكونات.

يثبت Playwright anchor fallback بلا JavaScript، والتنقل باستبدال outlet بلا document reload، وسلوك History back/forward ومخارج hash وanchor الطبيعية، ووسم navigation fetch العام، وإلغاء الطلب المتأخر، وfallback لرد غير HTML، وتنظيف bfcache، وإعادة استخدام prefetch القابل للتخزين مع إعادة جلب `no-store`، وأن route الوجهة يحمل State Engine وlazy handler وSignal-to-DOM binding بعد Link swap.

## ContextScope صريح

يصدر `@mohammedaydan/core` الآن `createContextScope` و`provideContext` و`withContext` بجانب `createContext` المتوافقة. تمثل `Context.use()` اختصارًا لـ`useContext()`. تُنشئ `provideContext` child scope ولا تعدل parent، وتملك `createRequestContext` scope جديدًا لكل طلب. يمرر CLI SSR/SSG هذا scope إلى Routes وLayouts كـ`context.scope`.

يبقى `Provider` وسيلة تركيب متزامنة ويرفض child غير المتزامن بدل إبقاء قيمة ambient بعد `await`. يحمل async code الـscope صراحة. Context هو dependency injection لعمر واضح؛ لا يحفظ أو يسلسل قيمة، ولا يجعلها خاصة على العميل، ولا يجعل module state آمنة تلقائيًا للطلب. تظل Signals وStores تحدث فقط أهداف DOM المرتبطة صراحة من دون component rerendering أو Virtual DOM reconciliation.

## Starter Engine وقوالب المشاريع

`@mohammedaydan/starter` محرك بداية portable جديد. تعيد واجهته المكتوبة `createStarterFiles()` سجلات ملفات نسبية فقط، ولا تكتب في نظام الملفات ولا تتصل بالشبكة ولا تثبت packages ولا تنشئ archive ولا تتعامل مع credentials. يضيف مدخل Node تحليل arguments وscaffolding آمنًا بالملفات من أجل المنشئ المنشور وأمر `nexis create`.

يدعم المنشئ وCLI الآن اختيار `--template` مستقرًا:

```bash
pnpm dlx @mohammedaydan/create-nexis@1.3.0 portal --yes --ts --template secure-node
nexis create landing --template minimal --yes
```

ينتج `minimal` Route ثابتًا HTML-first بلا boundary. يظل `interactive` هو الافتراضي ويشحن boundary عداد صغيرًا قابلًا للاستئناف. ويقدم `secure-node` بداية مهيأة لمراجعة headers وCSP وثقة proxy fail-closed. تحتفظ أوامر الإنشاء الحالية بالاسم الافتراضي للمشروع وخيارات TypeScript/JavaScript وTailwind. وتعتمد أسماء الحزم القديمة للمنشئ الآن على المحرك الواحد نفسه حتى لا تتباعد القوالب.

## State Engine معتم في production

تستبدل production builds الآن حمولات ScopeRef المسمّاة المضمنة داخل `data-nx-scope` بمفاتيح `nx:scope:<hash>` معتمة. وتخرج أقل حمولة لازمة لاستئناف handlers وSignal-to-DOM bindings مرة واحدة داخل `nexis-state.js` قبل runtime المناسب. Routes الثابتة والصفحات التي لا تحتوي حالة قابلة للاستئناف لا تستلم ملف state.

يقلل ذلك حجم مصدر HTML وظهور أسماء captures و`kind` وstable IDs والقيم الابتدائية داخله. لكنه **لا يجعل البيانات سرية**: يصل `nexis-state.js` إلى المتصفح ويبقى قابلًا للفحص. لا تلتقط credentials أو بيانات طلب خاصة أو أسرار أخرى. يظل client وruntime الخارجيان يقبلان JSON ScopeRef المضمن القديم للتوافق.

يثبت Playwright أن HTML الناتج يحتفظ بالمفاتيح المعتمة فقط، ويحمل أصل state الخارجي، ويجلب handler chunk كسولًا عند التفاعل، ويحافظ على event state وتحديثات Signal-to-DOM bindings في نقرات متتالية.

## تشخيص مشروع قابل للاستهلاك الآلي

يصدر `nexis doctor --json` الآن `DoctorReport` مُرقمًا بحالة عليا `ok` أو `warn` أو `error` وأكواد فحص ثابتة لـ package metadata وlifecycle scripts وroutes وHTML outlets وconfig ونية trusted proxy وsecurity headers الصريحة. تبقى الصيغة النصية متاحة للطرفية. التقرير أداة مراجعة محلية، وليس إثباتًا لصحة TLS أو CSP أو تنظيف headers بواسطة proxy.

## حواجز أمان الإنتاج الاختيارية

تُصدر `@mohammedaydan/serve` الآن `createSecurityHeaders(options?)`، ويقبل
`ProductionServerOptions` الخاص بـ Node الخيارين `securityHeaders` و`trustProxy`.
تفعيل `securityHeaders` يطبق `nosniff` وحماية الإطار `DENY` و
`strict-origin-when-cross-origin` وpermissions policy مقيّدة على assets وredirects
وtelemetry والأخطاء وردود Actions في خادم Node. CSP وHSTS خياران صريحان عمدًا، وتُرفض
القيم التي تحوي CR/LF.

قيمة `trustProxy` الافتراضية هي `false`. عند تفعيله صراحةً خلف proxy يزيل forwarded
headers القادمة من العميل، تعيد Actions بناء URL العام من أول protocol وhost صالحين
حتى تقارن trusted Origin بأصل HTTPS الخارجي. هذا لا يجعل forwarded headers موثوقة في
خادم مكشوف مباشرة للإنترنت.

يتحقق اختبار التكامل الإنتاجي من وصول headers الاختيارية ورفض إعداد CR/LF ورفض
Action من Origin عابر غير موثوق، ومن الفرق بين proxy المعطل والمفعل عند إعادة بناء
URL. لا يثبت ذلك سلوك CSP في browser أو cookies على HTTPS حقيقي أو CSRF-token
validation في التطبيق أو rate limiting أو صحة تنظيف headers داخل proxy للنشر.

## ظهور أصول البناء داخل `nexis analyze`

أصبح `nexis analyze` يكمل تقرير JavaScript وCSS لكل Route بجرد للأصول الثابتة الخارجة من `dist/client`. يعرض عدد الملفات غير HTML، وإجمالي حجمها، وحجم الصور، وأكبر خمسة ملفات.

```text
Static asset delivery
18 files  612.4 KiB total  430.1 KiB images
Largest assets:
  /hero.png  420.0 KiB  image  warning: consider AVIF/WebP variants, `sizes`, and lazy loading when below the fold
```

يضيف البناء تنبيهًا غير حاجب لصورة حجمها 256 KiB أو أكثر. يقترح التنبيه إنشاء variants مستجيبة من AVIF/WebP، وكتابة `sizes` صحيحة، واستخدام أبعاد أصلية، وتأجيل الصور الواقعة أسفل الجزء المرئي. لا يجعل Nexis التنبيه خطأ build لأن حجم الصورة المناسب يتغير بحسب المحتوى وموضع LCP والـviewport والـCDN.

## خط الصور الثابتة الاختياري

يمكن للتطبيق ضبط `media.images.transform` في `nexis.config.*` لتحويل ملفات PNG وJPEG وSVG العامة أثناء `nexis build`. يحتفظ Nexis بملف الصورة العام الأصلي وينشئ variants ثابتة من AVIF وWebP بالعروض المحددة. تخرج هذه الملفات بجانب مسار المصدر داخل `dist/client`، ويُكتب سجل البناء أيضًا إلى `nexis-media.json`.

```ts
import { defineConfig } from '@mohammedaydan/serve'

export default defineConfig({
  media: { images: { transform: true, widths: [320, 640, 960, 1280] } },
})
```

الـcache الافتراضي هو `.nexis/media-cache`. يمكن حذفه، ويظل داخل جذر المشروع، ويجب تجاهله من source control. يقبل `Image` و`pictureMarkup` خاصية `staticVariants` عندما تريد أن يشير Route إلى الملفات الناتجة بدل عناوين الصور المعتمدة على query. لا تتغير التطبيقات الحالية إلا عندما تفعل الإعداد وتختار markup الثابت صراحة.

## التوافق والتحقق

يبقى إصدار build manifest هو `1`. يظل حقل `assets` اختياريًا، لذلك تظل artifacts الأقدم قابلة للقراءة. `nexis-state.js` مشروط ولا يؤثر في Routes الثابتة. ولأن ناتج production ينسق الآن بين CLI وVite plugin وRouter وruntime الاستئناف، حدّث مجموعة حزم v1.3.0 المتطابقة معًا ولا تثبت CLI قديمًا إلى جانب plugin جديد أو تخلط الملفات المولدة مع build سابق.

يغطي الاختبار مشروعًا يحتوي صورة PNG عامة بحجم 300 KiB، ويتحقق من ظهور الأصل وحجم الصور والتنبيه في الـmanifest ومخرجات التحليل. ويشغّل أيضًا SVG عامًا مهيأً للتحويل مرتين، ليتحقق من AVIF/WebP غير الفارغة وcache hits الدائمة في البناء الثاني. وتغطي الاختبارات المركزة ملفات Starter Engine portable وscaffold Node الآمن وعقد `doctor --json` وHTML state المعتم واستئناف handler في متصفح حقيقي وSignal bindings في متصفح حقيقي. قبل tag الإصدار شغّل بوابة الإصدار الكاملة:

```bash
pnpm format:check
pnpm check
pnpm release:check
```

## حدود الميزة

خط الصور يحوّل الملفات العامة المحلية فقط؛ ولا يجلب URLs خارجية، ولا يعيد كتابة HTML عشوائيًا، ولا يحذف ملفات المصدر، ولا يثبت ضغط النقل أو زمن فك الترميز أو caching في CDN أو Core Web Vitals من مستخدمين حقيقيين. اختبر هذه العوامل داخل المتصفح وعلى النشر الفعلي مع RUM. وبالمثل، تقلل مفاتيح State Engine المعتمة الظهور داخل HTML، لكنها ليست access-control ولا بديلًا لتصنيف البيانات.
