import type { Serializable } from '@mohammedaydan/core'
import { isSerializable } from '@mohammedaydan/core'

export const RESUME_FORMAT_VERSION = 1 as const
export const MAX_RESUME_DEPTH = 8
export const MAX_RESUME_PAYLOAD_BYTES = 32 * 1024

export interface ResumePayload {
  readonly version: typeof RESUME_FORMAT_VERSION
  readonly state: Serializable
}

export interface HandlerReference {
  readonly chunk: string
  readonly exportName: string
}

export interface ResumeManifest {
  readonly handlers: Readonly<Record<string, HandlerReference>>
}

function isResumableValue(
  value: unknown,
  depth = 0,
  seen = new WeakSet<object>(),
): value is Serializable {
  if (depth > MAX_RESUME_DEPTH) return false
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value !== 'object') return false
  if (seen.has(value)) return false
  seen.add(value)
  const valid = Array.isArray(value)
    ? value.every((item) => isResumableValue(item, depth + 1, seen))
    : Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null
      ? Object.values(value as Record<string, unknown>).every((item) =>
          isResumableValue(item, depth + 1, seen),
        )
      : false
  seen.delete(value)
  return valid
}

function payloadSize(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

export function serializeResumeState(state: unknown): string {
  if (!isSerializable(state) || !isResumableValue(state)) {
    throw new TypeError(
      `Nexis resumability state must contain only serializable plain data with maximum depth ${MAX_RESUME_DEPTH}.`,
    )
  }

  const payload: ResumePayload = { version: RESUME_FORMAT_VERSION, state }
  const serialized = JSON.stringify(payload)
  if (payloadSize(serialized) > MAX_RESUME_PAYLOAD_BYTES) {
    throw new RangeError(`Nexis resumability payload exceeds ${MAX_RESUME_PAYLOAD_BYTES} bytes.`)
  }
  return serialized
}

export function deserializeResumeState(serialized: string): Serializable {
  if (payloadSize(serialized) > MAX_RESUME_PAYLOAD_BYTES) {
    throw new RangeError(`Nexis resumability payload exceeds ${MAX_RESUME_PAYLOAD_BYTES} bytes.`)
  }
  let payload: unknown
  try {
    payload = JSON.parse(serialized)
  } catch {
    throw new TypeError('Invalid Nexis resumability payload: expected JSON.')
  }

  if (
    typeof payload !== 'object' ||
    payload === null ||
    (payload as { version?: unknown }).version !== RESUME_FORMAT_VERSION ||
    !isSerializable((payload as { state?: unknown }).state) ||
    !isResumableValue((payload as { state?: unknown }).state)
  ) {
    throw new TypeError('Invalid or unsupported Nexis resumability payload.')
  }

  return (payload as ResumePayload).state
}

export function createHandlerReference(chunk: string, exportName: string): HandlerReference {
  if (!/^[a-zA-Z0-9_-]+\.js$/.test(chunk)) throw new TypeError('Invalid resumability chunk name.')
  if (!/^[a-zA-Z_$][\w$]*$/.test(exportName)) throw new TypeError('Invalid handler export name.')
  return { chunk, exportName }
}

export function createResumeAttribute(id: string, reference: HandlerReference): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new TypeError('Invalid resumability boundary id.')
  return `${id}:${reference.chunk}#${reference.exportName}`
}

export type ResumeImport = (chunk: string) => Promise<Record<string, unknown>>

interface MaterializedRef {
  readonly eventName: string
  readonly chunk: string
  readonly exportName: string
}

function parseHandlerAttribute(value: string, eventName?: string): MaterializedRef[] {
  const references: MaterializedRef[] = []
  let event = eventName ?? ''
  let list = value
  if (!eventName) {
    const separator = value.indexOf(':')
    if (separator < 1) return references
    event = value.slice(0, separator)
    list = value.slice(separator + 1)
  }
  if (!/^[a-z][a-z0-9-]*$/.test(event)) return references
  for (const part of list.split(';')) {
    const hashSeparator = part.indexOf('#')
    if (hashSeparator < 1) continue
    references.push({
      eventName: event,
      chunk: part.slice(0, hashSeparator),
      exportName: part.slice(hashSeparator + 1),
    })
  }
  return references
}

