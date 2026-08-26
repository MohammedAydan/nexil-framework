# 19 — Releases and Upgrades

## Release discipline

Treat a release as a reproducible artifact, not just a version string. Record the commit, lockfile, Node and pnpm versions, test results, benchmark environment, and generated package contents.

## Before upgrading

Read the package changelog and inspect the exported declarations that your application imports. Search for removed or renamed APIs, changed defaults, runtime requirements, and changes to generated output.

```bash
git status --short
pnpm outdated
pnpm install --lockfile-only
pnpm typecheck
```

Do not update unrelated dependencies during a framework migration unless the change is intentional and separately tested.

## Semantic versioning

In general, a major release may contain breaking public API changes, a minor release may add backward-compatible features, and a patch release should fix bugs without changing the expected contract. Still read the release notes; build plugins and generated output can expose practical compatibility details.

## Release gates

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm test:parity
pnpm test:node-runtime
pnpm test:edge
pnpm check:budget
pnpm bench:compare
pnpm bench:lighthouse
pnpm release:check
pnpm security
pnpm test:deno:e2e  # requires an actual Deno executable
```

Run the Deno E2E command in an environment that actually has Deno. Do not report a Node fallback as Deno verification.

## Migration notes

For each upgrade, write:

1. Previous version and target version.
2. Package changes.
3. Source changes required.
4. Configuration changes.
5. Generated-output changes.
6. Rollback procedure.
7. Tests and benchmarks run.

## v1.1.0 migration

When moving from v1.0.0 to v1.1.0, rename preferred composition modules to `_layout.*`, remove manual `serializeScopeRefs()` calls from route components, and extract repeated shells into root or nested layouts. Update output checks to account for `nexis-forms.js`, recursive `nexis-chunks/`, inherited metadata, and Suspense replacement templates. Existing `layout.*` modules remain supported for compatibility.

Use `Form` and `SubmitButton` for native-first forms. Add an action `endpoint` when passing an action reference to `Form`, and keep server-side validation, authorization, Origin, CSRF, and idempotency checks in place.

## Generated files

Never edit generated client chunks or manifests as a fix. Change source or configuration, rebuild, and review the diff. Check that static routes remain static and that interactive routes have valid handler references.

## Compatibility matrix

| Area       | Verify                                                                |
| ---------- | --------------------------------------------------------------------- |
| Node       | Supported Node version and ESM behavior                               |
| Deno       | Fetch handler and permission assumptions                              |
| Cloudflare | Assets binding and Worker limits                                      |
| Browser    | Bootstrap, event delegation, and lazy chunks                          |
| CSS        | Tailwind scanning and extracted output                                |
| SEO        | Head, sitemap, feeds, and safe URLs                                   |
| Actions    | Method, Origin, validation, CSRF, and idempotency                     |
| Layouts    | `_layout.*` discovery, route groups, and metadata inheritance         |
| Streaming  | Suspense fallback ordering and disconnect cleanup                     |
| Forms      | Native fallback, `nexis-forms.js`, loading state, and repeated fields |

## Rollback

Keep the previous build and lockfile available. A rollback should restore application code, generated assets, and configuration together. If a migration changes a database or durable idempotency store, document the reversible and irreversible steps before deployment.

## Deprecations

Prefer a warning with a migration path over a silent behavior change. A deprecation should identify the replacement, the release where it appeared, and the planned removal policy.

## Release report

The release report should distinguish automated gates from human review, and local lab measurements from field data. A passing test suite does not prove that every deployment configuration is safe.
