import { describe, expect, it } from 'vitest'
import { createRequestContext, element, isSerializable, text } from './index'

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
})

describe('serialization and request context', () => {
  it('accepts plain serializable data and rejects instances/functions', () => {
    expect(isSerializable({ count: 1, items: ['a', null] })).toBe(true)
    expect(isSerializable({ fn: () => undefined })).toBe(false)
    expect(isSerializable(new Date())).toBe(false)
  })

  it('creates independent request contexts', () => {
    const first = createRequestContext(new Request('https://example.test/one'), 'one')
    const second = createRequestContext(new Request('https://example.test/two'), 'two')
    first.values.set(Symbol('user'), 'first')
    expect(second.values.size).toBe(0)
    expect(first.id).not.toBe(second.id)
  })
})
