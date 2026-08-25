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

export function bootstrapResumability(
  root: Document | HTMLElement,
  load: ResumeImport,
): () => void {
  const listeners: Array<() => void> = []
  const elements = new Set<HTMLElement>()
  for (const element of root.querySelectorAll<HTMLElement>('[data-nx-on], [data-nx-on-click]'))
    elements.add(element)

  for (const element of elements) {
    const unified = element.getAttribute('data-nx-on')
    const legacy = element.getAttribute('data-nx-on-click')
    const separator = unified?.indexOf(':') ?? -1
    const eventName = separator > 0 ? unified!.slice(0, separator) : 'click'
    const attribute = separator > 0 ? unified!.slice(separator + 1) : legacy
    if (!attribute) continue
    const hashSeparator = attribute.indexOf('#')
    if (hashSeparator < 1) continue
    const chunk = attribute.slice(0, hashSeparator)
    const exportName = attribute.slice(hashSeparator + 1)
    const listener = async (event: Event) => {
      const module = await load(chunk)
      const handler = module[exportName]
      if (typeof handler !== 'function')
        throw new TypeError(`Missing resumable handler export: ${exportName}`)
      await handler({ element, event })
    }
    element.addEventListener(eventName, listener)
    listeners.push(() => element.removeEventListener(eventName, listener))
  }
  return () => listeners.splice(0).forEach((dispose) => dispose())
}
