# 10 — Media and Images

## The media pipeline

`@nexil/media` builds image variants at multiple widths and formats using a content-addressed cache. Nexil can run this pipeline automatically for public PNG, JPEG, and SVG files during `nexil build`, but it remains opt-in so existing applications keep their current output until they choose it.

```ts
// nexil.config.ts
import { defineConfig } from '@nexil/serve'

export default defineConfig({
  media: {
    images: {
      transform: true,
      widths: [320, 640, 960, 1280],
      cacheDir: '.nexil/media-cache',
    },
  },
})
```

The build copies the original public file, emits AVIF and WebP variants beside it, persists reusable transform data beneath `.nexil/media-cache`, and writes `nexil-media.json` to both `dist/` and `dist/client/`. Add `.nexil/` to `.gitignore`; the cache is disposable and not a source artifact.

For `public/images/hero.jpg`, the generated variants include `/images/hero-jpg-320.avif`, `/images/hero-jpg-320.webp`, `/images/hero-jpg-640.avif`, and so on. The exact result and cache state appear in `nexil analyze`.

## Picture markup

Use `<picture>` with AVIF first, WebP second, and a fallback `<img>`. The image must have `alt`, explicit dimensions, or an equivalent aspect ratio to reduce layout shift.

```tsx
<picture>
  <source srcSet="/images/hero-640.avif" type="image/avif" />
  <source srcSet="/images/hero-640.webp" type="image/webp" />
  <img
    src="/images/hero-640.jpg"
    width="640"
    height="360"
    loading="lazy"
    alt="A precise description of the image"
  />
</picture>
```

Use `loading="eager"` and `fetchpriority="high"` only for the real LCP image. Do not make every image eager.

When using the build-generated static files, prefer the `Image` component with `staticVariants`. It uses the same stable file naming contract as `nexil build`:

```tsx
import { Image } from '@nexil/media'

export default function Hero() {
  return (
    <Image
      src="/images/hero.jpg"
      width={1280}
      height={720}
      alt="The product workspace"
      widths={[640, 960, 1280]}
      sizes="(max-width: 760px) 100vw, 56vw"
      priority
      staticVariants
    />
  )
}
```

`staticVariants` is explicit. It does not rewrite ordinary `<img>` or manually authored `<picture>` markup, so applications can adopt the pipeline route by route and retain control over fallbacks.

## Caching

The in-memory cache is fast but disappears after a process restart. `cacheDir` allows build results to be reused across processes. The cache must be disposable and should not be treated as source of truth.

Include source bytes, width, format, and transform settings in the cache key. If quality settings are not part of the key, a build may reuse an outdated result.

Nexil includes the source bytes, file base, and requested widths in its cache key. Delete `.nexil/media-cache` to force a full rebuild; do not deploy this cache directory.

## Remote images

Do not turn a user-provided image URL into an unrestricted server-side fetch. Allow only HTTP(S), restrict hosts, enforce a maximum size and timeout, and control redirects. Treat server-side remote image fetching as an SSRF surface.

## OG images

`@nexil/og-image` creates an escaped SVG and rasterizes it to PNG during the build. Titles and descriptions are escaped before entering the SVG, and output filenames are content-addressed.

```ts
const card = await generateOgImage({
  title: 'Page title',
  description: 'A concise description',
  outputDir: './dist/client/og',
})
```

Keep OG generation out of the client bundle. Do not expose a dynamic endpoint that accepts raw user SVG without sanitization.

## Alt text

Alt text is not a keyword field. Write what a user who cannot see the image needs to know. Decorative images use `alt=""`; informative images should communicate their information in the alternative text.

## Image-performance decisions

| Decision              | Recommendation                                      |
| --------------------- | --------------------------------------------------- |
| First visible image   | Explicit dimensions and preload only when justified |
| Below-the-fold images | Lazy loading                                        |
| Format                | AVIF, then WebP, then a fallback                    |
| Width                 | Do not send 2000px to a 320px viewport              |
| Caching               | Immutable names for fingerprinted assets            |
| Failure               | Clear fallback and a build warning                  |

## Verification

Check that each variant is non-empty, filenames are safe, MIME types are correct, the fallback exists, and pages without images do not reference missing files. Use Lighthouse to inspect LCP and CLS, but do not present lab results as real-user measurements.
