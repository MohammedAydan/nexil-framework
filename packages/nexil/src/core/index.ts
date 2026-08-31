export type Serializable =
  | string
  | number
  | boolean
  | null
  | undefined
  | Serializable[]
  | { readonly [key: string]: Serializable }

export type Child =
  RenderNode | string | number | boolean | null | undefined | Child[] | (() => Child)

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
  /** Explicit request-owned context scope when an adapter supplies one. */
  readonly scope?: ContextScope
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
  /** Isolated dependency-injection values for this request only. */
  readonly scope: ContextScope
}

const CONTEXT_KEY = Symbol('nexil.context')

export interface ContextScope {
  readonly parent?: ContextScope
  readonly values: Map<string, unknown>
}

/** Create an explicit Context lifetime. Never reuse a request scope across requests. */
export function createContextScope(parent?: ContextScope): ContextScope {
  return { ...(parent ? { parent } : {}), values: new Map() }
}

export function createRequestContext(
  request: Request,
  id: string = typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
): RequestContext {
  const scope = createContextScope()
  scope.values.set('__nexil:request', true)
  return { request, id, values: new Map(), scope }
}

export function component<Props>(fn: Component<Props>): Component<Props> {
  return fn
}

function resolveChild(value: Child | (() => Child)): Child {
  return typeof value === 'function' ? value() : value
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return Boolean(
    value && typeof value === 'object' && typeof (value as { then?: unknown }).then === 'function',
  )
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
  readonly id: string
  readonly defaultValue: T
  readonly Provider: (props: {
    readonly value: T
    readonly children: Child | (() => Child)
    /** Parent request or component scope. Omit only for synchronous structural composition. */
    readonly scope?: ContextScope
  }) => Child
  readonly useContext: (scope?: ContextScope) => T
  /** Concise alias for useContext. */
  readonly use: (scope?: ContextScope) => T
}

type AlsStore = {
  getStore(): ContextScope | undefined
  run<T>(scope: ContextScope, fn: () => T): T
}

let alsInitialized = false
let contextAls: AlsStore | undefined

function getAls(): AlsStore | undefined {
  if (alsInitialized) return contextAls
  alsInitialized = true
  try {
    const proc = (
      globalThis as unknown as { process?: { getBuiltinModule?: (id: string) => unknown } }
    ).process
    if (proc?.getBuiltinModule) {
      const mod = proc.getBuiltinModule('node:async_hooks') as {
        AsyncLocalStorage?: new () => AlsStore
      }
      if (mod?.AsyncLocalStorage) {
        contextAls = new (mod.AsyncLocalStorage as unknown as new () => AlsStore)()
      }
      if (contextAls) return contextAls
    }
  } catch {}
  try {
    const maybeRequire = (globalThis as unknown as { require?: (id: string) => unknown }).require
    if (typeof maybeRequire === 'function') {
      const mod = maybeRequire('node:async_hooks') as { AsyncLocalStorage?: new () => AlsStore }
      if (mod?.AsyncLocalStorage) {
        contextAls = new (mod.AsyncLocalStorage as unknown as new () => AlsStore)()
      }
    }
  } catch {}
  return contextAls
}

const EXPLICIT_SCOPE_STACK_KEY = '__nexil:explicitScopeStack'

function getExplicitStack(): ContextScope[] {
  const g = globalThis as unknown as Record<string, unknown>
  if (!g[EXPLICIT_SCOPE_STACK_KEY]) g[EXPLICIT_SCOPE_STACK_KEY] = [] as ContextScope[]
  return g[EXPLICIT_SCOPE_STACK_KEY] as ContextScope[]
}

function getExplicitScope(): ContextScope | undefined {
  const stack = getExplicitStack()
  return stack[stack.length - 1]
}

export function getActiveScope(): ContextScope | undefined {
  const als = getAls()
  const s = als?.getStore()
  if (s) return s
  return getExplicitScope()
}

export function __resetAlsForTest(disable: boolean): void {
  if (disable) {
    contextAls = undefined
    alsInitialized = true
  } else {
    alsInitialized = false
    contextAls = undefined
    getAls()
  }
  const g = globalThis as unknown as Record<string, unknown>
  g[EXPLICIT_SCOPE_STACK_KEY] = []
}

