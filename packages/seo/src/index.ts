export interface SeoMetadata {
  readonly title: string
  readonly description?: string
  readonly canonical?: string
  readonly image?: string
  readonly ogType?: string
  readonly noindex?: boolean
  readonly jsonLd?: Readonly<Record<string, unknown>>
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case '&':
        return '&amp;'
      case '<':
        return '&lt;'
      case '>':
        return '&gt;'
      case '"':
        return '&quot;'
      case "'":
        return '&#39;'
      default:
        return character
    }
  })
}

function safeJson(value: unknown): string {
  const serialized = JSON.stringify(value)
  if (serialized === undefined) throw new TypeError('JSON-LD value must be serializable.')
  return serialized.replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
}

function assertUrl(value: string, field: string, allowRelative = false): void {
  if (allowRelative && value.startsWith('/') && !value.startsWith('//')) return
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new TypeError(`${field} must be an absolute http(s) URL.`)
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new TypeError(`${field} must use http(s).`)
}

export function normalizeSeo(metadata: SeoMetadata): SeoMetadata {
  const title = metadata.title.trim()
  if (!title) throw new TypeError('SEO title is required and cannot be empty.')
  if (metadata.description !== undefined && metadata.description.trim().length === 0) {
    throw new TypeError('SEO description cannot be empty when provided.')
  }
  if (metadata.canonical !== undefined) assertUrl(metadata.canonical, 'canonical')
  if (metadata.image !== undefined) assertUrl(metadata.image, 'image', true)
  return { ...metadata, title }
}

export function renderHead(metadata: SeoMetadata): string {
  const normalized = normalizeSeo(metadata)
  const tags = [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(normalized.title)}</title>`,
  ]
  if (normalized.description)
    tags.push(`<meta name="description" content="${escapeHtml(normalized.description)}">`)
  if (normalized.canonical) {
    tags.push(`<link rel="canonical" href="${escapeHtml(normalized.canonical)}">`)
    tags.push(`<meta property="og:url" content="${escapeHtml(normalized.canonical)}">`)
  }

  tags.push(`<meta property="og:title" content="${escapeHtml(normalized.title)}">`)
  if (normalized.description)
    tags.push(`<meta property="og:description" content="${escapeHtml(normalized.description)}">`)
  if (normalized.image)
    tags.push(`<meta property="og:image" content="${escapeHtml(normalized.image)}">`)
  if (normalized.ogType)
    tags.push(`<meta property="og:type" content="${escapeHtml(normalized.ogType)}">`)

  tags.push(
    `<meta name="twitter:card" content="${normalized.image ? 'summary_large_image' : 'summary'}">`,
  )
  tags.push(`<meta name="twitter:title" content="${escapeHtml(normalized.title)}">`)
  if (normalized.description)
    tags.push(`<meta name="twitter:description" content="${escapeHtml(normalized.description)}">`)
  if (normalized.image)
    tags.push(`<meta name="twitter:image" content="${escapeHtml(normalized.image)}">`)
  if (normalized.noindex) tags.push('<meta name="robots" content="noindex">')
  if (normalized.jsonLd)
    tags.push(`<script type="application/ld+json">${safeJson(normalized.jsonLd)}</script>`)
  return tags.join('')
}

export interface SitemapAlternate {
  readonly hrefLang: string
  readonly href: string
}

export interface SitemapEntry {
  readonly url: string
  readonly lastModified?: string
  readonly changeFrequency?:
    'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never'
  readonly priority?: number
  readonly alternates?: readonly SitemapAlternate[]
  readonly images?: readonly string[]
}

export function buildSitemap(entries: readonly SitemapEntry[]): string {
  const urls = entries
    .map((entry) => {
      assertUrl(entry.url, 'sitemap URL')
      if (
        entry.priority !== undefined &&
        (!Number.isFinite(entry.priority) || entry.priority < 0 || entry.priority > 1)
      ) {
        throw new RangeError('Sitemap priority must be between 0 and 1.')
      }
      const fields = [`<loc>${escapeHtml(entry.url)}</loc>`]
      if (entry.lastModified) fields.push(`<lastmod>${escapeHtml(entry.lastModified)}</lastmod>`)
      if (entry.changeFrequency) fields.push(`<changefreq>${entry.changeFrequency}</changefreq>`)
      if (entry.priority !== undefined)
        fields.push(`<priority>${entry.priority.toFixed(1)}</priority>`)
      for (const alternate of entry.alternates ?? []) {
        if (!/^[a-zA-Z]{2,3}(?:-[a-zA-Z]{2,4})?$/.test(alternate.hrefLang))
          throw new TypeError('Sitemap hreflang values must be BCP-47-like language tags.')
        assertUrl(alternate.href, 'sitemap alternate URL')
        fields.push(
          `<xhtml:link rel="alternate" hreflang="${escapeHtml(alternate.hrefLang)}" href="${escapeHtml(alternate.href)}"/>`,
        )
      }
      for (const image of entry.images ?? []) {
        assertUrl(image, 'sitemap image URL', true)
        fields.push(`<image:image><image:loc>${escapeHtml(image)}</image:loc></image:image>`)
      }
      return `<url>${fields.join('')}</url>`
    })
    .join('')
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">${urls}</urlset>`
}

