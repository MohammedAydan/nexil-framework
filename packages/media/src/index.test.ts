import { describe, expect, it } from 'vitest'
import { fontFace, imageAttributes } from './index'

describe('imageAttributes', () => {
  it('creates responsive, lazy image attributes with stable dimensions', () => {
    expect(imageAttributes({ src: '/hero.jpg', width: 1200, height: 630, alt: 'Hero' }, [640])).toEqual({
      src: '/hero.jpg',
      srcset: '/hero.jpg?w=640 640w',
      width: 1200,
      height: 630,
      alt: 'Hero',
      loading: 'lazy',
      decoding: 'async',
    })
  })

  it('requires local source, dimensions, and alt text', () => {
    expect(() => imageAttributes({ src: 'https://cdn.test/a.jpg', width: 1, height: 1, alt: 'A' })).toThrow(/local/)
    expect(() => imageAttributes({ src: '/a.jpg', width: 0, height: 1, alt: 'A' })).toThrow(/positive/)
    expect(() => imageAttributes({ src: '/a.jpg', width: 1, height: 1, alt: ' ' })).toThrow(/alt/)
  })
})

describe('fontFace', () => {
  it('creates a self-hosted woff2 declaration with swap by default', () => {
    expect(fontFace({ family: 'Inter', weight: [400, 600], source: '/fonts/inter.woff2' })).toContain(
      'font-display:swap',
    )
  })

  it('rejects unsafe family names and invalid weights', () => {
    expect(() => fontFace({ family: 'Inter; color:red', weight: [400], source: '/inter.woff2' })).toThrow(/family/)
    expect(() => fontFace({ family: 'Inter', weight: [0], source: '/inter.woff2' })).toThrow(/weights/)
  })
})
