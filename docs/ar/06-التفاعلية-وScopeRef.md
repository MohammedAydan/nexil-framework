# 06 — التفاعلية وResumability وScopeRef

## الفكرة

في Hydration التقليدي، يعيد العميل تشغيل شجرة التطبيق ليعرف أين توجد الأحداث والحالة. في Nexis، يصل HTML ومعه معلومات كافية لتحديد الحدث، ثم يُحمّل Handler المطلوب فقط عند التفاعل. هذه هي Resumability.

```text
SSR HTML
  + data-nx-on-click="chunk-id#handler"
  + data-nx-scope="nx:scope:<opaque-key>"
  + nexis-state.js (فقط عند الحاجة إلى state قابلة للاستئناف)
  + nexis-bootstrap.js
  + nexis-bindings.js (binding routes only)
  + nexis-forms.js (progressive Form routes only)
        │
        └── click → import lazy chunk → resolve scope → execute handler
```

## الربط الدقيق والاستدلال التلقائي

يمكن لـ Nexis تحديث عقدة نصية أو خاصية DOM مباشرة من Signal دون إعادة تشغيل component. القراءة المباشرة مثل `{count()}` تُحلل تلقائيًا عندما تكون القيمة قابلة للاستعادة. كما تدعم التوجيهات `bindText$` و`bindValue$` و`bindChecked$` و`bindDisabled$` و`bindHidden$` و`bindClass$` و`bindStyle$` و`bindHref$` و`bindSrc$` و`bindAriaLabel$`.

تستخدم v1.1.0 تحليل AST للقيم الابتدائية، وتجمع التعبيرات المتساوية في lazy chunk واحد، وترفع حمولات `data-nx-scope` المتطابقة إلى أقرب سلف مشترك. لذلك لا تكتب `data-nx-scope` ولا تستدعِ `serializeScopeRefs()` يدويًا داخل route.

## State payload في production

في v1.2.0، عندما يلتقط Handler إشارة أو Store أو Action، يستبدل بناء production الحمولة المسمّاة في HTML بمفتاح scope معتم، ويضع الحمولة الضرورية للمتصفح في `nexis-state.js` قبل runtime الاستئناف. يستمر Nexis في تحليل AST للقيمة الابتدائية ويجمع التعبيرات المتساوية في lazy chunk واحد؛ لا تكتب `data-nx-scope` ولا تستدعِ `serializeScopeRefs()` يدويًا داخل route.

هذا يقلل ظهور أسماء captures و`kind` و`id` والقيم الابتدائية في مصدر HTML. لكنه **ليس تشفيرًا ولا تفويضًا**: يمكن للمتصفح تنزيل `nexis-state.js`، ولذلك تبقى بيانات capture عامة للعميل. لا تلتقط secrets أو credentials أو ملف user خاص أو بيانات مرتبطة بطلب واحد. تبقى حمولات ScopeRef بصيغة JSON داخلية مدعومة للتوافق وللحدود المكتوبة يدويًا.

## كتابة Handler lazy

استخدم صيغة `$` في المكان الذي يحلله Vite plugin. اجعل Handler قصيرًا، واستخدم مراجع يمكن تصنيفها.

```tsx
export function LikeButton({ postId }: { readonly postId: string }) {
  return (
    <button
      type="button"
      onClick$={() => {
        console.log(`like ${postId}`)
      }}
    >
      أعجبني
    </button>
  )
}
```

إذا كان `postId` قيمة بسيطة قابلة للتسلسل، يمكن تضمينها في scope. أما قاعدة بيانات أو class instance أو closure يعتمد على موارد غير قابلة للنقل فلا يجب تمريره إلى العميل.

### Handler محلي مسمّى

يمكن تمرير Arrow function أو Function expression محلي مسمّى مباشرة إلى event prop. يحلّل Nexis جسم الدالة وقت البناء، ويصنّف القيم التي يغلق عليها، ثم ينتج lazy boundary نفسها التي ينتجها callback المكتوب داخل الحدث. بذلك يمكن تسمية نية التفاعل وإعادة استخدامها من دون Hydration للمكوّن كله.

```tsx
export default component(() => {
  const count = state(0)
  const increment = () => count.set((current) => current + 1)

  return (
    <section>
      <output>{count()}</output>
      <button onClick$={increment}>Increment</button>
    </section>
  )
})
```

