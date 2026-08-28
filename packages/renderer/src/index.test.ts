import { describe, expect, it } from 'vitest'
import { element, text } from '@nexis/core'
import { renderBindingMarker, renderToString } from './index'

describe('renderToString', () => {
  it('renders deterministic escaped HTML', () => {
    const tree = element('p', { title: 'a"b', 'data-id': '<x>' }, text('<safe>'))
    expect(renderToString(tree)).toBe('<p title="a&quot;b" data-id="&lt;x&gt;">&lt;safe&gt;</p>')
  })

  it('normalizes JSX styling props for SSR output', () => {
    const tree = element(
      'label',
      {
        className: 'font-semibold text-blue-600',
        htmlFor: 'email',
        style: { marginTop: 4, color: 'red' },
      },
      'Email',
    )
    expect(renderToString(tree)).toBe(
      '<label class="font-semibold text-blue-600" for="email" style="margin-top:4px;color:red;">Email</label>',
    )
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

  it('renders a safe SSR binding marker', () => {
    const marker = renderBindingMarker('nx:signal:counter', 'text')
    expect(marker).toBe('data-nx-bind="nx:signal:counter#text"')
    expect(
      renderToString(element('output', { 'data-nx-bind': 'nx:signal:counter#text' }, '0')),
    ).toBe('<output data-nx-bind="nx:signal:counter#text">0</output>')
  })

  it('rejects unsafe binding marker inputs while allowing supported targets', () => {
    expect(() => renderBindingMarker('nx:signal:../secret', 'text')).toThrow(/scope id/)
    expect(renderBindingMarker('nx:signal:counter', 'style')).toBe(
      'data-nx-bind="nx:signal:counter#style"',
    )
    expect(
      renderToString(element('output', { 'data-nx-bind': 'nx:signal:counter#style' }, '0')),
    ).toBe('<output data-nx-bind="nx:signal:counter#style">0</output>')
  })
})
