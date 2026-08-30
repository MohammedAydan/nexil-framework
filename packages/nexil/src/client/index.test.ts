import { describe, expect, it, vi } from 'vitest'
import {
  bindSignalToDOM,
  bootstrapResumability,
  clearChunkCache,
  createCachedChunkLoader,
  createHandlerReference,
  createResumeAttribute,
  createScopeId,
  createScopeRegistry,
  deserializeResumeState,
  deserializeScopeRefs,
  disposeScope,
  getScopeRegistry,
  hydrateNexilStateFromDocument,
  initGlobalEventDelegator,
  inspectScope,
  registerScopeAction,
  registerScopeSignal,
  registerScopeStore,
  resolveScopeRefs,
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
      action: { kind: 'action', id: 'nx:action:one', endpoint: '/__nexil/actions/labs/submit' },
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

describe('bootstrapResumability scope materialization', () => {
  interface FakeElement {
    attributes: ReadonlyArray<{ name: string; value: string }>
    nodeType: number
    textContent: string
    value: string
    checked: boolean
    disabled: boolean
    hidden: boolean
    getAttribute(name: string): string | null
    hasAttribute(name: string): boolean
    addEventListener(name: string, listener: (event: unknown) => void): void
    removeEventListener(name: string, listener: (event: unknown) => void): void
    dispatch(eventName: string, event?: unknown): void
  }

  function fakeElement(attributes: Record<string, string>): FakeElement {
    const listeners = new Map<string, Array<(event: unknown) => void>>()
    const element: FakeElement = {
      attributes: Object.entries(attributes).map(([name, value]) => ({ name, value })),
      nodeType: 1,
      textContent: '',
      value: '',
      checked: false,
      disabled: false,
      hidden: false,
      getAttribute: (name) => attributes[name] ?? null,
      hasAttribute: (name) => name in attributes,
      addEventListener: (name, listener) => {
        listeners.set(name, [...(listeners.get(name) ?? []), listener])
      },
      removeEventListener: (name, listener) => {
        listeners.set(
          name,
          (listeners.get(name) ?? []).filter((candidate) => candidate !== listener),
        )
      },
      dispatch: (eventName, event = {}) => {
        for (const listener of [...(listeners.get(eventName) ?? [])]) listener(event)
      },
    }
    return element
  }

  it('delivers values and shared live signals through the scope argument', async () => {
    const json = JSON.stringify({
      mode: { kind: 'value', data: 'dark' },
      count: { kind: 'signal', id: 'nx:signal:t1', initial: 2 },
    })
    const first = fakeElement({
      'data-nx-on-click': 'chunk_0000000000aa.js#run',
      'data-nx-scope': json,
    })
    const second = fakeElement({
      'data-nx-on-click': 'chunk_0000000000bb.js#run',
      'data-nx-scope': json,
    })
    const root = {
      querySelectorAll: () => [first as unknown as HTMLElement, second as unknown as HTMLElement],
    } as unknown as Document
    const scopes: Array<Record<string, unknown>> = []
    bootstrapResumability(root, async () => ({
      run: ({ scope }: { scope: Record<string, unknown> }) => {
        scopes.push(scope)
        const count = scope.count as { set: (n: number) => void; (): number }
        count.set(9)
      },
    }))
    first.dispatch('click')
    await vi.waitFor(() => expect(scopes).toHaveLength(1))
    expect(scopes[0]?.mode).toBe('dark')
    const sharedCount = scopes[0]?.count as { (): number }
    expect(sharedCount()).toBe(9)
    second.dispatch('click')
    await vi.waitFor(() => expect(scopes).toHaveLength(2))
    expect(scopes[1]?.count).toBe(sharedCount)
  })

  it('binds a registered signal to a DOM target through effect and disposes cleanly', () => {
    const id = createScopeId('signal', 'client-dom-binding')
    const signal = registerScopeSignal<number>(id, 0)
    const element = { nodeType: 1, textContent: '' } as unknown as HTMLElement
    const dispose = bindSignalToDOM(id, element, 'text')
    expect(element.textContent).toBe('0')
    signal.set(1)
    expect(element.textContent).toBe('1')
    dispose()
    signal.set(2)
    expect(element.textContent).toBe('1')
    expect(disposeScope(id)).toBe(true)
  })

  it('binds scalar properties from the standalone resumability bootstrap', async () => {
    const json = JSON.stringify({
      count: { kind: 'signal', id: 'nx:signal:binding-bootstrap', initial: 2 },
    })
    const element = fakeElement({
      'data-nx-bind': 'nx:signal:binding-bootstrap#text',
      'data-nx-scope': json,
      'data-nx-on-click': 'chunk_0000000000ee.js#capture',
    })
    const root = {
      querySelectorAll: () => [element as unknown as HTMLElement],
    } as unknown as Document
    let liveSignal: { set: (value: number) => void } | undefined
    const dispose = bootstrapResumability(root, async () => ({
      capture: ({ scope }: { scope: Record<string, unknown> }) => {
        liveSignal = scope.count as { set: (value: number) => void }
      },
    }))
    expect(element.textContent).toBe('2')
    element.dispatch('click')
    await vi.waitFor(() => expect(liveSignal).toBeDefined())
    liveSignal?.set(4)
    expect(element.textContent).toBe('4')
    dispose()
  })

  it('stops binding after disposal', () => {
    const element = fakeElement({ 'data-nx-on-click': 'chunk_0000000000cc.js#run' })
    const root = {
      querySelectorAll: () => [element as unknown as HTMLElement],
    } as unknown as Document
    const handler = vi.fn()
    const dispose = bootstrapResumability(root, async () => ({ run: handler }))
    dispose()
    element.dispatch('click')
    expect(handler).not.toHaveBeenCalled()
  })

  it('warns and skips unsupported captures without throwing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const json = JSON.stringify({
      broken: { kind: 'unsupported', reason: 'closure over db' },
    })
    const element = fakeElement({
      'data-nx-on-click': 'chunk_0000000000dd.js#run',
      'data-nx-scope': json,
    })
    const root = {
      querySelectorAll: () => [element as unknown as HTMLElement],
    } as unknown as Document
    const scopes: Array<Record<string, unknown>> = []
    bootstrapResumability(root, async () => ({
      run: ({ scope }: { scope: Record<string, unknown> }) => {
        scopes.push(scope)
      },
    }))
    element.dispatch('click')
    await vi.waitFor(() => expect(scopes).toHaveLength(1))
    expect(scopes[0]).toEqual({})
    expect(warn).toHaveBeenCalledWith('[nexil] unsupported scope:', 'closure over db')
    warn.mockRestore()
  })
})

