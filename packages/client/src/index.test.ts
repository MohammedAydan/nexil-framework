import { describe, expect, it } from 'vitest'
import {
  createHandlerReference,
  createResumeAttribute,
  deserializeResumeState,
  serializeResumeState,
} from './index'

describe('resumability payloads', () => {
  it('round-trips versioned serializable state', () => {
    const serialized = serializeResumeState({ count: 2, open: false })
    expect(deserializeResumeState(serialized)).toEqual({ count: 2, open: false })
  })

  it('rejects functions and class instances', () => {
    expect(() => serializeResumeState({ callback: () => undefined })).toThrow(/serializable/)
    expect(() => serializeResumeState(new Date())).toThrow(/serializable/)
  })

  it('rejects malformed and unsupported payloads', () => {
    expect(() => deserializeResumeState('{"version":99,"state":null}')).toThrow(/unsupported/)
    expect(() => deserializeResumeState('not-json')).toThrow(/expected JSON/)
    expect(() => deserializeResumeState('x'.repeat(32 * 1024 + 1))).toThrow(/32.*bytes/)
  })

  it('rejects deep, oversized, and cyclic state payloads', () => {
    let deep: unknown = 'leaf'
    for (let index = 0; index < 9; index += 1) deep = { deep }
    expect(() => serializeResumeState(deep)).toThrow(/maximum depth 8/)
    expect(() => serializeResumeState({ value: 'x'.repeat(32 * 1024) })).toThrow(/32.*bytes/)
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    expect(() => serializeResumeState(cyclic)).toThrow(/serializable/)
  })
})

describe('handler references', () => {
  it('creates a safe attribute value', () => {
    const reference = createHandlerReference('chunk-a.js', 'increment')
    expect(createResumeAttribute('c1', reference)).toBe('c1:chunk-a.js#increment')
  })

  it('rejects unsafe identifiers', () => {
    expect(() => createHandlerReference('../secret.js', 'run')).toThrow(/chunk/)
    expect(() => createHandlerReference('chunk.js', 'run-me')).toThrow(/export/)
    expect(() => createResumeAttribute('c:1', { chunk: 'chunk.js', exportName: 'run' })).toThrow(
      /boundary/,
    )
  })
})
