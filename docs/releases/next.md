# Nexis next: static asset delivery inventory

> **Status: v1.2.0 is unreleased.** This document describes the intended package contents after `v1.1.0`. It does not describe an installable version until the release commit is tagged and GitHub Packages publishing has completed.

## Starter Engine and project templates

`@mohammedaydan/starter` is a new portable starter engine. Its typed
`createStarterFiles()` API returns only relative file records and has no filesystem,
network, package-installation, archive, or credential side effects. The Node entry
adds argument parsing and safe filesystem scaffolding for the published initializer
and `nexis create`.

The initializer and CLI now support a stable `--template` choice:

```bash
pnpm dlx @mohammedaydan/create-nexis@1.2.0 portal --yes --ts --template secure-node
nexis create landing --template minimal --yes
```

`minimal` produces a no-boundary HTML-first route. `interactive`, still the default,
ships a small resumable counter boundary. `secure-node` provides a reviewed starting
configuration for explicit headers, CSP review, and fail-closed proxy trust. Existing
creation commands retain their default project name, TypeScript/JavaScript, and
Tailwind behavior. Both legacy initializer package names now delegate to the same
engine, eliminating template drift.

## Opaque production State Engine

Production builds now replace inline named ScopeRef payloads in `data-nx-scope` with
opaque `nx:scope:<hash>` keys. The minimum payload required to resume handlers and
Signal-to-DOM bindings is emitted once in `nexis-state.js`, before the relevant
runtime. Static routes and interaction-free pages do not receive the state asset.

This reduces HTML source size and prevents capture names, `kind`, stable IDs, and
initial values from being repeated in the document. It does **not** make the data
secret: `nexis-state.js` is browser-delivered and remains inspectable. Never capture
credentials, private request data, or other secrets. The client and external runtime
continue to accept legacy inline ScopeRef JSON for compatibility.

Playwright coverage proves the generated HTML retains only opaque keys, loads the
external state asset, lazily fetches a handler chunk on interaction, and preserves
both event state and automatic Signal-to-DOM binding updates across repeated clicks.

## Machine-readable project diagnostics

`nexis doctor --json` now emits a versioned `DoctorReport` with a top-level `ok`,
`warn`, or `error` status and stable check codes for package metadata, lifecycle
scripts, routes, HTML outlets, configuration, trusted-proxy intent, and explicit
security headers. The text form remains available for terminals. The report is a
local review tool—not a proof of TLS, CSP correctness, or proxy sanitization.

## Opt-in production security guards

`@mohammedaydan/serve` now exports `createSecurityHeaders(options?)`, and the
Node `ProductionServerOptions` accepts `securityHeaders` and `trustProxy`.
Enabling `securityHeaders` applies `nosniff`, `DENY` frame protection,
`strict-origin-when-cross-origin`, and a restrictive permissions policy across the
Node server’s assets, redirects, telemetry, errors, and Action responses. CSP and
HSTS are deliberately explicit options; CR/LF values are rejected.

`trustProxy` defaults to `false`. When explicitly enabled behind a proxy that
removes client-provided forwarded headers, Actions reconstruct their public URL
from the first validated forwarded protocol and host so trusted-Origin comparison
uses the external HTTPS origin. This does not authorize forwarded headers on a
directly exposed server.

The production integration coverage verifies opt-in header delivery, rejection of
CR/LF configuration, an untrusted cross-origin Action rejection, and fail-closed
versus enabled proxy reconstruction. It does **not** prove browser CSP behavior,
real-HTTPS cookie behavior, application CSRF-token validation, rate limiting, or
the correctness of a deployment proxy’s header sanitization.

## Static asset visibility in `nexis analyze`

`nexis analyze` now supplements its per-route JavaScript and CSS report with a static asset inventory from `dist/client`. It lists the number of non-HTML files, their total bytes, the image subtotal, and the five largest emitted assets.

```text
Static asset delivery
18 files  612.4 KiB total  430.1 KiB images
Largest assets:
  /hero.png  420.0 KiB  image  warning: consider AVIF/WebP variants, `sizes`, and lazy loading when below the fold
```

The build adds a non-blocking advisory to image files of 256 KiB or larger. The advisory directs developers toward responsive AVIF/WebP variants, an accurate `sizes` attribute, intrinsic dimensions, and lazy loading for non-critical images. It deliberately does not fail a build because content, viewport, LCP role, and CDN behavior determine whether a size is appropriate.

## Opt-in static image pipeline

Applications can now set `media.images.transform` in `nexis.config.*` to transform public PNG, JPEG, and SVG files during `nexis build`. Nexis keeps the original public image and emits static AVIF and WebP variants at configured widths. Variants are stored beside their source path in `dist/client`; a copy of the build record is written to `nexis-media.json`.

```ts
import { defineConfig } from '@mohammedaydan/serve'

export default defineConfig({
  media: { images: { transform: true, widths: [320, 640, 960, 1280] } },
})
```

The default disk cache is `.nexis/media-cache`. It is disposable, stays within the project root, and must be ignored by source control. `Image` and `pictureMarkup` accept `staticVariants` when a route should reference the emitted files instead of query-based image URLs. Existing applications remain unchanged unless they enable the configuration and choose static markup.

## Compatibility and verification

The build manifest keeps version `1`. The `assets` field remains optional, so older artifacts continue to be readable by the CLI. `nexis-state.js` is conditional and has no effect on static routes. Because generated production output now coordinates the CLI, Vite plugin, and resumability runtime, upgrade the matching v1.2.0 package set together; do not pin an old CLI beside a new plugin or mix its generated files with a previous build.

Verification covers the CLI build and analysis flow with a 300 KiB public PNG fixture. It also builds a configured public SVG twice, verifying non-empty AVIF/WebP output and persistent cache hits on the second build. Focused tests cover the portable starter files, safe Node scaffolding, the new `doctor --json` contract, opaque state HTML, real browser handler resumption, and real browser Signal bindings. Run the complete release gate before tagging the package version:

```bash
pnpm format:check
pnpm check
pnpm release:check
```

## Scope boundaries

The image pipeline transforms local public files only; it does not fetch remote URLs, automatically rewrite arbitrary HTML, delete source assets, or prove transfer compression, browser decode cost, CDN caching, or field Core Web Vitals. Use browser tooling and real-user monitoring to validate those factors on the deployed site. Similarly, opaque State Engine keys reduce HTML visibility but are not an access-control mechanism or a substitute for data classification.
