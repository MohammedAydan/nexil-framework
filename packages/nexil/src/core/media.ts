import { element } from './index.js'
import type { ElementNode } from './index.js'

function isIP(host: string): number {
  if (
    /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(
      host,
    )
  )
    return 4
  if (
    /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::1$|^::$|^([0-9a-fA-F]{1,4}:)+[0-9a-fA-F]{1,4}$/.test(
      host,
    )
  )
    return 6
  return 0
}

export interface ImageProps {
  readonly src: string
  readonly width: number
  readonly height: number
  readonly alt: string
  readonly priority?: boolean
  readonly sizes?: string
}

export interface PictureProps extends ImageProps {
  readonly widths?: readonly number[]
  readonly formats?: readonly ('avif' | 'webp')[]
  /** Use static files emitted by the optional Nexil build image pipeline instead of query URLs. */
  readonly staticVariants?: boolean
}

export interface PictureMarkup {
  readonly html: string
  readonly sources: readonly { readonly type: string; readonly srcset: string }[]
  readonly fallback: ImageAttributes
}

function escapeAttribute(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ??
      character,
  )
}

function staticImageSource(src: string): { readonly directory: string; readonly fileBase: string } {
  if (!src.startsWith('/') || src.startsWith('//'))
    throw new TypeError('Nexil Image src must be a local absolute path.')
  const suffix = [src.indexOf('?'), src.indexOf('#')].filter((index) => index >= 0).sort()[0]
  const pathname = suffix === undefined ? src : src.slice(0, suffix)
  const slash = pathname.lastIndexOf('/')
  const dot = pathname.lastIndexOf('.')
  if (dot <= slash + 1 || dot === pathname.length - 1)
    throw new TypeError('Nexil static image variants require a file extension.')
  const name = pathname.slice(slash + 1, dot).replace(/[^a-zA-Z0-9_-]/g, '-')
  const extension = pathname
    .slice(dot + 1)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
  if (!name || !extension)
    throw new TypeError('Nexil static image variants require a safe file name.')
  return { directory: pathname.slice(0, slash + 1), fileBase: `${name}-${extension}` }
}

/** Return the stable file base used by the Nexil static image build pipeline. */
export function imageVariantFileBase(src: string): string {
  return staticImageSource(src).fileBase
}

/** Return the static URL for an AVIF or WebP variant emitted by the Nexil image pipeline. */
export function staticImageVariantPath(
  src: string,
  width: number,
  format: 'avif' | 'webp',
): string {
  if (!Number.isInteger(width) || width < 1)
    throw new TypeError('Nexil static image variant width must be a positive integer.')
  const source = staticImageSource(src)
  return `${source.directory}${source.fileBase}-${width}.${format}`
}

function responsiveFallback(props: PictureProps, widths: readonly number[]): ImageAttributes {
  const fallback = imageAttributes(props, widths)
  if (!props.staticVariants) return fallback
  return {
    ...fallback,
    srcset: widths.map((width) => `${props.src} ${width}w`).join(', '),
  }
}

function responsiveSourceSet(
  props: PictureProps,
  widths: readonly number[],
  format: 'avif' | 'webp',
): string {
  return widths
    .map((width) => {
      const source = props.staticVariants
        ? staticImageVariantPath(props.src, width, format)
        : `${props.src}${props.src.includes('?') ? '&' : '?'}format=${format}&w=${width}`
      return `${source} ${width}w`
    })
    .join(', ')
}