/**
 * Resolves a boundary's serialized ScopeRefs into live browser objects,
 * caching signal/store/action instances by reference ID so every boundary
 * that captures the same declaration shares one identity.
 */
function materializeScope(
  element: HTMLElement,
  cache: Map<string, unknown>,
): Record<string, unknown> {
  const raw = element.getAttribute('data-nx-scope')
  if (!raw) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return {}
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
  const scope: Record<string, unknown> = {}
  for (const [name, ref] of Object.entries(parsed as Record<string, ScopeRef>)) {
    if (!ref || typeof ref.kind !== 'string') continue
    if (ref.kind === 'value') {
      scope[name] = (ref as ScopeRefValue).data
      continue
    }
    if (ref.kind === 'unsupported') {
      console.warn('[nexis] unsupported scope:', (ref as ScopeRefUnsupported).reason)
      continue
    }
    const id = (ref as ScopeRefSignal | ScopeRefStore | ScopeRefAction).id
    let live = cache.get(id)
    if (!live) {
      if (ref.kind === 'signal') live = createSignal((ref as ScopeRefSignal).initial)
      else if (ref.kind === 'store') {
        const signal = createSignal((ref as ScopeRefStore).initial)
        live = {
          value: signal,
          snapshot: () => JSON.parse(JSON.stringify(signal())) as Serializable,
          set: (next: Serializable | ((previous: Serializable) => Serializable)) =>
            signal.set(next),
          dispose: () => signal.dispose(),
        }
      } else if (ref.kind === 'action') {
        const endpoint = (ref as ScopeRefAction).endpoint
        live = (input: unknown) =>
          fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(input),
          }).then((response) => response.json())
      }
      if (live) cache.set(id, live)
    }
    if (live) scope[name] = live
  }
  return scope
}

export function bootstrapResumability(
  root: Document | HTMLElement,
  load: ResumeImport,
): () => void {
  const listeners: Array<() => void> = []
  const cache = new Map<string, unknown>()
  const bound = new WeakMap<HTMLElement, Set<string>>()
  const attributePattern = /^data-nx-on(?:-([a-z][a-z0-9-]*))?$/
  for (const element of root.querySelectorAll<HTMLElement>('*')) {
    for (const attribute of Array.from(element.attributes)) {
      const match = attributePattern.exec(attribute.name)
      if (!match) continue
      for (const reference of parseHandlerAttribute(attribute.value, match[1])) {
        const key = `${reference.eventName}:${reference.chunk}#${reference.exportName}`
        const seen = bound.get(element) ?? new Set<string>()
        if (seen.has(key)) continue
        seen.add(key)
        bound.set(element, seen)
        const listener = async (event: Event) => {
          const module = await load(reference.chunk)
          const handler = module[reference.exportName]
          if (typeof handler !== 'function')
            throw new TypeError(`Missing resumable handler export: ${reference.exportName}`)
          await handler({
            element,
            event,
            scope: materializeScope(element, cache),
          })
        }
        element.addEventListener(reference.eventName, listener)
        listeners.push(() => element.removeEventListener(reference.eventName, listener))
      }
    }
  }
  return () => listeners.splice(0).forEach((dispose) => dispose())
}

export type ScopeRefKind = 'value' | 'signal' | 'store' | 'action' | 'unsupported'

export interface ScopeRefValue {
  readonly kind: 'value'
  readonly data: Serializable
}

export interface ScopeRefSignal {
  readonly kind: 'signal'
  readonly id: string
  readonly initial: Serializable
}

export interface ScopeRefStore {
  readonly kind: 'store'
  readonly id: string
  readonly initial: Serializable
}

export interface ScopeRefAction {
  readonly kind: 'action'
  readonly id: string
  readonly endpoint: string
}

export interface ScopeRefUnsupported {
  readonly kind: 'unsupported'
  readonly reason: string
}

export type ScopeRef =
  ScopeRefValue | ScopeRefSignal | ScopeRefStore | ScopeRefAction | ScopeRefUnsupported

export interface ScopeSignal<T extends Serializable = Serializable> {
  (): T
  readonly value: T
  set(next: T | ((previous: T) => T)): void
  subscribe(listener: () => void): () => void
  dispose(): void
}

