import { describe, expect, it } from 'vitest'
import {
  buildRobots,
  buildSitemap,
  deriveBreadcrumbList,
  generateAtomFeed,
  generateFeed,
  deriveCanonical,
  normalizeSeo,
  renderHead,
  validateJsonLd,
  withCanonical,
} from './index'

describe('SEO metadata', () => {
  it('requires a non-empty title', () => {
    expect(() => normalizeSeo({ title: '   ' })).toThrow(/required/)
  })

  it('renders escaped metadata and JSON-LD safely', () => {
    const head = renderHead({
      title: '<Product>',
      description: 'A "safe" product',
      jsonLd: { '@type': 'Product', name: '</script><script>alert(1)</script>' },
    })
    expect(head).toContain('&lt;Product&gt;')
    expect(head).toContain('<meta property="og:title" content="&lt;Product&gt;">')
    expect(head).toContain('<meta property="og:description" content="A &quot;safe&quot; product">')
    expect(head).toContain('<meta name="twitter:card" content="summary">')
    expect(head).toContain('<meta name="twitter:title" content="&lt;Product&gt;">')
    expect(head).toContain('<meta name="twitter:description" content="A &quot;safe&quot; product">')
    expect(head).not.toContain('</script><script>alert(1)</script>')
  })

  it('emits a large Twitter card when an image is present', () => {
    const head = renderHead({ title: 'Home', image: '/social.png' })
    expect(head).toContain('<meta name="twitter:card" content="summary_large_image">')
    expect(head).toContain('<meta name="twitter:image" content="/social.png">')
  })

  it('applies title templates to document and social titles', () => {
    const head = renderHead({ title: 'Architecture', titleTemplate: '%s · Nexil' })
    expect(head).toContain('<title>Architecture · Nexil</title>')
    expect(head).toContain('property="og:title" content="Architecture · Nexil"')
  })

  it('emits an inherited OpenGraph site name', () => {
    expect(renderHead({ title: 'Docs', openGraph: { siteName: 'Nexil' } })).toContain(
      'property="og:site_name" content="Nexil"',
    )
  })

  it('preserves supported metadata extensions during normalization', () => {
    expect(normalizeSeo({ title: 'Docs', titleTemplate: '%s · Site' })).toMatchObject({
      titleTemplate: '%s · Site',
    })
  })

  it('rejects unsafe title template values', () => {
    expect(() => normalizeSeo({ title: 'Docs', titleTemplate: '<script>' })).toThrow(
      /template|metadata|unsafe/i,
    )
  })

  it('requires absolute HTTPS canonical URLs and emits og:url', () => {
    expect(() => normalizeSeo({ title: 'Home', canonical: '/home' })).toThrow(/absolute/)
    expect(() => normalizeSeo({ title: 'Home', canonical: '//evil.test/home' })).toThrow(/absolute/)
    expect(
      normalizeSeo({ title: 'Home', canonical: 'https://example.test/home' }).canonical,
    ).toContain('https://')
    expect(() => normalizeSeo({ title: 'Home', canonical: 'javascript:alert(1)' })).toThrow(/http/)
    expect(renderHead({ title: 'Home', canonical: 'https://example.test/home' })).toContain(
      'property="og:url"',
    )
  })
})

describe('SEO outputs', () => {
  it('builds a sitemap with validated priorities, alternates, and images', () => {
    const sitemap = buildSitemap([
      {
        url: 'https://example.test/',
        priority: 1,
        alternates: [{ hrefLang: 'en-US', href: 'https://example.test/' }],
        images: ['https://example.test/hero.png'],
      },
    ])
    expect(sitemap).toContain('<priority>1.0</priority>')
    expect(sitemap).toContain('hreflang="en-US"')
    expect(sitemap).toContain('<image:loc>https://example.test/hero.png</image:loc>')
    expect(() => buildSitemap([{ url: 'https://example.test/', priority: 2 }])).toThrow(
      /between 0 and 1/,
    )
    expect(() => buildSitemap([{ url: '/relative', priority: 0.5 }])).toThrow(/absolute/)
    expect(() => buildSitemap([{ url: 'https://example.test/', priority: Number.NaN }])).toThrow(
      /between 0 and 1/,
    )
    expect(() =>
      buildSitemap([
        {
          url: 'https://example.test/',
          alternates: [{ hrefLang: 'bad tag', href: 'https://example.test/' }],
        },
      ]),
    ).toThrow(/BCP-47/)
  })

  it('builds robots output with sitemap and disallow rules', () => {
    expect(buildRobots('https://example.test/sitemap.xml', ['/admin'])).toBe(
      'User-agent: *\nDisallow: /admin\nSitemap: https://example.test/sitemap.xml\n',
    )
    expect(() => buildRobots('https://example.test/sitemap.xml', ['/admin\nAllow: /'])).toThrow(
      /newlines/,
    )
  })
})

describe('SEO validation helpers', () => {
  it('generates escaped RSS and Atom feeds with stable identifiers', () => {
    const item = {
      title: 'A <story>',
      link: 'https://example.test/docs/a',
      description: 'Safe & useful',
      pubDate: '2026-01-02T03:04:05Z',
    }
    const rss = generateFeed([item], {
      title: 'Nexil',
      link: 'https://example.test/',
      description: 'Updates',
      feedUrl: 'https://example.test/feed.xml',
      updated: '2026-01-02T03:04:05Z',
    })
    expect(rss).toContain('<rss version="2.0"')
    expect(rss).toContain('&lt;story&gt;')
    expect(rss).toContain('isPermaLink="true"')
    expect(
      generateAtomFeed([item], {
        title: 'Nexil',
        link: 'https://example.test/',
        description: 'Updates',
      }),
    ).toContain('<feed xmlns="http://www.w3.org/2005/Atom">')
  })

  it('derives nested BreadcrumbList JSON-LD', () => {
    const breadcrumb = deriveBreadcrumbList('/docs/architecture', 'https://example.test')
    expect(breadcrumb).toMatchObject({ '@type': 'BreadcrumbList' })
    expect(breadcrumb.itemListElement).toHaveLength(3)
  })

  it('checks required Article properties without weakening existing types', () => {
    expect(
      validateJsonLd({ '@context': 'https://schema.org', '@type': 'Article', name: 'Post' }),
    ).toMatchObject({ valid: false })
    expect(
      validateJsonLd({
        '@context': 'https://schema.org',
        '@type': 'Article',
        name: 'Post',
        headline: 'Post',
        datePublished: '2026-01-02',
      }),
    ).toEqual({ valid: true, errors: [] })
  })

  it('derives canonical URLs from the resolved route path and preserves overrides', () => {
    expect(deriveCanonical('https://example.test', '/docs/architecture')).toBe(
      'https://example.test/docs/architecture',
    )
    expect(
      withCanonical({ title: 'Docs' }, '/docs/architecture', 'https://example.test').canonical,
    ).toBe('https://example.test/docs/architecture')
    expect(
      withCanonical(
        { title: 'Docs', canonical: 'https://override.test/docs' },
        '/docs/architecture',
        'https://example.test',
      ).canonical,
    ).toBe('https://override.test/docs')
  })

  it('validates supported schema.org JSON-LD types and rejects malformed documents', () => {
    expect(
      validateJsonLd({ '@context': 'https://schema.org', '@type': 'TechArticle', name: 'Docs' }),
    ).toEqual({ valid: true, errors: [] })
    expect(
      validateJsonLd({ '@context': 'https://schema.org', '@type': 'Unknown', name: '' }),
    ).toMatchObject({ valid: false })
  })
})