describe('Global Event Delegator & Resumability Dispatcher', () => {
  interface DelegatedNode {
    parentElement: DelegatedNode | null
    getAttribute(name: string): string | null
    hasAttribute(name: string): boolean
    addEventListener(name: string, listener: (event: unknown) => void): void
    removeEventListener(name: string, listener: (event: unknown) => void): void
    dispatchEvent(event: unknown): void
    _listeners: Map<string, Array<(event: unknown) => void>>
  }

  function createDelegatedNode(attrs: Record<string, string> = {}): DelegatedNode {
    const listeners = new Map<string, Array<(event: unknown) => void>>()
    const node: DelegatedNode = {
      parentElement: null,
      _listeners: listeners,
      getAttribute: (name) => attrs[name] ?? null,
      hasAttribute: (name) => name in attrs,
      addEventListener: (name, listener) => {
        listeners.set(name, [...(listeners.get(name) ?? []), listener])
      },
      removeEventListener: (name, listener) => {
        listeners.set(
          name,
          (listeners.get(name) ?? []).filter((candidate) => candidate !== listener),
        )
      },
      dispatchEvent: (event: unknown) => {
        const ev = event as { type: string; target?: unknown }
        if (!ev.target) ev.target = node
        let cur: DelegatedNode | null = node
        while (cur) {
          for (const listener of [...(cur._listeners.get(ev.type) ?? [])]) {
            listener(ev)
          }
          cur = cur.parentElement
        }
      },
    }
    return node
  }

  it('intercepts bubbling events at root and traverses ancestor hierarchy', async () => {
    const root = createDelegatedNode()
    const button = createDelegatedNode({ 'data-nx-on-click': 'chunk_global.js#handleClick' })
    const icon = createDelegatedNode()
    button.parentElement = root
    icon.parentElement = button

    const eventsFired: Array<{ element: HTMLElement; event: Event }> = []
    const loader = async (chunk: string) => {
      expect(chunk).toBe('chunk_global.js')
      return {
        handleClick: (ctx: { element: HTMLElement; event: Event }) => {
          eventsFired.push(ctx)
        },
      }
    }

    const dispose = initGlobalEventDelegator(root as unknown as HTMLElement, loader)

    // Dispatch event on inner icon child which bubbles to root
    icon.dispatchEvent({ type: 'click', target: icon, bubbles: true })

    await vi.waitFor(() => expect(eventsFired).toHaveLength(1))
    expect(eventsFired[0]?.element).toBe(button as unknown as HTMLElement)
    expect(eventsFired[0]?.event.type).toBe('click')

    dispose()
  })

  it('caches chunk modules in memory and does not invoke loader multiple times', async () => {
    clearChunkCache()
    const loadSpy = vi.fn(async (chunk: string) => ({
      onAction: vi.fn(),
    }))
    const cachedLoader = createCachedChunkLoader(loadSpy)

    const p1 = cachedLoader('chunk_test.js')
    const p2 = cachedLoader('chunk_test.js')
    expect(p1).toBe(p2)
    await Promise.all([p1, p2])
    expect(loadSpy).toHaveBeenCalledTimes(1)
  })

  it('hydrates state from serialized __NEXIL_STATE__ and __NEXIL_SCOPE_SEEDS__ scripts', () => {
    const scripts = new Map<string, { textContent: string }>()
    scripts.set('__NEXIL_STATE__', {
      textContent: JSON.stringify({ 'nx:global': { user: 'Ada' } }),
    })
    scripts.set('__NEXIL_SCOPE_SEEDS__', {
      textContent: JSON.stringify({
        'nx:scope:seed-1': { count: { kind: 'signal', id: 'nx:sig:1', initial: 100 } },
      }),
    })

    const prevDoc = (globalThis as { document?: unknown }).document
    ;(globalThis as unknown as { document: unknown }).document = {
      getElementById: (id: string) => scripts.get(id) ?? null,
    }

    try {
      hydrateNexilStateFromDocument()

      const g = globalThis as unknown as Record<string, unknown>
      const hydMap = g['__nexil:state:hydration'] as Map<string, unknown>
      expect(hydMap.get('nx:global')).toEqual({ user: 'Ada' })
      expect((g.__nexilScopeSeeds as Record<string, unknown>)['nx:scope:seed-1']).toBeDefined()
    } finally {
      ;(globalThis as unknown as { document: unknown }).document = prevDoc
    }
  })
})

