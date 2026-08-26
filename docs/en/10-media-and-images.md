# 10 — Media and Images

## The media pipeline

`@mohammedaydan/media` builds image variants at multiple widths and formats using a content-addressed cache. The showcase produces WebP and AVIF at widths 320 and 640 and records the output in a media manifest.

```ts
const result = await buildImageVariants({
  source: './public/hero.jpg',
  outputDir: './dist/client/images',
  widths: [320, 640],
  formats: ['webp', 'avif'],
  cacheDir: './.cache/nexis-media',
})
```

Read the installed declaration in `packages/media/src/index.ts` for the exact options in the version you use.

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

## Caching

The in-memory cache is fast but disappears after a process restart. `cacheDir` allows build results to be reused across processes. The cache must be disposable and should not be treated as source of truth.

Include source bytes, width, format, and transform settings in the cache key. If quality settings are not part of the key, a build may reuse an outdated result.

## Remote images

Do not turn a user-provided image URL into an unrestricted server-side fetch. Allow only HTTP(S), restrict hosts, enforce a maximum size and timeout, and control redirects. Treat server-side remote image fetching as an SSRF surface.

## OG images

`@mohammedaydan/og-image` creates an escaped SVG and rasterizes it to PNG during the build. Titles and descriptions are escaped before entering the SVG, and output filenames are content-addressed.

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