يجب أن يكون الـHandler identifier محليًا مباشرًا وأن يسبق تعريفه event prop. لا يسلّسل Nexis الدوال المستوردة أو تعبيرات handler المحسوبة عشوائيًا أو database client أو secrets أو class instances قابلة للتغيير. اجعل الـhelpers الخالصة داخل الـHandler، أو اجعل قيمها العامة captures صريحة؛ أما عمل الخادم فيبقى داخل Action.

## أنواع ScopeRef

| النوع         | الاستخدام                                | ملاحظة                          |
| ------------- | ---------------------------------------- | ------------------------------- |
| `value`       | string/number/boolean أو بيانات مصرح بها | يجب أن تكون serializable        |
| `signal`      | Signal حي قابل للقراءة والتحديث          | يحتاج lifecycle ownership       |
| `store`       | Store وSelectors                         | يجب التخلص منه عند نهاية النطاق |
| `action`      | مرجع إلى Action خادمي                    | لا يرسل تنفيذ الخادم إلى العميل |
| `unsupported` | قيمة لم يستطع Compiler نقلها             | تظهر كتشخيص ولا تُسلسل بصمت     |

## النماذج التدريجية

تحافظ `Form` و`SubmitButton` على الإرسال الأصلي للمتصفح، ويضيف runtime `nexis-forms.js` idempotency key وCSRF اختياريًا وحالة تحميل وأحداث نجاح وفشل. استخدم `endpoint` داخل action عند تمرير مرجع Action إلى Form، وابقِ التحقق والتفويض وفحص Origin على الخادم.

## Registry

Client registry يسجل المراجع ويتيح `resolve` و`inspectScope` و`dispose` و`disposeAll`. لا تخزن مراجع عالمية بلا نهاية؛ كل route أو boundary يجب أن يملك عمرًا واضحًا.

```ts
const registry = createScopeRegistry()
registry.register({ id: 'counter', kind: 'signal', value: count })
const signal = registry.resolve('counter')
registry.dispose('counter')
```

استخدم الدوال الفعلية المصدرة من `@mohammedaydan/client`، ولا تبنِ نظام registry موازيًا.

## لماذا لا تُنقل Closure عشوائيًا؟

Closure قد تحتوي على connection أو token أو object يحمل prototype أو مرجعًا إلى DOM. تحويلها إلى JSON قد يؤدي إلى فقدان المعنى أو تسريب سر. Nexis يصنف capture بدل أن يدعي أنه يستطيع إعادة بناء كل شيء.

الأسلوب الصحيح:

```tsx
const publicConfig = { locale: 'ar' }

function Button() {
  return <button onClick$={() => setLocale(publicConfig.locale)}>تغيير</button>
}
```

والأسلوب الخطر هو وضع `dbClient` أو `process.env.SECRET` أو كائن مستخدم كامل داخل Handler client.

## Delegated events

Bootstrap يلتقط الأحداث على مستوى document ويبحث عن attributes الخاصة بـ Nexis. لذلك:

- استخدم event type الصحيح.
- لا تعتمد على `event.target` دون تضييق نوعه.
- إذا كان الحدث submit، يجب منع الإرسال الأصلي في الوقت المناسب ثم تنفيذ enhancement.
- يجب أن يعمل النموذج حتى قبل تحميل JavaScript، عبر `action` و`method` حقيقيين.
- استخدم `Form` و`SubmitButton` للنماذج؛ يُضاف `nexis-forms.js` فقط عندما يحتوي route على Form تدريجي.

## حدود التفاعل

اجعل كل boundary صغيرًا. زر داخل بطاقة لا يعني أن البطاقة كلها يجب أن تكون client-side. إذا كان لديك جدول كبير، اجعل البحث أو الترتيب boundary مستقلًا، ولا تشحن بيانات الجدول كاملة إلى المتصفح بلا حاجة.

## اختبار Resumability

اختبر أربع حالات:

1. الصفحة تعرض المحتوى دون تنفيذ Handler.
2. أول نقرة تحمل chunk واحدًا فقط.
3. الحالة تظهر صحيحة بعد التفاعل.
4. refresh أو route transition لا يترك Registry أو effects قديمة.

في Playwright راقب network requests قبل وبعد النقرة، وتأكد أن static route لا يطلب JavaScript.

## أخطاء شائعة

- استخدام `onClick` العادي في مسار يتوقع Compiler أن يحلله بـ `onClick$`.
- محاولة قراءة `window` أثناء SSR.
- تمرير mutable object غير قابل للتسلسل.
- إنشاء Effect عالمي لا يتم التخلص منه.
- الاعتماد على client state لعرض المحتوى الأساسي الذي يجب أن يصل في HTML.