export function pictureMarkup(props: PictureProps): PictureMarkup {
  const widths = [...(props.widths ?? [320, 640, 960, 1280])]
  const formats = [...(props.formats ?? ['avif', 'webp'])]
  const fallback = responsiveFallback(props, widths)
  const sources = formats.map((format) => ({
    type: `image/${format}`,
    srcset: responsiveSourceSet(props, widths, format),
  }))
  const sourceMarkup = sources
    .map(
      (source) =>
        `<source type="${source.type}" srcset="${escapeAttribute(source.srcset)}"${props.sizes ? ` sizes="${escapeAttribute(props.sizes)}"` : ''}>`,
    )
    .join('')
  const imageMarkup = `<img src="${escapeAttribute(fallback.src)}" srcset="${escapeAttribute(fallback.srcset)}" width="${fallback.width}" height="${fallback.height}" alt="${escapeAttribute(fallback.alt)}" loading="${fallback.loading}" decoding="async"${fallback.fetchpriority ? ' fetchpriority="high"' : ''}${fallback.sizes ? ` sizes="${escapeAttribute(fallback.sizes)}"` : ''}>`
  return { html: `<picture>${sourceMarkup}${imageMarkup}</picture>`, sources, fallback }
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
  widths: readonly number[] = [320, 640, 960, 1280, 1920],
): ImageAttributes {
  if (!props.src.startsWith('/') || props.src.startsWith('//'))
    throw new TypeError('Nexil Image src must be a local absolute path.')
  if (
    !Number.isInteger(props.width) ||
    props.width < 1 ||
    !Number.isInteger(props.height) ||
    props.height < 1
  ) {
    throw new TypeError('Nexil Image requires positive integer width and height.')
  }
  if (typeof props.alt !== 'string') throw new TypeError('Nexil Image requires an alt value.')
  const validWidths = widths.filter((width) => Number.isInteger(width) && width > 0)
  if (validWidths.length === 0)
    throw new TypeError('Nexil Image requires at least one valid responsive width.')

  const separator = props.src.includes('?') ? '&' : '?'
  const attributes: ImageAttributes = {
    src: props.src,
    srcset: validWidths.map((width) => `${props.src}${separator}w=${width} ${width}w`).join(', '),
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

export interface ImageComponentProps extends ImageProps {
  readonly widths?: readonly number[]
  readonly formats?: readonly ('avif' | 'webp')[]
  readonly staticVariants?: boolean
  readonly className?: string
}

/** Render a responsive picture element from one declarative JSX component. */
export function Image(props: ImageComponentProps): ElementNode {
  const widths = [...(props.widths ?? [320, 640, 960, 1280])]
  const formats = [...(props.formats ?? ['avif', 'webp'])]
  const fallback = responsiveFallback(props, widths)
  const sources = formats.map((format) =>
    element('source', {
      type: `image/${format}`,
      srcSet: responsiveSourceSet(props, widths, format),
      ...(props.sizes ? { sizes: props.sizes } : {}),
    }),
  )
  const image = element('img', {
    src: fallback.src,
    srcSet: fallback.srcset,
    width: fallback.width,
    height: fallback.height,
    alt: fallback.alt,
    loading: fallback.loading,
    decoding: fallback.decoding,
    ...(fallback.fetchpriority ? { fetchpriority: fallback.fetchpriority } : {}),
    ...(fallback.sizes ? { sizes: fallback.sizes } : {}),
    ...(props.className ? { className: props.className } : {}),
  })
  return element('picture', {}, ...sources, image)
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
  if (source.byteLength === 0) throw new TypeError('Nexil image source cannot be empty.')
  if (!/^[a-zA-Z0-9_-]+$/.test(fileBase)) throw new TypeError('Invalid image file base.')
  const sharpModule = await import('sharp')
  const sharp = (sharpModule.default ?? sharpModule) as typeof sharpModule.default
  const variants: ImageVariant[] = []
  for (const width of widths) {
    if (!Number.isInteger(width) || width < 1)
      throw new TypeError('Image variant widths must be positive integers.')
    for (const format of ['webp', 'avif'] as const) {
      const bytes =
        format === 'webp'
          ? await sharp(source).resize({ width, withoutEnlargement: true }).webp().toBuffer()
          : await sharp(source).resize({ width, withoutEnlargement: true }).avif().toBuffer()
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

function isPrivateHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true
  const version = isIP(host)
  if (version === 4) {
    const [first, second] = host.split('.').map(Number)
    return (
      first === 10 ||
      first === 127 ||
      (first === 172 && second !== undefined && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      first === 0 ||
      (first === 169 && second === 254)
    )
  }
  return (
    version === 6 &&
    (host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe8'))
  )
}

export async function downloadFont(
  url: string,
  allowedOrigins: readonly string[] = [],
): Promise<DownloadedFont> {
  const parsed = new URL(url)
  if (!['https:', 'http:'].includes(parsed.protocol))
    throw new TypeError('Font URL must use HTTP(S).')
  if (allowedOrigins.length === 0) throw new Error('Font URL requires at least one allowed origin.')
  if (!allowedOrigins.includes(parsed.origin)) {
    throw new Error(`Font origin is not allowlisted: ${parsed.origin}`)
  }
  if (isPrivateHost(parsed.hostname))
    throw new Error('Font URL cannot target a private network host.')
  const response = await fetch(parsed, { redirect: 'error', signal: AbortSignal.timeout(15_000) })
  if (!response.ok) throw new Error(`Font download failed with HTTP ${response.status}.`)
  const contentType = response.headers.get('content-type') ?? 'application/octet-stream'
  if (!/(font|woff|octet-stream)/i.test(contentType))
    throw new TypeError('Downloaded resource is not a font response.')
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.byteLength === 0 || bytes.byteLength > 5 * 1024 * 1024)
    throw new RangeError('Font must be between 1 byte and 5MB.')
  let fileName = parsed.pathname.split('/').pop() || 'font.woff2'
  try {
    fileName = decodeURIComponent(fileName)
  } catch {
    throw new TypeError('Font URL contains an invalid encoded filename.')
  }
  fileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
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
  if (!props.source.startsWith('/') || props.source.startsWith('//'))
    throw new TypeError('Nexil Font source must be a local absolute path.')
  if (
    props.weight.length === 0 ||
    props.weight.some((weight) => !Number.isInteger(weight) || weight < 1 || weight > 1000)
  ) {
    throw new TypeError('Font weights must be integers between 1 and 1000.')
  }
  const display = props.display ?? 'swap'
  return props.weight
    .map(
      (weight) =>
        `@font-face{font-family:"${props.family}";font-style:normal;font-weight:${weight};font-display:${display};src:url("${props.source}") format("woff2");}`,
    )
    .join('')
}

export interface BuildImageOptions {
  readonly sourcePath: string
  readonly outputDir: string
  readonly fileBase: string
  readonly widths?: readonly number[]
  readonly cacheDir?: string
}

export interface BuiltImageVariant {
  readonly format: 'webp' | 'avif'
  readonly width: number
  readonly fileName: string
  readonly bytes: number
  readonly cacheHit: boolean
}

const imageBuildCache = new Map<string, readonly ImageVariant[]>()
let imageFallbackWarningShown = false

export async function buildImageVariants(
  options: BuildImageOptions,
): Promise<readonly BuiltImageVariant[]> {
  if (!/^[a-zA-Z0-9_-]+$/.test(options.fileBase)) throw new TypeError('Invalid image file base.')
  const { createHash } = await import('node:crypto')
  const { mkdir, readFile, writeFile } = await import('node:fs/promises')
  const { join } = await import('node:path')
  const widths = [...(options.widths ?? [320, 640, 960])]
  const source = new Uint8Array(await readFile(options.sourcePath))
  const key = createHash('sha256')
    .update(source)
    .update(options.fileBase)
    .update(JSON.stringify(widths))
    .digest('hex')
  const diskCacheDir = options.cacheDir
  const diskManifest = diskCacheDir ? join(diskCacheDir, `${key}.json`) : undefined
  let variants = imageBuildCache.get(key)
  let cacheHit = variants !== undefined
  if (!variants && diskManifest) {
    try {
      const cached = JSON.parse(await readFile(diskManifest, 'utf8')) as readonly {
        format: 'webp' | 'avif'
        width: number
        fileName: string
      }[]
      const cacheRoot = diskCacheDir
      if (!cacheRoot) throw new Error('Missing media cache directory.')
      const loaded = await Promise.all(
        cached.map(async (entry) => ({
          ...entry,
          bytes: new Uint8Array(await readFile(join(cacheRoot, entry.fileName))),
        })),
      )
      variants = loaded
      imageBuildCache.set(key, variants)
      cacheHit = true
    } catch {
      // A partial cache is discarded and rebuilt below.
    }
  }
  if (!variants) {
    try {
      variants = await transformImage(source, options.fileBase, widths)
      imageBuildCache.set(key, variants)
      if (diskCacheDir) {
        await mkdir(diskCacheDir, { recursive: true })
        await Promise.all(
          variants.map((variant) => writeFile(join(diskCacheDir, variant.fileName), variant.bytes)),
        )
        await writeFile(
          diskManifest!,
          JSON.stringify(
            variants.map(({ format, width, fileName }) => ({ format, width, fileName })),
          ),
        )
      }
    } catch (error) {
      if (!imageFallbackWarningShown) {
        console.warn(
          `[nexil/media] Image transform unavailable; keeping original asset. ${error instanceof Error ? error.message : String(error)}`,
        )
        imageFallbackWarningShown = true
      }
      return []
    }
  }
  await mkdir(options.outputDir, { recursive: true })
  const result: BuiltImageVariant[] = []
  for (const variant of variants) {
    await writeFile(join(options.outputDir, variant.fileName), variant.bytes)
    result.push({
      format: variant.format,
      width: variant.width,
      fileName: variant.fileName,
      bytes: variant.bytes.byteLength,
      cacheHit,
    })
  }
  return result
}

export function clearImageTransformCache(): void {
  imageBuildCache.clear()
}
