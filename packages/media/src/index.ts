export interface ImageProps {
  readonly src: string
  readonly width: number
  readonly height: number
  readonly alt: string
  readonly priority?: boolean
  readonly sizes?: string
}

export interface ImageAttributes {
  readonly src: string
  readonly srcset: string
  readonly width: number
  readonly height: number
  readonly alt: string
  readonly loading: 'lazy' | 'eager'
  readonly decoding: 'async'
  readonly fetchpriority?: 'high'
  readonly sizes?: string
}

export function imageAttributes(
  props: ImageProps,
  widths = [320, 640, 960, 1280, 1920],
): ImageAttributes {
  if (!props.src.startsWith('/'))
    throw new TypeError('Nexis Image src must be a local absolute path.')
  if (
    !Number.isInteger(props.width) ||
    props.width < 1 ||
    !Number.isInteger(props.height) ||
    props.height < 1
  ) {
    throw new TypeError('Nexis Image requires positive integer width and height.')
  }
  if (!props.alt.trim()) throw new TypeError('Nexis Image requires a non-empty alt value.')
  const validWidths = widths.filter((width) => Number.isInteger(width) && width > 0)
  if (validWidths.length === 0)
    throw new TypeError('Nexis Image requires at least one valid responsive width.')

  const attributes: ImageAttributes = {
    src: props.src,
    srcset: validWidths.map((width) => `${props.src}?w=${width} ${width}w`).join(', '),
    width: props.width,
    height: props.height,
    alt: props.alt,
    loading: props.priority ? 'eager' : 'lazy',
    decoding: 'async',
    ...(props.priority ? { fetchpriority: 'high' } : {}),
    ...(props.sizes ? { sizes: props.sizes } : {}),
  }
  return attributes
}

export interface FontProps {
  readonly family: string
  readonly weight: readonly number[]
  readonly source: string
  readonly display?: 'auto' | 'block' | 'swap' | 'fallback' | 'optional'
  readonly preload?: boolean
}

export interface ImageVariant {
  readonly format: 'webp' | 'avif'
  readonly width: number
  readonly fileName: string
  readonly bytes: Uint8Array
}

export async function transformImage(
  source: Uint8Array,
  fileBase: string,
  widths = [320, 640, 960, 1280, 1920],
): Promise<readonly ImageVariant[]> {
  if (source.byteLength === 0) throw new TypeError('Nexis image source cannot be empty.')
  const sharpModule = await import('sharp')
  const variants: ImageVariant[] = []
  for (const width of widths) {
    if (!Number.isInteger(width) || width < 1)
      throw new TypeError('Image variant widths must be positive integers.')
    for (const format of ['webp', 'avif'] as const) {
      const bytes =
        format === 'webp'
          ? await sharpModule
              .default(source)
              .resize({ width, withoutEnlargement: true })
              .webp()
              .toBuffer()
          : await sharpModule
              .default(source)
              .resize({ width, withoutEnlargement: true })
              .avif()
              .toBuffer()
      variants.push({ format, width, fileName: `${fileBase}-${width}.${format}`, bytes })
    }
  }
  return variants
}

export interface DownloadedFont {
  readonly fileName: string
  readonly bytes: Uint8Array
  readonly contentType: string
}

export async function downloadFont(
  url: string,
  allowedOrigins: readonly string[] = [],
): Promise<DownloadedFont> {
  const parsed = new URL(url)
  if (!['https:', 'http:'].includes(parsed.protocol))
    throw new TypeError('Font URL must use HTTP(S).')
  if (allowedOrigins.length > 0 && !allowedOrigins.includes(parsed.origin)) {
    throw new Error(`Font origin is not allowlisted: ${parsed.origin}`)
  }
  const response = await fetch(parsed, { redirect: 'error' })
  if (!response.ok) throw new Error(`Font download failed with HTTP ${response.status}.`)
  const contentType = response.headers.get('content-type') ?? 'application/octet-stream'
  if (!/(font|woff|octet-stream)/i.test(contentType))
    throw new TypeError('Downloaded resource is not a font response.')
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.byteLength === 0 || bytes.byteLength > 5 * 1024 * 1024)
    throw new RangeError('Font must be between 1 byte and 5MB.')
  const fileName = decodeURIComponent(parsed.pathname.split('/').pop() || 'font.woff2').replace(
    /[^a-zA-Z0-9._-]/g,
    '_',
  )
  return { fileName, bytes, contentType }
}

export interface SelfHostedFont {
  readonly fileName: string
  readonly css: string
  readonly preload: {
    readonly rel: 'preload'
    readonly as: 'font'
    readonly href: string
    readonly type: string
    readonly crossOrigin: 'anonymous'
  }
}

export async function selfHostFont(
  url: string,
  write: (fileName: string, bytes: Uint8Array) => Promise<void>,
  allowedOrigins: readonly string[] = [],
): Promise<SelfHostedFont> {
  const downloaded = await downloadFont(url, allowedOrigins)
  await write(downloaded.fileName, downloaded.bytes)
  const href = `/${downloaded.fileName}`
  return {
    fileName: downloaded.fileName,
    css: `@font-face{font-family:custom;src:url("${href}") format("woff2");font-display:swap;}`,
    preload: {
      rel: 'preload',
      as: 'font',
      href,
      type: downloaded.contentType,
      crossOrigin: 'anonymous',
    },
  }
}

export function fontFace(props: FontProps): string {
  if (!/^[a-zA-Z0-9 _-]+$/.test(props.family)) throw new TypeError('Invalid font family name.')
  if (!props.source.startsWith('/'))
    throw new TypeError('Nexis Font source must be a local absolute path.')
  if (
    props.weight.length === 0 ||
    props.weight.some((weight) => !Number.isInteger(weight) || weight < 1 || weight > 1000)
  ) {
    throw new TypeError('Font weights must be integers between 1 and 1000.')
  }
  const display = props.display ?? 'swap'
  return `@font-face{font-family:"${props.family}";font-style:normal;font-weight:${props.weight.join(' ')};font-display:${display};src:url("${props.source}") format("woff2");}`
}