export function buildRobots(sitemapUrl: string, disallow: readonly string[] = []): string {
  assertUrl(sitemapUrl, 'sitemap URL')
  const lines = [
    'User-agent: *',
    ...disallow.map((path) => {
      if (/[\r\n]/.test(path)) throw new TypeError('Robots directives cannot contain newlines.')
      return `Disallow: ${path}`
    }),
    `Sitemap: ${sitemapUrl}`,
  ]
  return `${lines.join('\n')}\n`
}

export function deriveCanonical(origin: string, pathname: string): string {
  let base: URL
  try {
    base = new URL(origin)
  } catch {
    throw new TypeError('SEO site origin must be an absolute URL.')
  }
  if (!['http:', 'https:'].includes(base.protocol))
    throw new TypeError('SEO site origin must use http(s).')
  if (!pathname.startsWith('/') || pathname.startsWith('//'))
    throw new TypeError('SEO pathname must be local.')
  base.pathname = pathname || '/'
  base.search = ''
  base.hash = ''
  return base.href
}

export function withCanonical(
  metadata: SeoMetadata,
  pathname: string,
  origin: string,
): SeoMetadata {
  return metadata.canonical
    ? metadata
    : { ...metadata, canonical: deriveCanonical(origin, pathname) }
}

const SCHEMA_TYPES = new Set([
  'Article',
  'BlogPosting',
  'BreadcrumbList',
  'Product',
  'TechArticle',
  'WebPage',
  'WebSite',
])

export interface JsonLdValidation {
  readonly valid: boolean
  readonly errors: readonly string[]
}

export interface FeedItem {
  readonly title: string
  readonly link: string
  readonly description?: string
  readonly pubDate?: string | Date
  readonly guid?: string
}

export interface FeedOptions {
  readonly title: string
  readonly link: string
  readonly description: string
  readonly feedUrl?: string
  readonly language?: string
  readonly updated?: string | Date
}

function feedDate(value: string | Date | undefined): string | undefined {
  if (value === undefined) return undefined
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) throw new TypeError('Feed dates must be valid dates.')
  return date.toUTCString()
}

