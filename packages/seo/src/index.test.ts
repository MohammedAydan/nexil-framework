import { describe, expect, it } from 'vitest'
import { buildRobots, buildSitemap, normalizeSeo, renderHead } from './index'

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
  it('builds a sitemap with validated priorities', () => {
    expect(buildSitemap([{ url: 'https://example.test/', priority: 1 }])).toContain(
      '<priority>1.0</priority>',
    )
    expect(() => buildSitemap([{ url: 'https://example.test/', priority: 2 }])).toThrow(
      /between 0 and 1/,
    )
    expect(() => buildSitemap([{ url: '/relative', priority: 0.5 }])).toThrow(/absolute/)
    expect(() => buildSitemap([{ url: 'https://example.test/', priority: Number.NaN }])).toThrow(
      /between 0 and 1/,
    )
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
