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
      case '&': return '&amp;'
      case '<': return '&lt;'
      case '>': return '&gt;'
      case '"': return '&quot;'
      case "'": return '&#39;'
      default: return character
    }
  })
}

function safeJson(value: unknown): string {
  const serialized = JSON.stringify(value)
  if (serialized === undefined) throw new TypeError('JSON-LD value must be serializable.')
  return serialized.replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
}

function assertUrl(value: string, field: string): void {
  if (value.startsWith('/')) return
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol)) throw new TypeError(`${field} must use http(s).`)
}

export function normalizeSeo(metadata: SeoMetadata): SeoMetadata {
  const title = metadata.title.trim()
  if (!title) throw new TypeError('SEO title is required and cannot be empty.')
  if (metadata.description !== undefined && metadata.description.trim().length === 0) {
    throw new TypeError('SEO description cannot be empty when provided.')
  }
  if (metadata.canonical !== undefined) assertUrl(metadata.canonical, 'canonical')
  if (metadata.image !== undefined) assertUrl(metadata.image, 'image')
  return { ...metadata, title }
}

export function renderHead(metadata: SeoMetadata): string {
  const normalized = normalizeSeo(metadata)
  const tags = [`<title>${escapeHtml(normalized.title)}</title>`]
  if (normalized.description) tags.push(`<meta name="description" content="${escapeHtml(normalized.description)}">`)
  if (normalized.canonical) tags.push(`<link rel="canonical" href="${escapeHtml(normalized.canonical)}">`)
  if (normalized.image) tags.push(`<meta property="og:image" content="${escapeHtml(normalized.image)}">`)
  if (normalized.ogType) tags.push(`<meta property="og:type" content="${escapeHtml(normalized.ogType)}">`)
  if (normalized.noindex) tags.push('<meta name="robots" content="noindex">')
  if (normalized.jsonLd) tags.push(`<script type="application/ld+json">${safeJson(normalized.jsonLd)}</script>`)
  return tags.join('')
}

export interface SitemapEntry {
  readonly url: string
  readonly lastModified?: string
  readonly changeFrequency?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never'
  readonly priority?: number
}

export function buildSitemap(entries: readonly SitemapEntry[]): string {
  const urls = entries.map((entry) => {
    assertUrl(entry.url, 'sitemap URL')
    if (entry.priority !== undefined && (entry.priority < 0 || entry.priority > 1)) {
      throw new RangeError('Sitemap priority must be between 0 and 1.')
    }
    const fields = [`<loc>${escapeHtml(entry.url)}</loc>`]
    if (entry.lastModified) fields.push(`<lastmod>${escapeHtml(entry.lastModified)}</lastmod>`)
    if (entry.changeFrequency) fields.push(`<changefreq>${entry.changeFrequency}</changefreq>`)
    if (entry.priority !== undefined) fields.push(`<priority>${entry.priority.toFixed(1)}</priority>`)
    return `<url>${fields.join('')}</url>`
  }).join('')
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`
}

export function buildRobots(sitemapUrl: string, disallow: readonly string[] = []): string {
  assertUrl(sitemapUrl, 'sitemap URL')
  const lines = ['User-agent: *', ...(disallow.map((path) => `Disallow: ${path}`)), `Sitemap: ${sitemapUrl}`]
  return `${lines.join('\n')}\n`
}
