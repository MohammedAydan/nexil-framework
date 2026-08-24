import type { Child, ElementNode } from '@nexis/core'
import { element, text } from '@nexis/core'

export function jsx(tag: string | ((props: Record<string, unknown>) => Child), props: Record<string, unknown> | null): Child {
  const normalized = props ?? {}
  const { children, ...attributes } = normalized
  const childList: Child[] = Array.isArray(children) ? (children as Child[]) : [children as Child]

  if (typeof tag === 'function') return tag(normalized)
  return element(tag, attributes, ...childList)
}

export const jsxs = jsx
export const Fragment = ({ children }: { children?: Child }): Child =>
  Array.isArray(children) ? children : children ?? null

export { text }
export type { ElementNode }
