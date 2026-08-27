# Nexis next: static asset delivery inventory

> **Status: unreleased.** This document describes changes on `main` after the `v1.1.0` tag. It does not describe an installable package version until a later release is tagged and published.

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

The build manifest keeps version `1`. The new `assets` field is optional, so artifacts created before this follow-up continue to be readable by the CLI. The existing route budget output remains unchanged; the asset section is appended after it.

Verification covers the CLI build and analysis flow with a 300 KiB public PNG fixture. It also builds a configured public SVG twice, verifying non-empty AVIF/WebP output and persistent cache hits on the second build. Run the complete release gate before assigning a package version:

```bash
pnpm format:check
pnpm check
pnpm release:check
```

## Scope boundaries

The image pipeline transforms local public files only; it does not fetch remote URLs, automatically rewrite arbitrary HTML, delete source assets, or prove transfer compression, browser decode cost, CDN caching, or field Core Web Vitals. Use browser tooling and real-user monitoring to validate those factors on the deployed site.
