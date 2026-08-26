# الجلسات والمصادقة والتفويض وMiddleware

يوفر `@mohammedaydan/security` بدائل صغيرة ومحددة لإدارة جلسات التطبيق والتحقق من الصلاحيات. لا يوفّر الحزمة مزود OAuth/OIDC أو شاشة دخول أو قاعدة بيانات للمستخدمين؛ هذه مسؤولية التطبيق أو مزود الهوية والبنية التحتية التي تختارها.

## جلسة تعتمد على التخزين الذي يملكه التطبيق

أنشئ مخزن جلسات دائمًا أو موزعًا، ثم مرره إلى `createSession`. القيمة التي تصل إلى المتصفح هي معرف cookie مبهم، أما بيانات المستخدم فتظل لدى مخزن التطبيق.

```ts
import { createSession } from '@mohammedaydan/security'

const session = createSession({
  store: sessionStore,
  secret: process.env.SESSION_SECRET!,
})
```

تكون إعدادات cookie الآمنة افتراضيًا هي `httpOnly: true` و`secure: true` و`sameSite: 'Lax'` و`path: '/'`. اضبط `secure: false` فقط في التطوير المحلي الذي يعمل عبر HTTP.

## التفويض عند حدود المورد

استخدم `requireRole` أو `requirePermission` للحالات الثابتة، واستخدم `requireAccess` عندما تعتمد السياسة على المورد أو المستأجر أو ملكية السجل. يجب أن يظل الفحص داخل Action أو داخل طبقة تملك المورد، لا في الواجهة فقط ولا في Middleware وحده.

```ts
import { requireAccess, requirePermission } from '@mohammedaydan/security'

await requirePermission(actor, 'billing:write')
await requireAccess(actor, invoice, ({ actor, resource }) => actor.tenantId === resource.tenantId)
```

## Middleware على خادم Node

استخدم `createMiddleware` و`composeMiddleware` من `@mohammedaydan/serve` لتكوين سياسات عامة، مثل قراءة الجلسة وإرفاق السياق وفرض ترويسات الأمان. يجب استدعاء `next()` مرة واحدة على الأكثر. هذه الواجهة مبنية على `IncomingMessage` و`ServerResponse` الخاصة بـ Node؛ في بيئات Edge أو Deno أنشئ تكوينًا مكافئًا بمعالجات Fetch.

```ts
import { composeMiddleware, createMiddleware } from '@mohammedaydan/serve'

const withRequestContext = createMiddleware(async (request, response, next) => {
  response.setHeader('X-Content-Type-Options', 'nosniff')
  await next()
})

const middleware = composeMiddleware(withRequestContext)
```

> المصادقة تحدد الهوية، والتفويض يقرر ما يمكن لتلك الهوية فعله. لا تجعل وجود cookie بديلًا عن فحص الملكية أو المستأجر أو الصلاحية في العملية التي تعدّل البيانات.