export interface ScopeStore<T extends Serializable = Serializable> {
  readonly value: ScopeSignal<T>
  snapshot(): T
  set(next: T | ((previous: T) => T)): void
  dispose(): void
}

export interface ScopeRegistry {
  register(id: string, value: unknown, kind?: Exclude<ScopeRefKind, 'unsupported' | 'value'>): void
  resolve<T = unknown>(id: string): T | undefined
  dispose(id: string): boolean
  disposeAll(): void
  inspectScope(): ReadonlyArray<{ readonly id: string; readonly kind: ScopeRefKind }>
}

function assertScopeId(id: string): void {
  if (!/^[a-zA-Z0-9:_-]{1,160}$/.test(id)) throw new TypeError('Invalid Nexis scope ID.')
}

function stableHash(value: string): string {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function createScopeId(kind: ScopeRefKind, source: string): string {
  if (!/^[a-zA-Z0-9:_-]+$/.test(kind)) throw new TypeError('Invalid scope kind.')
  if (!source || source.length > 512) throw new TypeError('Invalid scope source.')
  return `nx:${kind}:${stableHash(source)}`
}

function assertSupportedScopeValue(value: unknown): asserts value is Serializable {
  if (!isSerializable(value) || !isResumableValue(value)) {
    throw new TypeError(
      'Nexis scope capture supports only serializable plain values, signals, stores, and actions.',
    )
  }
}

function createSignal<T extends Serializable>(initial: T): ScopeSignal<T> {
  let current = initial
  let disposed = false
  const listeners = new Set<() => void>()
  const signal = (() => {
    if (disposed) throw new Error('Nexis scope signal has been disposed.')
    return current
  }) as ScopeSignal<T>
  Object.defineProperty(signal, 'value', { enumerable: true, get: () => signal() })
  signal.set = (next) => {
    if (disposed) throw new Error('Nexis scope signal has been disposed.')
    const resolved = typeof next === 'function' ? (next as (previous: T) => T)(current) : next
    assertSupportedScopeValue(resolved)
    if (Object.is(current, resolved)) return
    current = resolved
    for (const listener of [...listeners]) listener()
  }
  signal.subscribe = (listener) => {
    if (disposed) return () => undefined
    listeners.add(listener)
    return () => listeners.delete(listener)
  }
  signal.dispose = () => {
    disposed = true
    listeners.clear()
  }
  return signal
}

export function createScopeRegistry(): ScopeRegistry {
  const entries = new Map<string, { readonly kind: ScopeRefKind; readonly value: unknown }>()
  return {
    register(id, value, kind = 'signal') {
      assertScopeId(id)
      if (
        kind === 'signal' &&
        (typeof value !== 'function' || typeof (value as { set?: unknown }).set !== 'function')
      )
        throw new TypeError('Nexis signal scope values must be callable signals.')
      if (
        kind === 'store' &&
        (!value ||
          typeof value !== 'object' ||
          typeof (value as { value?: unknown }).value !== 'function')
      )
        throw new TypeError('Nexis store scope values must expose a signal value.')
      if (kind === 'action' && typeof value !== 'function')
        throw new TypeError('Nexis action scope values must be callable.')
      const previous = entries.get(id)
      if (previous && typeof (previous.value as { dispose?: unknown }).dispose === 'function') {
        ;(previous.value as { dispose: () => void }).dispose()
      }
      entries.set(id, { kind, value })
    },
    resolve(id) {
      assertScopeId(id)
      return entries.get(id)?.value as unknown as any
    },
    dispose(id) {
      assertScopeId(id)
      const entry = entries.get(id)
      if (!entry) return false
      if (typeof (entry.value as { dispose?: unknown }).dispose === 'function') {
        ;(entry.value as { dispose: () => void }).dispose()
      }
      entries.delete(id)
      return true
    },
    disposeAll() {
      for (const id of entries.keys()) this.dispose(id)
    },
    inspectScope() {
      return [...entries].map(([id, entry]) => ({ id, kind: entry.kind }))
    },
  }
}

const globalScopeRegistry = createScopeRegistry()

export function getScopeRegistry(): ScopeRegistry {
  return globalScopeRegistry
}

export function registerScopeSignal<T extends Serializable>(
  id: string,
  initial: T,
): ScopeSignal<T> {
  const signal = createSignal(initial)
  globalScopeRegistry.register(id, signal, 'signal')
  return signal
}

export function registerScopeStore<T extends Serializable>(id: string, initial: T): ScopeStore<T> {
  const store: ScopeStore<T> = {
    value: createSignal(initial),
    snapshot: () => JSON.parse(JSON.stringify(store.value())) as T,
    set: (next) => store.value.set(next),
    dispose: () => store.value.dispose(),
  }
  globalScopeRegistry.register(id, store, 'store')
  return store
}

export function registerScopeAction<Input, Output>(
  id: string,
  actionRef: (input: Input) => Promise<Output>,
): void {
  globalScopeRegistry.register(id, actionRef, 'action')
}

export function disposeScope(id: string): boolean {
  return globalScopeRegistry.dispose(id)
}

export function inspectScope(): ReadonlyArray<{
  readonly id: string
  readonly kind: ScopeRefKind
}> {
  return globalScopeRegistry.inspectScope()
}

export function serializeScopeRefs(refs: Readonly<Record<string, ScopeRef>>): string {
  for (const ref of Object.values(refs)) {
    if (ref.kind === 'value') assertSupportedScopeValue(ref.data)
    if (ref.kind === 'unsupported' && !ref.reason.trim())
      throw new TypeError('Unsupported Nexis scope captures require a reason.')
  }
  return JSON.stringify(refs)
}

export function deserializeScopeRefs(serialized: string): Readonly<Record<string, ScopeRef>> {
  let parsed: unknown
  try {
    parsed = JSON.parse(serialized)
  } catch {
    throw new TypeError('Invalid Nexis scope reference payload: expected JSON.')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new TypeError('Invalid Nexis scope reference payload.')
  for (const ref of Object.values(parsed as Record<string, ScopeRef>)) {
    if (
      !ref ||
      typeof ref !== 'object' ||
      !['value', 'signal', 'store', 'action', 'unsupported'].includes(ref.kind)
    )
      throw new TypeError('Invalid Nexis scope reference kind.')
  }
  return parsed as Readonly<Record<string, ScopeRef>>
}

export function resolveScopeRefs(
  refs: Readonly<Record<string, ScopeRef>>,
): Record<string, unknown> {
  const scope: Record<string, unknown> = {}
  for (const [name, ref] of Object.entries(refs)) {
    if (ref.kind === 'value') {
      assertSupportedScopeValue(ref.data)
      scope[name] = ref.data
      continue
    }
    if (ref.kind === 'unsupported') {
      if ((globalThis as { __NEXIS_DEV__?: boolean }).__NEXIS_DEV__ === true)
        throw new Error(`Unsupported Nexis scope capture: ${ref.reason}`)
      console.warn(`[nexis] Unsupported scope capture ignored: ${ref.reason}`)
      continue
    }
    scope[name] = globalScopeRegistry.resolve(ref.id)
  }
  return scope
}

export interface ActionCallError {
  readonly ok: false
  readonly errors: readonly string[]
}

export interface ActionCallSuccess<Output> {
  readonly ok: true
  readonly data: Output
}

export type ActionCallResult<Output> = ActionCallSuccess<Output> | ActionCallError

export async function callAction<Input, Output>(
  actionRef: { readonly endpoint: string } | string,
  input: Input,
  options: { readonly fetch?: typeof fetch; readonly idempotencyKey?: string } = {},
): Promise<ActionCallResult<Output>> {
  const endpoint = typeof actionRef === 'string' ? actionRef : actionRef.endpoint
  if (!endpoint.startsWith('/') || endpoint.startsWith('//'))
    throw new TypeError('Action endpoint must be local.')
  const request = options.fetch ?? fetch
  const response = await request(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(options.idempotencyKey ? { 'Idempotency-Key': options.idempotencyKey } : {}),
    },
    body: JSON.stringify(input),
  })
  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    return { ok: false, errors: [`Action endpoint returned HTTP ${response.status}.`] }
  }
  if (!response.ok || !payload || typeof payload !== 'object')
    return { ok: false, errors: [`Action endpoint returned HTTP ${response.status}.`] }
  return payload as ActionCallResult<Output>
}
