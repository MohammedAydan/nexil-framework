# 11 — SEO and Metadata

## The page head

Use `renderHead` and the SEO helpers rather than writing inconsistent tags in every route. Every indexable page should have a meaningful title, description, and canonical URL.

```ts
const seo = {
  title: 'Nexis guide',
  description: 'A practical guide to building HTML-first pages.',
  canonical: 'https://example.com/docs/nexis',
  ogType: 'article',
  image: 'https://example.com/og/nexis.png',
}
```

Never point production canonicals to a temporary preview hostname.

## Titles, descriptions, and inheritance

Write a unique title and an accurate description for each route. Dynamic routes must not reuse one description blindly. A parent `_layout.*` may define `titleTemplate: '%s · Site'` and `openGraph.siteName`; child routes inherit those values and override only their own fields. The generated head resolves one effective metadata value per key.

```ts
// src/routes/_layout.tsx
export const seo = {
  title: 'Nexis App',
  titleTemplate: '%s · Nexis App',
  openGraph: { siteName: 'Nexis App' },
}
```

Use `noindex` for a deliberate indexing policy, not to hide broken content.

## Canonical URLs

`deriveCanonical(origin, pathname)` validates the origin and local pathname. Dynamic documentation pages should produce a different canonical for each real path.

```ts
const canonical = deriveCanonical('https://example.com', '/docs/architecture')
```

Reject `javascript:`, `data:`, and `vbscript:` URLs in links, images, redirects, and metadata. Dangerous-protocol scanning belongs in the acceptance gates.

## JSON-LD

Use `renderHead` or `validateJsonLd`. A valid object should contain `@context`, `@type`, and `name`, while supported types may require additional fields.

```ts
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  name: 'Article title',
  headline: 'Article title',
  datePublished: '2026-01-01',
}
```

Structured data must match visible content. Do not invent reviews, FAQs, or other rich-result data for ranking purposes.

## Breadcrumbs

`deriveBreadcrumbList('/docs/architecture', origin)` creates a BreadcrumbList from local path segments. Use it for nested pages and verify that every breadcrumb URL exists.

## Sitemap

`buildSitemap` accepts entries with URL, change frequency, priority, alternates, and image fields according to the current API. URLs must be absolute HTTP(S) URLs, alternates must be safe, and images must come from approved hosts.

Include only published routes. Do not add infinite query-string combinations, error pages, or user-specific paths.

## Robots

`buildRobots(sitemapUrl, disallow)` creates robots.txt. The sitemap URL should be canonical. Use disallow for administrative or temporary paths, but never treat robots as authorization or as a replacement for `noindex`.

## RSS and Atom

The CLI emits `feed.xml` and `atom.xml` from route records and feed metadata. Item titles and links must be valid, XML entities must be escaped, and dynamic pages should appear only after their static paths have been expanded.

```ts
const feed = generateFeed(items, {
  title: 'Recent updates',
  description: 'The latest site pages',
  link: 'https://example.com/',
  feedUrl: 'https://example.com/feed.xml',
  language: 'en',
})
```

## Open Graph and Twitter

Provide `og:title`, `og:description`, `og:url`, `og:image`, and `og:site_name` as appropriate, together with `twitter:card`. Structural tags such as charset and viewport are owned by the document builder and are deduplicated. The image must be an absolute URL accessible outside the developer’s machine.

## Hreflang

When localized versions exist, every alternate should point to a real page. Use `x-default` when appropriate and do not label an English page as Arabic or the reverse.

## SEO gates

Test every published route rather than one representative page:

| Check       | Requirement                                        |
| ----------- | -------------------------------------------------- |
| Title       | Present and unique                                 |
| Description | Present and non-empty                              |
| Canonical   | HTTPS and path-appropriate                         |
| Open Graph  | Title, URL, and image when applicable              |
| JSON-LD     | Context, type, name, and type-specific fields      |
| Sitemap     | Published routes only and no dangerous protocols   |
| Links       | No broken internal links                           |
| Head        | No duplicate structural or inherited metadata tags |
| Feeds       | Valid RSS and Atom                                 |
| Lighthouse  | Meets the configured gate                          |

A local Lighthouse result does not prove indexing or traffic. These are engineering measurements, not ranking evidence.
