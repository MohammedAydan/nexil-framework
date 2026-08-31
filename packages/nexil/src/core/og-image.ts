export interface OgImageOptions {
  readonly title: string
  readonly description: string
  readonly width?: number
  readonly height?: number
  readonly background?: string
  readonly foreground?: string
  readonly accent?: string
}

export interface GeneratedOgImage {
  readonly fileName: string
  readonly bytes: Uint8Array
  readonly cacheHit: boolean
  readonly svg: string
}

function escapeXml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character] ??
      character,
  )
}

function wrapText(value: string, maxLength: number): string[] {
  const words = value.trim().split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (next.length > maxLength && line) {
      lines.push(line)
      line = word
    } else line = next
  }
  if (line) lines.push(line)
  return lines.slice(0, 3)
}

export function renderOgImageSvg(options: OgImageOptions): string {
  const width = options.width ?? 1200
  const height = options.height ?? 630
  if (!Number.isInteger(width) || width < 320 || !Number.isInteger(height) || height < 160)
    throw new RangeError('OG image dimensions are too small or invalid.')
  if (!options.title.trim() || !options.description.trim())
    throw new TypeError('OG image title and description are required.')
  const background = options.background ?? '#08111f'
  const foreground = options.foreground ?? '#f4f7fb'
  const accent = options.accent ?? '#55e6c1'
  const title = escapeXml(options.title.trim())
  const description = wrapText(options.description, 62).map(escapeXml)
  const descriptionMarkup = description
    .map((line, index) => `<tspan x="72" dy="${index === 0 ? 0 : 38}">${line}</tspan>`)
    .join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${escapeXml(background)}"/><stop offset="1" stop-color="#132946"/></linearGradient></defs><rect width="${width}" height="${height}" fill="url(#g)"/><circle cx="1040" cy="130" r="190" fill="${escapeXml(accent)}" opacity=".14"/><path d="M72 118h150" stroke="${escapeXml(accent)}" stroke-width="8" stroke-linecap="round"/><text x="72" y="245" fill="${escapeXml(foreground)}" font-family="Arial, sans-serif" font-size="64" font-weight="700">${title}</text><text x="72" y="350" fill="${escapeXml(foreground)}" opacity=".82" font-family="Arial, sans-serif" font-size="30">${descriptionMarkup}</text><text x="72" y="560" fill="${escapeXml(accent)}" font-family="Arial, sans-serif" font-size="24" font-weight="700">NEXIL / HTML-FIRST WEB</text></svg>`
}

export async function generateOgImage(
  options: OgImageOptions,
  outputDir: string,
): Promise<GeneratedOgImage> {
  const { createHash } = await import('node:crypto')
  const { mkdir, readFile, writeFile } = await import('node:fs/promises')
  const { join } = await import('node:path')
  const svg = renderOgImageSvg(options)
  const hash = createHash('sha256').update(svg).digest('hex').slice(0, 24)
  const fileName = `${hash}.png`
  const outputPath = join(outputDir, fileName)
  try {
    const bytes = new Uint8Array(await readFile(outputPath))
    return { fileName, bytes, cacheHit: true, svg }
  } catch {
    await mkdir(outputDir, { recursive: true })
    const { default: sharp } = await import('sharp')
    const bytes = new Uint8Array(await sharp(Buffer.from(svg)).png().toBuffer())
    await writeFile(outputPath, bytes)
    return { fileName, bytes, cacheHit: false, svg }
  }
}
