import { describe, expect, it } from 'vitest'
import { extractStyle } from './index'

describe('extractStyle', () => {
  it('produces deterministic class names independent of property order', () => {
    const first = extractStyle({ color: 'red', backgroundColor: 'white' })
    const second = extractStyle({ backgroundColor: 'white', color: 'red' })
    expect(first).toEqual(second)
    expect(first.cssText).toContain('.nx-')
    expect(first.cssText).toContain('background-color:white;')
  })

  it('omits undefined values', () => {
    expect(extractStyle({ color: undefined, marginTop: 4 }).cssText).toMatch(/margin-top:4;/)
    expect(extractStyle({ color: undefined }).cssText).toMatch(/^\.nx-[\w]+\{\}$/)
  })
})
