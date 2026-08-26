import { describe, expect, it } from 'vitest'
import { cn, css, cx, extractStyle } from './index'

describe('cx', () => {
  it('exposes cn as a familiar alias', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4')
  })

  it('merges conditional utilities and resolves conflicting Tailwind classes', () => {
    expect(cx('px-2 text-sm', { 'text-lg': true, hidden: false }, ['text-red-500', 'px-4'])).toBe(
      'text-lg text-red-500 px-4',
    )
  })
})

describe('extractStyle', () => {
  it('produces deterministic class names independent of property order', () => {
    const first = extractStyle({ color: 'red', backgroundColor: 'white' })
    const second = extractStyle({ backgroundColor: 'white', color: 'red' })
    expect(first).toEqual(second)
    expect(first.cssText).toContain('.nx-')
    expect(first.cssText).toContain('background-color:white;')
  })

  it('omits undefined values', () => {
    expect(extractStyle({ color: undefined, marginTop: 4 }).cssText).toMatch(/margin-top:4px;/)
    expect(extractStyle({ color: undefined }).cssText).toMatch(/^\.nx-[\w]+\{\}$/)
    expect(extractStyle({ '--primaryColor': 'red' }).cssText).toContain('--primaryColor:red;')
  })

  it('supports pseudo-classes and responsive breakpoints', () => {
    const style = extractStyle({
      color: 'red',
      ':hover': { color: 'blue' },
      '@md': { fontSize: 18 },
    })
    expect(style.cssText).toContain(':hover{color:blue;}')
    expect(style.cssText).toContain('@media (min-width:768px)')
  })

  it('creates a deterministic class from a CSS template', () => {
    const style = css`
      padding: 4px;
      color: red;
    `
    expect(String(style)).toMatch(/^nx-/)
    expect(style.cssText).toContain(style.className)
  })
})
