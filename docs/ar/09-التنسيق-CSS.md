# 09 — CSS وTailwind والتنسيق

## مبدأ CSS في Nexis

الصفحات الساكنة يجب أن تحصل على CSS دون الاعتماد على JavaScript. لذلك يُفضل أن تكون الأنماط مستخرجة في build، وأن يبقى runtime الخاص بالتنسيق صفرًا أو قريبًا من الصفر.

## تنظيم الملفات

```text
src/styles/
├── reset.css
├── tokens.css
├── base.css
├── components.css
└── utilities.css
```

ابدأ بالـ tokens مثل الألوان والمسافات، ثم base، ثم مكونات، ثم utilities. لا تخلط theme خاصًا بمكون مع global selectors واسعة.

```css
:root {
  --color-bg: #ffffff;
  --color-text: #172033;
  --space-2: 0.5rem;
}

.card {
  padding: var(--space-2);
  color: var(--color-text);
  background: var(--color-bg);
}
```

## Tailwind

إذا استخدمت Tailwind، اجعل content paths تشمل ملفات `src` و`examples` المطلوبة. تأكد أن class names قابلة للاكتشاف وقت البناء؛ لا تركّب class name من string عشوائي إذا كان Tailwind لا يستطيع رؤيته.

```tsx
<div className="grid gap-4 md:grid-cols-2">
  <Card />
</div>
```

في package CSS بالمشروع توجد أدوات دمج class names. إذا ظهرت مشكلة `tailwind-merge` بعد تشغيل fixture مؤقت، أصلح workspace link عبر `pnpm install` بدل تعديل source imports عشوائيًا.

## CSS Modules أو naming

يمكن استخدام naming منظم مثل BEM أو أسماء محلية. المهم ألا يؤثر style route على route آخر دون قصد.

```css
.product-card__title {
  font-weight: 700;
}
.product-card--featured {
  border-color: var(--color-accent);
}
```

## RTL والعربية

استخدم logical properties بدل `margin-left` و`padding-right` عندما يمكن:

```css
.panel {
  padding-inline: 1rem;
  margin-block: 1rem;
  border-inline-start: 3px solid var(--color-accent);
}
```

ضع `dir="rtl"` على HTML أو منطقة التطبيق، واختبر النص العربي والإنجليزي معًا. لا تعتمد على اتجاه بصري واحد في icons أو chevrons.

## تقليل CSS

- لا تستورد مكتبة UI كاملة لزرين.
- افصل CSS العالمي عن CSS الخاص بالصفحة.
- راقب `styles.css` في benchmark artifacts.
- استخدم minification في الإنتاج.
- لا تجعل CSS يفرض hydration أو JavaScript.

## Critical CSS

يمكن وضع الأنماط الضرورية للـ shell في head، لكن لا تكرر stylesheet كاملًا داخل كل HTML. إذا كان الموقع كبيرًا، استخدم extraction أو bundling منضبطًا.

## Accessibility في CSS

حافظ على focus visible، contrast مناسب، وموضع قراءة منطقي. لا تستخدم `display: none` لإخفاء نص مهم عن قارئ الشاشة إلا إذا كان ذلك مقصودًا. استخدم media query للحركة:

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms;
    transition-duration: 0.01ms;
    scroll-behavior: auto;
  }
}
```

## الاختبار

اختبر الصفحة في viewport صغير، وRTL، وzoom 200%. في E2E افحص ألا يسبب CSS overflow أفقيًا، وأن buttons وlinks قابلة للنقر ولوحة المفاتيح.
