export type Serializable =
  | string
  | number
  | boolean
  | null
  | undefined
  | Serializable[]
  | { readonly [key: string]: Serializable }

export type Child = RenderNode | string | number | boolean | null | undefined | Child[]
export type AsyncChild = Child | Promise<Child>

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

export interface SuspenseNode {
  readonly kind: 'suspense'
  readonly id: string
  readonly fallback: Child
  readonly content: AsyncChild
}

export type RenderNode = ElementNode | TextNode | SuspenseNode

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
  if (!/^[a-zA-Z][a-zA-Z0-9-]*$/.test(tag)) {
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
      ? Object.values(value as Record<string, unknown>).every(
          (item) => item === undefined || isSerializable(item, seen),
        )
      : false
  seen.delete(value)
  return valid
}

export interface RequestContext {
  readonly request: Request
  readonly id: string
  readonly values: Map<PropertyKey, unknown>
}

export function createRequestContext(
  request: Request,
  id: string = typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
): RequestContext {
  return { request, id, values: new Map() }
}

export function component<Props>(fn: Component<Props>): Component<Props> {
  return fn
}

function resolveChild(value: Child | (() => Child)): Child {
  return typeof value === 'function' ? value() : value
}

export interface ForProps<T> {
  readonly each: readonly T[] | (() => readonly T[])
  readonly children: (item: T, index: number) => Child
  readonly fallback?: Child | (() => Child)
}

/** Render a list from an array or signal-backed getter without requiring a virtual DOM. */
export function For<T>({ each, children, fallback }: ForProps<T>): Child {
  const values = typeof each === 'function' ? each() : each
  return values.length === 0
    ? fallback === undefined
      ? null
      : resolveChild(fallback)
    : values.map((item, index) => children(item, index))
}

export interface ShowProps<T> {
  readonly when: T | (() => T)
  readonly children: Child | (() => Child)
  readonly fallback?: Child | (() => Child)
}

/** Render the first branch when a value/getter is truthy, otherwise render the fallback. */
export function Show<T>({ when, children, fallback = null }: ShowProps<T>): Child {
  return Boolean(typeof when === 'function' ? (when as () => T)() : when)
    ? resolveChild(children)
    : resolveChild(fallback)
}

export interface Context<T> {
  readonly Provider: (props: {
    readonly value: T
    readonly children: Child | (() => Child)
  }) => Child
  readonly useContext: () => T
}

export function createContext<T>(defaultValue: T): Context<T> {
  const values: T[] = []
  return {
    Provider: ({ value, children }) => {
      values.push(value)
      try {
        return resolveChild(children)
      } finally {
        values.pop()
      }
    },
    useContext: () => values.at(-1) ?? defaultValue,
  }
}

export interface ErrorBoundaryProps {
  readonly children: Child | (() => Child)
  readonly fallback: Child | ((error: unknown) => Child)
}

export function ErrorBoundary({ children, fallback }: ErrorBoundaryProps): Child {
  try {
    return resolveChild(children)
  } catch (error) {
    return typeof fallback === 'function' ? fallback(error) : fallback
  }
}

let suspenseCounter = 0

export interface SuspenseProps {
  readonly fallback: Child
  readonly children: AsyncChild
  readonly id?: string
}

/** Mark an async subtree so streaming renderers can flush its fallback first. */
export function Suspense({ fallback, children, id }: SuspenseProps): SuspenseNode {
  const boundaryId = id ?? `suspense-${++suspenseCounter}`
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(boundaryId))
    throw new TypeError('Invalid Suspense boundary id.')
  return { kind: 'suspense', id: boundaryId, fallback, content: children }
}

export interface FormProps {
  readonly action: string | { readonly endpoint?: string }
  readonly method?: 'get' | 'post'
  readonly csrfToken?: string
  readonly children?: Child | readonly Child[]
  readonly [key: string]: unknown
}

/** Render a progressively-enhanced form; the native form remains usable without JavaScript. */
export function Form({
  action,
  method = 'post',
  csrfToken,
  children,
  ...props
}: FormProps): ElementNode {
  const endpoint = typeof action === 'string' ? action : action.endpoint
  if (!endpoint || !endpoint.startsWith('/') || endpoint.startsWith('//'))
    throw new TypeError('Nexis Form action must be a local absolute path or action reference.')
  const formChildren: Child[] =
    children === undefined
      ? []
      : Array.isArray(children)
        ? [...(children as readonly Child[])]
        : [children as Child]
  return element(
    'form',
    {
      ...props,
      action: endpoint,
      method,
      'data-nx-form': 'progressive',
      ...(csrfToken ? { 'data-nx-csrf': csrfToken } : {}),
    },
    ...formChildren,
  )
}

export function SubmitButton({
  children,
  loadingText,
  ...props
}: {
  readonly children?: Child
  readonly loadingText?: string
  readonly [key: string]: unknown
}): ElementNode {
  return element(
    'button',
    {
      ...props,
      type: 'submit',
      'data-nx-submit-button': 'true',
      ...(loadingText ? { 'data-nx-loading-text': loadingText } : {}),
    },
    ...(children === undefined ? [] : [children]),
  )
}

export {
  batch,
  computed,
  createRoot,
  effect,
  onCleanup,
  state,
  untrack,
  useState,
  resource,
  watch,
} from '@mohammedaydan/reactivity'
export type {
  Signal,
  ReadableSignal,
  Unsubscribe,
  Resource,
  SignalOptions,
} from '@mohammedaydan/reactivity'
