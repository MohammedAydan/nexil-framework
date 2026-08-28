# Nexis v1.3.2: تصحيح المعالج المحلي المسمّى القابل للاستئناف

## الإصلاح

تعمل الآن صيغة `onClick$={increment}` عندما تكون `increment` arrow function محلية مباشرة أو function expression أو function declaration وتغلق على قيم Resumability المدعومة. كان تحويل Vite ينتج سابقًا استدعاءً غير موجودًا مثل `scope.increment(...)` بدل خفض جسم الـHandler والتقاط قيم مثل Signal. الصيغة المكتوبة داخل الحدث كانت تعمل، والصيغة المحلية المسمّاة مدعومة الآن أيضًا.

يعرض Starter التفاعلي الآن صيغة المعالج المسمّى المدعومة ويولّد مشاريع جديدة بالنطاق المتناسق `^1.3.2`. تُنشر كل حزم Nexis العامة كمجموعة متناسقة.

## الترقية

حدّث حزم Nexis المتناسقة إلى `1.3.2` معًا، وجدّد lockfile، وابنِ من `dist` نظيف. لا تحتاج الـHandlers المكتوبة داخل الحدث إلى migration. يمكنك استبدالها بتعريف محلي مسمّى مباشر عند تحسين الوضوح، بشرط أن تبقى كل captures ضمن قيم ScopeRef المدعومة.

```bash
pnpm dlx @nexis/create-nexis@1.3.2 portal --yes --ts
pnpm install
pnpm build
```

## التوافق

هذا تصحيح patch متوافق مع الإصدارات السابقة. لا يغير عقد `Link` الدلالي، أو سلوك استبدال `#app` المباشر، أو رندر SSR/SSG، أو نموذج ContextScope، أو حدود Store العالمي في المتصفح، أو القاعدة التي تمنع التقاط الأسرار والموارد الخادمية داخل Handler عميل.

## Nexis v1.3.3 — مزامنة CSS الخاص بالمسار أثناء تنقل Link

يضيف هذا التصحيح معالجة للـstylesheets الخاصة بالمسار. عند وضع الخاصية `data-nx-route-style` على stylesheet، يحذفها runtime القديمة ويتبنى stylesheet الموجودة في HTML الوجهة أثناء تنقل `Link`. يبقى CSS المشترك كما هو، ويظل fallback الخاص برابط `<a href>` العادي متاحًا دون JavaScript.

يضيف الإصدار أيضًا تغطية compiler لصيغة المعالج المحلي متعدد الأسطر:

```tsx
export default component(() => {
  const count = state(0)
  const increment = () => {
    count.set(count() + 1)
  }
  return <button onClick$={increment}>Increment</button>
})
```

استخدم marker الخاص بالمسار فقط للـCSS الذي يخص route محددًا. يجب أن يحتوي المستند الأولي على stylesheet أيضًا حتى يعمل الوصول المباشر والتنقل دون JavaScript.
