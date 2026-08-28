# Nexil Workbench

This example is the executable companion to `docs/en/24-production-workbench.md` and `docs/ar/24-منصة-Workbench-من-الصفر-إلى-الإنتاج.md`.

It proves static HTML routes, a shared layout, semantic Link navigation, a narrow Signal binding, static article paths, a native form, and typed Action/security integration points. The persistence and session declarations are deliberately application-owned boundaries, not fake built-ins.

```bash
pnpm --filter @nexil/example-nexis-workbench verify
pnpm --filter @nexil/example-nexis-workbench start
```

Inspect the initial document before JavaScript, test normal anchors with JavaScript disabled, then verify the Link and interaction boundary with JavaScript enabled. The support Action is a server module contract; connect it only through an application-owned server route and durable storage policy.
