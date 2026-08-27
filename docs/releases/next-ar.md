# Nexis next: جرد أصول التسليم الثابتة

> **الحالة: غير منشور.** هذا المستند يصف تغييرات موجودة على `main` بعد tag `v1.1.0`. لا يمثل إصدار حزمة يمكن تثبيته حتى يُحدد إصدار جديد ويُنشر رسميًا.

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

يبقى إصدار build manifest هو `1`. الحقل الجديد `assets` اختياري، لذلك تظل artifacts التي أنشأتها الإصدارات السابقة قابلة للقراءة. مخرجات ميزانية Routes القائمة لا تتغير؛ قسم الأصول يضاف بعدها فقط.

يغطي الاختبار مشروعًا يحتوي صورة PNG عامة بحجم 300 KiB، ويتحقق من ظهور الأصل وحجم الصور والتنبيه في الـmanifest ومخرجات التحليل. ويشغّل أيضًا SVG عامًا مهيأً للتحويل مرتين، ليتحقق من AVIF/WebP غير الفارغة وcache hits الدائمة في البناء الثاني. قبل تحديد رقم إصدار جديد شغّل بوابة الإصدار الكاملة:

```bash
pnpm format:check
pnpm check
pnpm release:check
```

## حدود الميزة

خط الصور يحوّل الملفات العامة المحلية فقط؛ ولا يجلب URLs خارجية، ولا يعيد كتابة HTML عشوائيًا، ولا يحذف ملفات المصدر، ولا يثبت ضغط النقل أو زمن فك الترميز أو caching في CDN أو Core Web Vitals من مستخدمين حقيقيين. اختبر هذه العوامل داخل المتصفح وعلى النشر الفعلي مع RUM.
