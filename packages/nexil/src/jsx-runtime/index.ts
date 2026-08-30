import type { Child, ElementNode } from '../core/index.js'
import { element, text } from '../core/index.js'

export function jsx<P = Record<string, unknown>>(
  tag: string | ((props: P) => Child),
  props: P | null,
): Child {
  const normalized = (props ?? {}) as Record<string, unknown>
  const { children, ...attributes } = normalized
  const childList: Child[] = Array.isArray(children) ? (children as Child[]) : [children as Child]

  if (typeof tag === 'function') return tag(normalized as P)
  return element(tag, attributes, ...childList)
}

export const jsxs = jsx

export function jsxDEV<P = Record<string, unknown>>(
  tag: string | ((props: P) => Child),
  props: P | null,
): Child {
  return jsx(tag, props)
}

export const jsxsDEV = jsxDEV

export const Fragment = ({ children }: { children?: Child }): Child =>
  Array.isArray(children) ? children : (children ?? null)

export { text }
export type { ElementNode }
export * from './jsx.js'
