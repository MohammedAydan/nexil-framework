import { describe, expect, it, vi } from 'vitest'
import {
  buildImageVariants,
  clearImageTransformCache,
  fontFace,
  imageAttributes,
  selfHostFont,
  transformImage,
} from './index'

describe('imageAttributes', () => {
  it('creates responsive, lazy image attributes with stable dimensions', () => {
    expect(
      imageAttributes({ src: '/hero.jpg', width: 1200, height: 630, alt: 'Hero' }, [640]),
    ).toEqual({
      src: '/hero.jpg',
      srcset: '/hero.jpg?w=640 640w',
      width: 1200,
      height: 630,
      alt: 'Hero',
      loading: 'lazy',
      decoding: 'async',
    })
  })

  it('requires local source and dimensions while allowing decorative empty alt text', () => {
    expect(() =>
      imageAttributes({ src: 'https://cdn.test/a.jpg', width: 1, height: 1, alt: 'A' }),
    ).toThrow(/local/)
    expect(() => imageAttributes({ src: '/a.jpg', width: 0, height: 1, alt: 'A' })).toThrow(
      /positive/,
    )
    expect(imageAttributes({ src: '/a.jpg', width: 1, height: 1, alt: '' }).alt).toBe('')
  })
})

describe('image pipeline', () => {
  it('generates WebP and AVIF variants at requested widths', async () => {
    const svg = new TextEncoder().encode(
      '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="red"/></svg>',
    )
    const variants = await transformImage(svg, 'hero', [20])
    expect(variants.map((variant) => variant.fileName)).toEqual(['hero-20.webp', 'hero-20.avif'])
    expect(variants.every((variant) => variant.bytes.byteLength > 0)).toBe(true)
  })
})

describe('fontFace', () => {
  it('creates a self-hosted woff2 declaration with swap by default', () => {
    expect(
      fontFace({ family: 'Inter', weight: [400, 600], source: '/fonts/inter.woff2' }),
    ).toContain('font-display:swap')
  })

  it('self-hosts an allowlisted font and returns preload metadata', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'font/woff2' } }),
      ),
    )
    const writes: Array<{ fileName: string; bytes: Uint8Array }> = []
    const result = await selfHostFont(
      'https://fonts.example.test/inter.woff2',
      async (fileName, bytes) => {
        writes.push({ fileName, bytes })
      },
      ['https://fonts.example.test'],
    )
    expect(result.preload.as).toBe('font')
    expect(result.preload.crossOrigin).toBe('anonymous')
    expect(writes[0]?.fileName).toBe('inter.woff2')
    vi.unstubAllGlobals()
  })

  it('rejects unsafe family names and invalid weights', () => {
    expect(() =>
      fontFace({ family: 'Inter; color:red', weight: [400], source: '/inter.woff2' }),
    ).toThrow(/family/)
    expect(() => fontFace({ family: 'Inter', weight: [0], source: '/inter.woff2' })).toThrow(
      /weights/,
    )
  })
})

describe('buildImageVariants', () => {
  it('writes variants and reports a cache hit on the second build', async () => {
    const { mkdtemp, readFile, rm, writeFile } = await import('node:fs/promises')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    clearImageTransformCache()
    const root = await mkdtemp(join(tmpdir(), 'nexis-media-'))
    const source = join(root, 'fixture.svg')
    const output = join(root, 'variants')
    await writeFile(
      source,
      '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="red"/></svg>',
    )
    try {
      const first = await buildImageVariants({
        sourcePath: source,
        outputDir: output,
        fileBase: 'fixture',
        widths: [20],
      })
      const second = await buildImageVariants({
        sourcePath: source,
        outputDir: output,
        fileBase: 'fixture',
        widths: [20],
      })
      expect(first).toHaveLength(2)
      expect(first.every((variant) => !variant.cacheHit)).toBe(true)
      expect(second.every((variant) => variant.cacheHit)).toBe(true)
      expect((await readFile(join(output, 'fixture-20.webp'))).byteLength).toBeGreaterThan(0)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
