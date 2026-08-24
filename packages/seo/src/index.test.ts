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
    expect(head).not.toContain('</script><script>alert(1)</script>')
  })

  it('accepts relative or HTTPS canonical URLs and rejects unsafe protocols', () => {
    expect(normalizeSeo({ title: 'Home', canonical: '/home' }).canonical).toBe('/home')
    expect(normalizeSeo({ title: 'Home', canonical: 'https://example.test/home' }).canonical).toContain('https://')
    expect(() => normalizeSeo({ title: 'Home', canonical: 'javascript:alert(1)' })).toThrow(/http/)
  })
})

describe('SEO outputs', () => {
  it('builds a sitemap with validated priorities', () => {
    expect(buildSitemap([{ url: 'https://example.test/', priority: 1 }])).toContain('<priority>1.0</priority>')
    expect(() => buildSitemap([{ url: 'https://example.test/', priority: 2 }])).toThrow(/between 0 and 1/)
  })

  it('builds robots output with sitemap and disallow rules', () => {
    expect(buildRobots('https://example.test/sitemap.xml', ['/admin'])).toBe(
      'User-agent: *\nDisallow: /admin\nSitemap: https://example.test/sitemap.xml\n',
    )
  })
})
