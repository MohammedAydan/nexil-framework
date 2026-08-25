# @mohammedaydan/og-image

Build-time Open Graph image generation for Nexis applications. `renderOgImageSvg` creates an escaped deterministic SVG card, while `generateOgImage` rasterizes it to PNG and stores it under a content-addressed filename. Reusing the same inputs returns a disk-cache hit without rerasterizing.

The package is intended for build pipelines, not client bundles. It does not fetch remote images or execute user-provided markup. Titles, descriptions, and colors are escaped before they enter the SVG document.
