# 21 — Contributing to Nexil Framework

## Before you begin

Read the root README, package-level README files, the relevant source declarations, and the test that covers the behavior you plan to change. The monorepo uses pnpm workspaces and strict TypeScript.

```bash
git clone <repository-url>
cd nexil-framework
pnpm install --frozen-lockfile
pnpm build
pnpm test
```

## Find the right package

| Change                     | Likely package                   |
| -------------------------- | -------------------------------- |
| Escaping and render tree   | `core`, `renderer`               |
| Route matching             | `router`                         |
| Signals and effects        | `reactivity`                     |
| Stores                     | `state`                          |
| Actions and Origin         | `actions`                        |
| Compiler and lazy handlers | `client`, `vite`                 |
| Metadata and feeds         | `seo`                            |
| Images and fonts           | `media`                          |
| Node HTTP behavior         | `serve`                          |
| Deno or Cloudflare         | `serve-deno`, `serve-cloudflare` |
| Web Vitals                 | `telemetry`                      |

Keep a change in the smallest package that owns the contract. Update exports and tests together.

## Coding style

Use strict TypeScript, explicit public types, small functions, and descriptive errors. Avoid adding a dependency for a small utility. Preserve runtime portability where a package targets both Node and Fetch-native environments.

Run formatting and linting before opening a pull request:

```bash
pnpm lint
pnpm format:check
git diff --check
```

## Tests

Every behavior change needs a regression test at the appropriate layer. Security fixes should include a test that demonstrates the rejected input. Runtime adapters need parity tests for status, headers, body, and caching.

For client compiler changes, test generated HTML, manifest entries, handler references, and the no-JavaScript static route behavior. For reactivity changes, test disposal, cycles, batching, and nested roots.

## Documentation

Public API changes require documentation. Examples must use the current API, especially Signal setters and Store methods. Do not claim that a local benchmark is field data or that an internal baseline is an official framework comparison.

## Benchmarks

Keep benchmark routes and payloads comparable. Record raw data and environment details. If a threshold changes, explain the reason in the change description and include before/after numbers.

## Commits and pull requests

Use a focused commit with a clear message. A pull request should describe the problem, implementation, test commands, security implications, performance impact, and any migration notes. Attach screenshots or generated artifacts when the output is visual.

## Review principles

Review the public contract, not only the implementation. Ask whether SSR remains isolated, whether resources are disposed, whether URLs and inputs are validated, whether errors are safe, and whether backward compatibility is preserved.

## Security reporting

Do not publish an exploitable vulnerability in a normal issue. Report it privately through the project’s security channel and include a minimal reproduction, impact, affected versions, and a suggested mitigation when available.

## Maintainer checklist

Before merge, confirm CI passes, the lockfile is consistent, generated files are reproducible, package exports are intentional, docs are linked, and no secrets or unrelated files are included.