export function runWithScope<T>(scope: ContextScope, fn: () => T): T {
  const als = getAls()
  if (als) {
    return als.run(scope, () => fn())
  }
  const stack = getExplicitStack()
  stack.push(scope)
  let result: T
  let didThrow = false
  try {
    result = fn()
  } catch (e) {
    didThrow = true
    stack.pop()
    throw e
  }
  if (!didThrow && isPromiseLike(result)) {
    return (result as unknown as Promise<T>).finally(() => {
      const idx = stack.lastIndexOf(scope)
      if (idx >= 0) stack.splice(idx, 1)
    }) as unknown as T
  }
  if (!didThrow) {
    stack.pop()
  }
  return result!
}

function readContextValue<T>(scope: ContextScope | undefined, id: string, fallback: T): T {
  for (let current = scope; current; current = current.parent) {
    if (current.values.has(id)) return current.values.get(id) as T
  }
  return fallback
}

export function provideContext<T>(
  scope: ContextScope,
  context: Context<T>,
  value: T,
): ContextScope {
  const next = createContextScope(scope)
  next.values.set(context.id, value)
  return next
}

export function withContext<T, Output>(
  scope: ContextScope,
  context: Context<T>,
  value: T,
  render: (scope: ContextScope) => Output,
): Output {
  return render(provideContext(scope, context, value))
}

interface ContextInternal<T> extends Context<T> {
  readonly [CONTEXT_KEY]: symbol
}

function deepResolve(child: Child): Child {
  if (typeof child === 'function') {
    const result = (child as () => Child)()
    if (isPromiseLike(result))
      throw new TypeError(
        'Context.Provider children must resolve synchronously; pass ContextScope explicitly to async work.',
      )
    return deepResolve(result as Child)
  }
  if (Array.isArray(child)) return child.map((entry) => deepResolve(entry as Child)) as Child
  if (child && typeof child === 'object' && 'kind' in child) {
    const node = child as RenderNode
    if (node.kind === 'element') {
      const elementNode = node as ElementNode
      return {
        ...elementNode,
        children: elementNode.children.map((entry) =>
          deepResolve(entry as Child),
        ) as readonly Child[],
      } as RenderNode as Child
    }
    if (node.kind === 'suspense') {
      const suspenseNode = node as SuspenseNode
      return {
        ...suspenseNode,
        fallback: deepResolve(suspenseNode.fallback),
      } as SuspenseNode as Child
    }
  }
  return child
}

function hashStr(s: string): string {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

let ctxCounter = 0
const stableContextRegistry = new Map<string, Context<unknown>>()

export function createContext<T>(defaultValue: T, stableId?: string): Context<T> {
  if (stableId) {
    const cached = stableContextRegistry.get(stableId)
    if (cached) return cached as Context<T>
  }
  const key = Symbol('nexil.context.value')
  const id =
    stableId ?? `nx:ctx:dyn:${hashStr(`${ctxCounter++}:${String(defaultValue).slice(0, 40)}`)}`
  const context: ContextInternal<T> = {
    [CONTEXT_KEY]: key,
    id,
    defaultValue,
    Provider: ({ value, children, scope }) => {
      const parent = scope ?? getActiveScope()
      const next = provideContext(parent ?? createContextScope(), context, value)
      const result = runWithScope(next, () => deepResolve(children as Child))
      if (isPromiseLike(result))
        throw new TypeError(
          'Context.Provider children must resolve synchronously; pass ContextScope explicitly to async work.',
        )
      return result as Child
    },
    useContext: (scope) => readContextValue(scope ?? getActiveScope(), id, defaultValue),
    use: (scope) => readContextValue(scope ?? getActiveScope(), id, defaultValue),
  }
  if (stableId) stableContextRegistry.set(stableId, context as unknown as Context<unknown>)
  return context
}

export function useContext<T>(context: Context<T>): T {
  return context.use()
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

export function Form({
  action,
  method = 'post',
  csrfToken,
  children,
  ...props
}: FormProps): ElementNode {
  const endpoint = typeof action === 'string' ? action : action.endpoint
  if (!endpoint || !endpoint.startsWith('/') || endpoint.startsWith('//'))
    throw new TypeError('Nexil Form action must be a local absolute path or action reference.')
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
} from './reactivity.js'
export type { Signal, ReadableSignal, Unsubscribe, Resource, SignalOptions } from './reactivity.js'

export * from './state.js'
export * from './css.js'
export * from './media.js'
export * from './og-image.js'
export * from './seo.js'
export * from './security.js'
export * from './telemetry.js'
