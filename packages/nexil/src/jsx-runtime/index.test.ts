import { describe, expect, it } from 'vitest'
import { state } from '../core/index.js'
import { Fragment, jsx, jsxDEV, jsxs } from './index.js'
import type { ElementNode } from '../core/index.js'

describe('@nexil/jsx-runtime', () => {
  it('creates an element AST node with jsx()', () => {
    const node = jsx('div', {
      id: 'test-box',
      class: 'container',
      children: 'Hello World',
    }) as ElementNode
    expect(node.kind).toBe('element')
    expect(node.tag).toBe('div')
    expect(node.props).toEqual({ id: 'test-box', class: 'container' })
    expect(node.children).toEqual(['Hello World'])
  })

  it('handles multiple children with jsxs()', () => {
    const node = jsxs('ul', {
      children: [jsx('li', { children: 'Item 1' }), jsx('li', { children: 'Item 2' })],
    }) as ElementNode
    expect(node.kind).toBe('element')
    expect(node.tag).toBe('ul')
    expect(node.children).toHaveLength(2)
  })

  it('renders components correctly', () => {
    const Component = (props: { title: string; count: number }) => {
      return jsx('h1', { children: `${props.title}: ${props.count}` })
    }

    const node = jsx(Component, { title: 'Counter', count: 42 }) as ElementNode
    expect(node.kind).toBe('element')
    expect(node.tag).toBe('h1')
    expect(node.children).toEqual(['Counter: 42'])
  })

  it('returns Fragment children as an array or primitive', () => {
    const child1 = jsx('span', { children: 'A' })
    const child2 = jsx('span', { children: 'B' })
    const frag = Fragment({ children: [child1, child2] })
    expect(Array.isArray(frag)).toBe(true)
    expect(frag).toEqual([child1, child2])

    const singleFrag = Fragment({ children: child1 })
    expect(singleFrag).toBe(child1)

    const emptyFrag = Fragment({})
    expect(emptyFrag).toBeNull()
  })

  it('supports reactive MaybeSignal attributes and resumable $ handlers', () => {
    const count = state(5)
    const handler = (event: MouseEvent) => {
      void event
    }

    const node = jsx('button', {
      type: 'button',
      disabled: () => count() > 10,
      onClick$: handler,
      'data-nx-bind': 'count',
      children: 'Click me',
    }) as ElementNode

    expect(node.kind).toBe('element')
    expect(node.tag).toBe('button')
    expect(typeof node.props.disabled).toBe('function')
    expect(node.props.onClick$).toBe(handler)
    expect(node.props['data-nx-bind']).toBe('count')
  })
})
