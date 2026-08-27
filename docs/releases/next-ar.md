# Nexis v1.3.1: تصحيح pin dependencies في Starter

## الإصلاح

يستخدم `@mohammedaydan/starter` الآن نطاق Nexis المتناسق `^1.3.1` افتراضيًا عند استدعاء `createStarterFiles()`. كانت القيمة الافتراضية في v1.3.0 تولّد dependencies على `^1.2.0` عندما لا يمرر المستدعي `dependencyVersion` صراحةً. لذلك قد يبدأ المشروع الجديد دون عقد Link وContext المنشورين في v1.3.0.

تُنشر كل حزم Nexis العامة كمجموعة متناسقة عند `1.3.1`، بما فيها `@mohammedaydan/seo`. ما زال Starter يقبل نطاق semver صريحًا أو `workspace:*` عندما يقصد المستدعي مصدرًا متوافقًا آخر.

## الترقية

حدّث حزم Nexis المتناسقة إلى `1.3.1` معًا، وجدّد lockfile، وابنِ من `dist` نظيف. لا تحتاج التطبيقات الموجودة التي ثبّتت v1.3.0 عمدًا إلى migration في source من أجل هذا التصحيح. يمكن لمستدعي Starter الجديد الاعتماد على القيمة الافتراضية المصححة أو تمرير dependency version الذي يريد توليده صراحةً.

```bash
pnpm dlx @mohammedaydan/create-nexis@1.3.1 portal --yes --ts
pnpm install
pnpm build
```

## التوافق

هذا تصحيح patch متوافق مع الإصدارات السابقة. لا يغير عقد `Link` الدلالي، أو سلوك استبدال `#app` المباشر، أو رندر SSR/SSG، أو نموذج ContextScope، أو حدود Store العالمي في المتصفح الموثقة لـv1.3.0.
