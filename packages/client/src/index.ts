import type { Serializable } from '@nexis/core'
import { isSerializable } from '@nexis/core'

export const RESUME_FORMAT_VERSION = 1 as const

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

export function serializeResumeState(state: unknown): string {
  if (!isSerializable(state)) {
    throw new TypeError(
      'Nexis resumability state must contain only serializable primitives, arrays, and plain objects.',
    )
  }

  const payload: ResumePayload = { version: RESUME_FORMAT_VERSION, state }
  return JSON.stringify(payload)
}

export function deserializeResumeState(serialized: string): Serializable {
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
    !isSerializable((payload as { state?: unknown }).state)
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
