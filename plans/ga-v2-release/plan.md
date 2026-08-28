# Feature: v2.0.0 GA Release

## Goal

Ship the production-ready v2.0.0 GA: initializer parity (`create-nexil` + `create-nexil-app` binaries), genuinely working interactive template, world-class truthful README, Deno e2e spec in CI, full gates, all packages published at 2.0.0 via the tag-driven pipeline.

## Acceptance criteria

- [ ] Scaffolded app has a REAL working resumable counter (dev + build + preview)
- [ ] Resumability bootstrap works identically in dev (middleware) and prod (static)
- [ ] create-nexil exposes both `create-nexil` and `create-nexil-app` bins; documented exec forms verified
- [ ] README rewritten as doc hub; every code sample traced to real exported APIs
- [ ] tests/e2e/deno-runtime.spec.ts added; runs under Deno in CI; excluded from Playwright
- [ ] All public packages at 2.0.0; scaffold deps ^2.0.0
- [ ] Local gates green: build/typecheck/lint/format/test/e2e/smokes/security/budget
- [ ] Tag v2.0.0 pushed → publish-packages.yml green → registry shows 2.0.0
- [ ] External consumer flow revalidated at 2.0.0

## Approach

Truth-first docs; bounded tooling extension (virtual bootstrap in vite-plugin + unified chunk paths); reuse verified contracts (onClick$ chunk extraction, {element} handler arg, renderRoute modes).

## Out of scope

- Inventing `component()`/`state()` DOM auto-binding (does not exist in baseline; documented as roadmap)
- Unscoped npmjs publication (no npmjs credentials; GitHub Packages strategy retained)

## Complexity: L
