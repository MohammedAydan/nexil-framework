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
