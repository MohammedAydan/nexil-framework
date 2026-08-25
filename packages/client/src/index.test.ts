import { describe, expect, it } from 'vitest'
import {
  createHandlerReference,
  createResumeAttribute,
  createScopeId,
  createScopeRegistry,
  deserializeScopeRefs,
  disposeScope,
  getScopeRegistry,
  inspectScope,
  registerScopeAction,
  registerScopeSignal,
  registerScopeStore,
  resolveScopeRefs,
  deserializeResumeState,
  serializeResumeState,
  serializeScopeRefs,
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

describe('ScopeRef ABI', () => {
  it('round-trips tagged value, signal, store, action, and unsupported references', () => {
    const payload = serializeScopeRefs({
      value: { kind: 'value', data: { mode: 'deep-sea' } },
      signal: { kind: 'signal', id: 'nx:signal:one', initial: 1 },
      store: { kind: 'store', id: 'nx:store:one', initial: { count: 1 } },
      action: { kind: 'action', id: 'nx:action:one', endpoint: '/__nexis/actions/labs/submit' },
      unsupported: { kind: 'unsupported', reason: 'class instance' },
    })
    expect(deserializeScopeRefs(payload)).toMatchObject({
      signal: { kind: 'signal', id: 'nx:signal:one' },
      store: { kind: 'store', id: 'nx:store:one' },
    })
    expect(resolveScopeRefs(deserializeScopeRefs(payload)).value).toEqual({ mode: 'deep-sea' })
  })

  it('supports live signal/store mutation and stable registry disposal', () => {
    const id = createScopeId('signal', 'client-test-signal')
    const signal = registerScopeSignal<number>(id, 1)
    signal.set((value) => value + 1)
    expect(signal()).toBe(2)
    const store = registerScopeStore('nx:store:client-test', { count: 1 })
    store.set({ count: 2 })
    expect(store.snapshot()).toEqual({ count: 2 })
    expect(inspectScope().some((entry) => entry.id === id && entry.kind === 'signal')).toBe(true)
    expect(disposeScope(id)).toBe(true)
    expect(getScopeRegistry().dispose('nx:store:client-test')).toBe(true)
  })

  it('supports action references and rejects unsupported plain values', async () => {
    const action = async (input: { name: string }) => `queued:${input.name}`
    registerScopeAction('nx:action:client-test', action)
    expect(
      resolveScopeRefs({
        action: { kind: 'action', id: 'nx:action:client-test', endpoint: '/action' },
      }).action,
    ).toBe(action)
    expect(() => serializeScopeRefs({ bad: { kind: 'unsupported', reason: '' } })).toThrow(/reason/)
    expect(() => createScopeRegistry().register('bad', () => undefined, 'signal')).toThrow(
      /callable signals/,
    )
    await expect(action({ name: 'Ada' })).resolves.toBe('queued:Ada')
  })
})
