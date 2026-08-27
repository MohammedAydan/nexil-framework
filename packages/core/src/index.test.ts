import { describe, expect, it } from 'vitest'
import {
  createContext,
  createContextScope,
  createRequestContext,
  element,
  ErrorBoundary,
  For,
  Form,
  isSerializable,
  provideContext,
  Show,
  SubmitButton,
  Suspense,
  text,
} from './index'

describe('core nodes', () => {
  it('creates validated element and text nodes', () => {
    expect(element('h1', {}, text('Hello'))).toEqual({
      kind: 'element',
      tag: 'h1',
      props: {},
      children: [{ kind: 'text', value: 'Hello' }],
    })
  })

  it('rejects invalid element names', () => {
    expect(() => element('DIV!', {})).toThrow(/Invalid HTML element name/)
  })

  it('accepts camelCase SVG element names', () => {
    expect(element('foreignObject', {}).tag).toBe('foreignObject')
  })

  it('renders Show truthy and fallback branches', () => {
    expect(Show({ when: true, children: text('yes'), fallback: text('no') })).toEqual(text('yes'))
    expect(Show({ when: false, children: text('yes'), fallback: text('no') })).toEqual(text('no'))
  })

  it('renders For values and empty fallbacks', () => {
    expect(For({ each: [1, 2], children: (value) => text(String(value)) })).toHaveLength(2)
    expect(
      For({ each: [], children: (value: number) => text(String(value)), fallback: text('empty') }),
    ).toEqual(text('empty'))
  })

  it('scopes context values while rendering a provider', () => {
    const context = createContext('default')
    expect(context.useContext()).toBe('default')
    expect(
      context.Provider({ value: 'provided', children: () => text(context.useContext()) }),
    ).toEqual(text('provided'))
    expect(context.useContext()).toBe('default')
  })

  it('isolates explicit context scopes and supports concise reads without mutating parents', () => {
    const session = createContext('guest')
    const root = createContextScope()
    const alice = provideContext(root, session, 'alice')
    const bob = provideContext(root, session, 'bob')
    const nested = provideContext(alice, session, 'admin')
    expect(session.use(root)).toBe('guest')
    expect(session.use(alice)).toBe('alice')
    expect(session.useContext(bob)).toBe('bob')
    expect(session.use(nested)).toBe('admin')
    expect(session.use(alice)).toBe('alice')
    expect(
      session.Provider({
        scope: alice,
        value: 'owner',
        children: () => text(session.use()),
      }),
    ).toEqual(text('owner'))
    expect(session.use(alice)).toBe('alice')
  })

  it('rejects an async Provider child instead of leaking an implicit context across requests', () => {
    const session = createContext('guest')
    expect(() =>
      session.Provider({
        value: 'alice',
        children: (() => Promise.resolve(text('late'))) as unknown as () => ReturnType<typeof text>,
      }),
    ).toThrow(/synchronously/)
  })

  it('converts caught errors to a fallback child', () => {
    expect(
      ErrorBoundary({
        children: () => {
          throw new Error('boom')
        },
        fallback: (error) => text((error as Error).message),
      }),
    ).toEqual(text('boom'))
  })

  it('marks forms and submit buttons for progressive enhancement', () => {
    const form = Form({
      action: '/save',
      csrfToken: 'token',
      children: SubmitButton({ loadingText: 'Saving' }),
    })
    expect(form.props['data-nx-form']).toBe('progressive')
    expect(form.children[0]).toMatchObject({ props: { 'data-nx-loading-text': 'Saving' } })
  })

  it('creates validated Suspense boundary nodes', () => {
    expect(
      Suspense({ id: 'profile', fallback: text('loading'), children: text('ready') }),
    ).toMatchObject({ kind: 'suspense', id: 'profile' })
  })
})

describe('serialization and request context', () => {
  it('accepts plain serializable data and rejects instances/functions', () => {
    expect(isSerializable({ count: 1, optional: undefined, items: ['a', null] })).toBe(true)
    expect(isSerializable({ fn: () => undefined })).toBe(false)
    expect(isSerializable(new Date())).toBe(false)
  })

  it('creates independent request contexts', () => {
    const first = createRequestContext(new Request('https://example.test/one'), 'one')
    const second = createRequestContext(new Request('https://example.test/two'), 'two')
    first.values.set(Symbol('user'), 'first')
    first.values.set('request-id', 'first')
    expect(first.values.get('request-id')).toBe('first')
    expect(second.values.size).toBe(0)
    expect(first.id).not.toBe(second.id)
    expect(first.scope).not.toBe(second.scope)
  })
})
