import { describe, expect, it } from 'vitest'
import { element, state, computed, text } from '../core/index.js'
import {
  normalizeClass,
  renderBindingMarker,
  renderStyle,
  renderToString,
  unwrapSignalValue,
} from './renderer.js'

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

  it('omits in-memory event-handler attributes from SSR output', () => {
    const tree = element('button', { onClick: 'alert(1)', disabled: true }, 'Open')
    expect(renderToString(tree)).toBe('<button disabled>Open</button>')
  })

  it('serializes resumable $ event handlers into data-nx-on-* attributes', () => {
    const tree = element(
      'button',
      {
        onClick$: 'chunk_abc123.js#handleClick',
        onInput$: () => {},
        onSubmit$: true,
      },
      'Action',
    )
    expect(renderToString(tree)).toBe(
      '<button data-nx-on-click="chunk_abc123.js#handleClick" data-nx-on-input="true" data-nx-on-submit="true">Action</button>',
    )
  })

  it('unwraps Signal values in SSR attributes and content', () => {
    const count = state(10)
    const active = state(true)
    const title = computed(() => `Item count: ${count()}`)

    const tree = element(
      'div',
      {
        id: 'counter',
        title: title,
        disabled: () => count() >= 10,
        class: { active, inactive: () => !active() },
      },
      () => `Count is ${count()}`,
    )

    expect(renderToString(tree)).toBe(
      '<div id="counter" title="Item count: 10" disabled class="active">Count is 10</div>',
    )
  })

  it('normalizes complex class arrays and boolean records', () => {
    const isPrimary = state(true)
    const isLarge = state(false)

    expect(
      normalizeClass([
        'btn',
        ['btn-group', null, undefined, false],
        { 'btn-primary': isPrimary, 'btn-lg': isLarge },
      ]),
    ).toBe('btn btn-group btn-primary')

    const tree = element(
      'button',
      {
        class: ['btn', { primary: true, disabled: false }],
        className: 'custom-btn',
      },
      'Submit',
    )
    expect(renderToString(tree)).toBe('<button class="btn primary custom-btn">Submit</button>')
  })

  it('normalizes style objects with unitless and CSS custom properties', () => {
    const opacity = state(0.85)
    expect(
      renderStyle({
        fontSize: 16,
        lineHeight: 1.5,
        opacity,
        '--brand-color': '#00ffcc',
        paddingTop: 8,
      }),
    ).toBe('font-size:16px;line-height:1.5;opacity:0.85;--brand-color:#00ffcc;padding-top:8px;')
  })

  it('renders SVG elements with proper attribute casing and namespaces', () => {
    const tree = element(
      'svg',
      {
        viewBox: '0 0 24 24',
        width: 24,
        height: 24,
        fill: 'none',
        xmlns: 'http://www.w3.org/2000/svg',
      },
      element('path', {
        d: 'M12 2L2 22h20L12 2z',
        stroke: 'currentColor',
        strokeWidth: 2,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
      }),
    )

    expect(renderToString(tree)).toBe(
      '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2L2 22h20L12 2z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg>',
    )
  })

  it('renders void elements without closing tags', () => {
    expect(renderToString(element('img', { src: '/hero.avif', alt: 'Hero' }))).toBe(
      '<img src="/hero.avif" alt="Hero">',
    )
    expect(renderToString(element('input', { type: 'text', name: 'search', required: true }))).toBe(
      '<input type="text" name="search" required>',
    )
    expect(renderToString(element('br', {}))).toBe('<br>')
    expect(renderToString(element('hr', {}))).toBe('<hr>')
  })

  it('renders nested arrays and ignores empty children', () => {
    expect(renderToString(['a', null, ['b', false, element('strong', {}, 'c')]])).toBe(
      'ab<strong>c</strong>',
    )
  })

  it('sanitizes unsafe URLs to prevent XSS injection', () => {
    const dangerousA = element('a', { href: 'javascript:alert(1)' }, 'Click')
    expect(renderToString(dangerousA)).toBe('<a>Click</a>')

    const dangerousImg = element('img', { src: 'data:text/html,<script>alert(1)</script>' })
    expect(renderToString(dangerousImg)).toBe('<img>')

    const safeA = element('a', { href: 'https://example.com' }, 'Safe')
    expect(renderToString(safeA)).toBe('<a href="https://example.com">Safe</a>')
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
