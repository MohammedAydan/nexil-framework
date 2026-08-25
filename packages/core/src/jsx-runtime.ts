import { element, type Child } from './index.js'

export function jsx(
  tag: string | ((props: Record<string, unknown>) => Child),
  props: Record<string, unknown> | null,
): Child {
  const normalized = props ?? {}
  const { children, ...attributes } = normalized
  const childList: Child[] = Array.isArray(children) ? (children as Child[]) : [children as Child]
  if (typeof tag === 'function') return tag(normalized)
  return element(tag, attributes, ...childList)
}

export const jsxs = jsx

export function jsxDEV(
  tag: string | ((props: Record<string, unknown>) => Child),
  props: Record<string, unknown> | null,
): Child {
  return jsx(tag, props)
}

export const jsxsDEV = jsxDEV

export const Fragment = ({ children }: { children?: Child }): Child =>
  Array.isArray(children) ? children : (children ?? null)

export namespace JSX {
  export type Element = Child
  export interface IntrinsicElements {
    [elementName: string]: Record<string, unknown>
  }
}
