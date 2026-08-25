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

export interface SitemapEntry {
  readonly url: string
  readonly lastModified?: string
  readonly changeFrequency?:
    'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never'
  readonly priority?: number
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
      return `<url>${fields.join('')}</url>`
    })
    .join('')
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`
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
  if (typeof data.name !== 'string' || data.name.trim().length === 0)
    errors.push('JSON-LD name is required.')
  return { valid: errors.length === 0, errors }
}
