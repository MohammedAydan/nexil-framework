import { describe, expect, it } from 'vitest'
import { element, text } from '@nexis/core'
import { renderToString } from './index'

describe('renderToString', () => {
  it('renders deterministic escaped HTML', () => {
    const tree = element('p', { title: 'a"b', 'data-id': '<x>' }, text('<safe>'))
    expect(renderToString(tree)).toBe('<p title="a&quot;b" data-id="&lt;x&gt;">&lt;safe&gt;</p>')
  })

  it('omits event-handler attributes from SSR output', () => {
    const tree = element('button', { onClick: 'alert(1)', disabled: true }, 'Open')
    expect(renderToString(tree)).toBe('<button disabled>Open</button>')
  })

  it('renders void elements without closing tags', () => {
    expect(renderToString(element('img', { src: '/hero.avif', alt: 'Hero' }))).toBe(
      '<img src="/hero.avif" alt="Hero">',
    )
  })

  it('renders nested arrays and ignores empty children', () => {
    expect(renderToString(['a', null, ['b', false, element('strong', {}, 'c')]])).toBe(
      'ab<strong>c</strong>',
    )
  })
})