describe('ScopeRegistry ownership', () => {
  it('disposes the previous entry when an id is re-registered', () => {
    const registry = createScopeRegistry()
    const first = (() => undefined) as unknown as {
      set: () => void
      dispose: ReturnType<typeof vi.fn>
    }
    first.set = () => undefined
    first.dispose = vi.fn()
    registry.register('nx:signal:overwrite-test', first)
    const replacement = (() => undefined) as unknown as { set: () => void }
    replacement.set = () => undefined
    registry.register('nx:signal:overwrite-test', replacement)
    expect(first.dispose).toHaveBeenCalledTimes(1)
    expect(registry.inspectScope()).toEqual([{ id: 'nx:signal:overwrite-test', kind: 'signal' }])
  })
})

it('updates a scalar DOM property without rerendering', () => {
  const id = createScopeId('signal', 'client-dom-disabled')
  const signal = registerScopeSignal<boolean>(id, false)
  const element = { nodeType: 1, disabled: false } as unknown as HTMLButtonElement
  const dispose = bindSignalToDOM(id, element, 'disabled')
  expect(element.disabled).toBe(false)
  signal.set(true)
  expect(element.disabled).toBe(true)
  dispose()
  signal.set(false)
  expect(element.disabled).toBe(true)
  expect(disposeScope(id)).toBe(true)
})