export function generateFeed(items: readonly FeedItem[], options: FeedOptions): string {
  assertUrl(options.link, 'feed link')
  if (options.feedUrl !== undefined) assertUrl(options.feedUrl, 'feed URL')
  if (!options.title.trim() || !options.description.trim())
    throw new TypeError('Feed title and description are required.')
  const channel = [
    `<title>${escapeHtml(options.title)}</title>`,
    `<link>${escapeHtml(options.link)}</link>`,
    `<description>${escapeHtml(options.description)}</description>`,
    options.language ? `<language>${escapeHtml(options.language)}</language>` : '',
    options.feedUrl
      ? `<atom:link href="${escapeHtml(options.feedUrl)}" rel="self" type="application/rss+xml"/>`
      : '',
    feedDate(options.updated)
      ? `<lastBuildDate>${escapeHtml(feedDate(options.updated)!)}</lastBuildDate>`
      : '',
  ].join('')
  const entries = items
    .map((item) => {
      if (!item.title.trim()) throw new TypeError('Feed item titles are required.')
      assertUrl(item.link, 'feed item link')
      const date = feedDate(item.pubDate)
      const guid = item.guid ?? item.link
      return `<item><title>${escapeHtml(item.title)}</title><link>${escapeHtml(item.link)}</link><guid isPermaLink="${guid === item.link ? 'true' : 'false'}">${escapeHtml(guid)}</guid>${item.description ? `<description>${escapeHtml(item.description)}</description>` : ''}${date ? `<pubDate>${escapeHtml(date)}</pubDate>` : ''}</item>`
    })
    .join('')
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel>${channel}${entries}</channel></rss>`
}

export function generateAtomFeed(items: readonly FeedItem[], options: FeedOptions): string {
  assertUrl(options.link, 'feed link')
  const updated = feedDate(options.updated ?? items[0]?.pubDate) ?? new Date(0).toISOString()
  const entries = items
    .map((item) => {
      assertUrl(item.link, 'feed item link')
      const itemUpdated = feedDate(item.pubDate) ?? updated
      return `<entry><title>${escapeHtml(item.title)}</title><id>${escapeHtml(item.guid ?? item.link)}</id><link href="${escapeHtml(item.link)}"/><updated>${escapeHtml(new Date(itemUpdated).toISOString())}</updated>${item.description ? `<summary>${escapeHtml(item.description)}</summary>` : ''}</entry>`
    })
    .join('')
  return `<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom"><title>${escapeHtml(options.title)}</title><id>${escapeHtml(options.link)}</id><link href="${escapeHtml(options.link)}"/><updated>${escapeHtml(new Date(updated).toISOString())}</updated>${entries}</feed>`
}

export function deriveBreadcrumbList(pathname: string, origin: string): Record<string, unknown> {
  if (!pathname.startsWith('/') || pathname.startsWith('//'))
    throw new TypeError('Breadcrumb pathname must be local.')
  const segments = pathname.split('/').filter(Boolean)
  const items = [
    { '@type': 'ListItem', position: 1, name: 'Home', item: deriveCanonical(origin, '/') },
  ]
  segments.forEach((segment, index) => {
    const path = `/${segments.slice(0, index + 1).join('/')}`
    const name = decodeURIComponent(segment)
      .replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, (letter) => letter.toUpperCase())
    items.push({
      '@type': 'ListItem',
      position: index + 2,
      name,
      item: deriveCanonical(origin, path),
    })
  })
  return { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items }
}

export function validateJsonLd(value: unknown): JsonLdValidation {
  const errors: string[] = []
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { valid: false, errors: ['JSON-LD must be an object.'] }
  }
  const data = value as Record<string, unknown>
  if (data['@context'] !== 'https://schema.org' && data['@context'] !== 'http://schema.org')
    errors.push('JSON-LD @context must be schema.org.')
  if (typeof data['@type'] !== 'string' || !SCHEMA_TYPES.has(data['@type']))
    errors.push('JSON-LD @type is not a supported schema.org type.')
  if (
    data['@type'] !== 'BreadcrumbList' &&
    (typeof data.name !== 'string' || data.name.trim().length === 0)
  )
    errors.push('JSON-LD name is required.')
  if (data['@type'] === 'BreadcrumbList' && !Array.isArray(data.itemListElement))
    errors.push('BreadcrumbList itemListElement is required.')
  if (data['@type'] === 'Article' || data['@type'] === 'BlogPosting') {
    if (typeof data.headline !== 'string' || data.headline.trim().length === 0)
      errors.push(`${data['@type']} headline is required.`)
    if (typeof data.datePublished !== 'string' || data.datePublished.trim().length === 0)
      errors.push(`${data['@type']} datePublished is required.`)
  }
  return { valid: errors.length === 0, errors }
}
