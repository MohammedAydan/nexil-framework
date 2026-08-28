# 16 — Troubleshooting

## First diagnostic pass

Run the smallest command that reproduces the problem, save the complete error, and record Node, pnpm, operating system, and commit. Then check whether the failure is source code, workspace installation, or environment.

```bash
node --version
pnpm --version
pnpm install --frozen-lockfile
pnpm typecheck
```

## Workspace dependency errors

If a package cannot resolve a workspace dependency or a package link points to a missing path:

```bash
pnpm install
pnpm store prune
pnpm install --frozen-lockfile
```

Do not change package imports to bypass a broken local installation. Inspect `pnpm-workspace.yaml`, package names, and lockfile consistency.

## Build errors

Check the first error rather than the final cascade. Look for:

- A missing export from the installed package.
- A browser-only API evaluated during SSR.
- A route file outside the configured source directory.
- An unsupported ScopeRef capture.
- A Tailwind path not included in content scanning.
- A malformed redirect, feed entry, or SEO URL.

## Hydration or resumability errors

If a control works only after a full refresh:

1. Confirm the source uses the expected `$` handler form.
2. Inspect generated HTML for Nexil event attributes.
3. Inspect the bootstrap and lazy-chunk network requests.
4. Verify captured values are serializable.
5. Check that the scope was not disposed early.
6. Check the browser console for a handler import error.

## Signal errors

Read a signal with `signal()` or `signal.value`, and update it using `signal.set(next)` or `signal.setValue(next)`. The `value` property is readonly.

```ts
count.set(count.value + 1)
```

For Stores, use `store.value`, `store.snapshot()`, and `store.set(...)`; there is no `store.get()` method in the current public API.

## SSR errors

Do not access `window`, `document`, `localStorage`, or browser-only APIs while rendering on the server. Move the access into an effect or a client handler and provide server-safe fallback HTML.

## Route errors

For a 404, inspect generated route records and URL normalization. For a 405, check the method allowlist. Test trailing slash and encoded path behavior. Never decode a pathname and then join it to a filesystem root without traversal checks.

## Missing assets

Check the manifest, output directory, MIME type, and public URL. Asset names should be fingerprinted or otherwise immutable when served with long-lived caching.

## Feed or sitemap errors

Check that URLs are absolute, XML entities are escaped, items have required dates and links, and only published routes are included. Validate RSS and Atom separately; passing one does not prove the other.

## Deno or Cloudflare errors

Check that imports use runtime-supported APIs. Do not assume Node globals. For Cloudflare, verify that the Assets binding is passed with the expected interface and that a fallback handles misses.

## Test ports and stale processes

A previous server may occupy the test port. Find and stop the stale process, then rerun once. Do not leave multiple servers running because E2E results may target the wrong build.

## Performance regressions

Compare the same route list and artifact scope. Check raw and gzip bytes, not just one headline total. Confirm whether a new dependency entered the bootstrap or a route-specific chunk.

## Security findings

Reproduce with a minimal test, identify the trust boundary, and add a regression test. Do not “fix” a security issue by disabling validation or logging sensitive input.
