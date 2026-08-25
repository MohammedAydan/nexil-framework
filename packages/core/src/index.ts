export type Serializable =
  string | number | boolean | null | Serializable[] | { readonly [key: string]: Serializable }

export type Child = RenderNode | string | number | boolean | null | undefined | Child[]

export interface ElementNode {
  readonly kind: 'element'
  readonly tag: string
  readonly props: Readonly<Record<string, unknown>>
  readonly children: readonly Child[]
}

export interface TextNode {
  readonly kind: 'text'
  readonly value: string
}

export type RenderNode = ElementNode | TextNode

export interface ComponentContext {
  readonly requestId?: string
}

export type Component<Props = Record<string, never>> = (
  props: Props,
  context?: ComponentContext,
) => Child | Promise<Child>

export function text(value: string | number): TextNode {
  return { kind: 'text', value: String(value) }
}

export function element(
  tag: string,
  props: Readonly<Record<string, unknown>> = {},
  ...children: Child[]
): ElementNode {
  if (!/^[a-z][a-z0-9-]*$/.test(tag)) {
    throw new TypeError(`Invalid HTML element name: ${tag}`)
  }

  return { kind: 'element', tag, props, children }
}

export function isSerializable(
  value: unknown,
  seen = new WeakSet<object>(),
): value is Serializable {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value !== 'object') return false
  if (seen.has(value)) return false
  seen.add(value)

  const prototype = Object.getPrototypeOf(value)
  const valid = Array.isArray(value)
    ? value.every((item) => isSerializable(item, seen))
    : prototype === Object.prototype || prototype === null
      ? Object.values(value as Record<string, unknown>).every((item) => isSerializable(item, seen))
      : false
  seen.delete(value)
  return valid
}

export interface RequestContext {
  readonly request: Request
  readonly id: string
  readonly values: Map<symbol, unknown>
}

export function createRequestContext(
  request: Request,
  id: string = crypto.randomUUID(),
): RequestContext {
  return { request, id, values: new Map() }
}

export function component<Props extends Record<string, unknown>>(
  fn: Component<Props>,
): Component<Props> {
  return fn
}

export { state, useState, computed, batch } from '@mohammedaydan/reactivity'
export type { Signal, ReadableSignal } from '@mohammedaydan/reactivity'
