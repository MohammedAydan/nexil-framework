# Nexis next: static asset delivery inventory

> **Status: unreleased.** This document describes changes on `main` after the `v1.1.0` tag. It does not describe an installable package version until a later release is tagged and published.

## Static asset visibility in `nexis analyze`

`nexis analyze` now supplements its per-route JavaScript and CSS report with a static asset inventory from `dist/client`. It lists the number of non-HTML files, their total bytes, the image subtotal, and the five largest emitted assets.

```text
Static asset delivery
18 files  612.4 KiB total  430.1 KiB images
Largest assets:
  /hero.png  420.0 KiB  image  warning: consider AVIF/WebP variants, `sizes`, and lazy loading when below the fold
```

The build adds a non-blocking advisory to image files of 256 KiB or larger. The advisory directs developers toward responsive AVIF/WebP variants, an accurate `sizes` attribute, intrinsic dimensions, and lazy loading for non-critical images. It deliberately does not fail a build because content, viewport, LCP role, and CDN behavior determine whether a size is appropriate.

## Compatibility and verification

The build manifest keeps version `1`. The new `assets` field is optional, so artifacts created before this follow-up continue to be readable by the CLI. The existing route budget output remains unchanged; the asset section is appended after it.

Verification covers the CLI build and analysis flow with a 300 KiB public PNG fixture. The test asserts that the output and build manifest report the asset, its image byte total, and the advisory. Run the complete release gate before assigning a package version:

```bash
pnpm format:check
pnpm check
pnpm pack:check
```

## Scope boundaries

This feature inventories the **emitted build artifact** only. It does not measure transfer compression, responsive source selection, browser decode cost, CDN caching, or field Core Web Vitals. Use browser tooling and real-user monitoring to validate those factors on the deployed site.
