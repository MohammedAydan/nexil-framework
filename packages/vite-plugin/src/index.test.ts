import { describe, expect, it } from 'vitest'
import { transformNexisSource } from './index'

describe('Nexis Vite transform', () => {
  it('extracts a dollar event boundary into a hashed lazy chunk', async () => {
    const result = await transformNexisSource(
      "const handler = (event) => event.currentTarget.textContent = 'ok'\nconst view = <button onClick$={handler}>Click</button>",
      '/app/src/routes/index.tsx',
    )
    expect(result.code).toContain('data-nx-on-click="chunk_')
    expect(result.chunks).toHaveLength(1)
    expect(result.chunks[0]?.fileName).toMatch(/^chunk_[a-f0-9]{12}\.js$/)
    expect(result.chunks[0]?.source).toContain('handler_')
    expect(result.chunks[0]?.source).toContain('({ element, event, scope })')
  })

  it('supports resumable non-click events with a normalized event name', async () => {
    const result = await transformNexisSource(
      `const view = <input onInput$={({ event }: { event: Event }) => { console.log(event.type) }} />`,
      '/app/src/routes/form.tsx',
    )
    expect(result.code).toContain('data-nx-on-input="chunk_')
  })

  it('strips TypeScript annotations from emitted handler chunks', async () => {
    const result = await transformNexisSource(
      `export default function Counter() {\n  return <button onClick$={({ element }: { element: HTMLElement }) => { element.textContent = '1' }}>0</button>\n}\n`,
      '/app/src/routes/counter.tsx',
    )
    const source = result.chunks[0]?.source ?? ''
    expect(source).not.toContain(': { element: HTMLElement }')
    expect(source).toContain('scope = {}')
  })

  it('normalizes camel-case DOM events without inserting hyphens', async () => {
    const result = await transformNexisSource(
      'const view = <button onKeyDown$={(event) => event.preventDefault()}>Key</button>',
      '/app/src/routes/keyboard.tsx',
    )
    expect(result.code).toContain('data-nx-on-keydown=')
  })

  it('rewrites free variables through the resumability scope object', async () => {
    const result = await transformNexisSource(
      'const view = <button onClick$={() => setCount(count + 1)}>+</button>',
      '/app1/src/routes/index.tsx',
    )
    expect(result.chunks[0]?.source).toContain('scope.setCount(scope.count + 1)')
  })

  it('merges multiple handlers for the same event on one element', async () => {
    const result = await transformNexisSource(
      'const view = <button onClick$={() => first()} onClick$={() => second()}>Run</button>',
      '/app/src/routes/multiple.tsx',
    )
    expect(result.code.match(/data-nx-on-click=/g)).toHaveLength(1)
    expect(result.code).toContain(';')
  })

  it('rejects server imports in client modules', async () => {
    await expect(
      transformNexisSource(
        "import session from '../server/session'\nexport const view = <div />",
        '/app/src/client/view.tsx',
      ),
    ).rejects.toThrow(/NEXIS_SERVER_IMPORT_IN_CLIENT/)
  })

  it('rejects secret-like environment access in client modules', async () => {
    await expect(
      transformNexisSource(
        'export const key = import.meta.env.PUBLIC_API_SECRET',
        '/app/src/client/config.ts',
      ),
    ).rejects.toThrow(/NEXIS_SECRET_EXPOSURE/)
  })

  it('extracts static JSX styles into CSS output', async () => {
    const result = await transformNexisSource(
      "const view = <div style={{ color: 'red', marginTop: 4 }} />",
      '/app/src/routes/index.tsx',
    )
    expect(result.css).toHaveLength(1)
    expect(result.css[0]).toContain('color:red;')
    expect(result.css[0]).toContain('margin-top:4px;')
  })
})

it('allows component$ state to flow through the automatic ScopeRef capture path', async () => {
  const result = await transformNexisSource(
    `import { component$, state } from '@mohammedaydan/core'
const view = component$(() => { const count = state(0); return <button onClick$={() => count.set(count() + 1)}>{count()}</button> })`,
    '/app/src/routes/component.tsx',
  )
  expect(result.code).toContain('data-nx-on-click=')
  expect(result.scopeCaptures).toEqual(
    expect.arrayContaining([expect.objectContaining({ name: 'count', kind: 'signal' })]),
  )
})

it('lowers a named local resumable handler through its body and captures its Signal', async () => {
  const result = await transformNexisSource(
    `import { component, state } from '@mohammedaydan/core'
export default component(() => {
  const count = state(0)
  const increment = () => count.set(count() + 1)
  return <button onClick$={increment}>Increment</button>
})`,
    '/app/src/routes/named-handler.tsx',
  )

  const chunk = result.chunks[0]?.source ?? ''
  expect(chunk).toContain('scope.count.set(scope.count() + 1)')
  expect(chunk).not.toContain('scope.increment')
  expect(result.scopeCaptures).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ name: 'count', kind: 'signal', initial: 0 }),
    ]),
  )
  expect(result.warnings.some((warning) => warning.includes('increment'))).toBe(false)
})

it('lowers a named local function declaration through its body and captures its Signal', async () => {
  const result = await transformNexisSource(
    `import { component, state } from '@mohammedaydan/core'
export default component(() => {
  const count = state(0)
  function increment() { count.set((current) => current + 1) }
  return <button onClick$={increment}>Increment</button>
})`,
    '/app/src/routes/named-function-handler.tsx',
  )

  const chunk = result.chunks[0]?.source ?? ''
  expect(chunk).toContain('scope.count.set')
  expect(chunk).not.toContain('scope.increment')
  expect(result.scopeCaptures).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ name: 'count', kind: 'signal', initial: 0 }),
    ]),
  )
})

it('classifies live signal captures and warns for unsupported closures', async () => {
  const result = await transformNexisSource(
    `import { state } from '@mohammedaydan/core'
const count = state(0)
const runtimeValue = new Date()
const view = <button onClick$={({ element }) => { element.textContent = String(count()) + runtimeValue.toISOString() }}>+</button>`,
    '/app/src/routes/scope.tsx',
  )
  expect(result.scopeCaptures).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: 'count',
        kind: 'signal',
        id: expect.stringMatching(/^nx:signal:/),
      }),
      expect.objectContaining({ name: 'runtimeValue', kind: 'unsupported' }),
    ]),
  )
  expect(result.warnings.some((warning) => warning.includes('runtimeValue'))).toBe(true)
})

it('marks only an explicit global Store capture as persistent across Link outlet swaps', async () => {
  const result = await transformNexisSource(
    `import { createStore } from '@mohammedaydan/state'
const preferences = createStore({ theme: 'light' }, 'global')
const draft = createStore({ value: '' })
export const view = <div><button onClick$={() => preferences.set({ theme: 'dark' })}>Theme</button><button onClick$={() => draft.set({ value: 'saved' })}>Draft</button></div>`,
    '/app/src/routes/store-lifetime.tsx',
    { scopeSerialization: 'external' },
  )
  expect(result.scopeCaptures).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ name: 'preferences', kind: 'store', lifetime: 'global' }),
      expect.objectContaining({ name: 'draft', kind: 'store', lifetime: 'route' }),
    ]),
  )
})

it('emits a data-nx-scope payload with the serialized initial value', async () => {
  const result = await transformNexisSource(
    `import { state } from '@mohammedaydan/core'
const count = state(0)
export const view = <button onClick$={() => count.set((c) => c + 1)}>+</button>`,
    '/app/src/routes/live.tsx',
  )
  expect(result.code).toContain('data-nx-on-click="chunk_')
  expect(result.code).toContain('data-nx-scope=')
  const payload = /data-nx-scope="([^"]+)"/.exec(result.code)?.[1] ?? ''
  const decoded = JSON.parse(payload.replace(/&quot;/g, '"').replace(/&amp;/g, '&')) as Record<
    string,
    { kind: string; initial?: unknown }
  >
  expect(decoded.count).toMatchObject({ kind: 'signal', initial: 0 })
  const chunkSource = result.chunks[0]?.source ?? ''
  expect(chunkSource).toContain('scope.count.set')
})

it('externalizes resumability metadata behind an opaque HTML scope key', async () => {
  const result = await transformNexisSource(
    `import { state } from '@mohammedaydan/core'
const accountBalance = state(1200)
export const view = <button onClick$={() => accountBalance.set((value) => value + 1)}>+</button>`,
    '/app/src/routes/external-scope.tsx',
    { scopeSerialization: 'external' },
  )
  const scopeAttribute = /data-nx-scope="([^"]+)"/.exec(result.code)?.[1] ?? ''
  expect(scopeAttribute).toMatch(/^nx:scope:[a-f0-9]{12}$/)
  expect(scopeAttribute).not.toContain('accountBalance')
  expect(scopeAttribute).not.toContain('&quot;initial&quot;')
  expect(result.externalScopePayloads).toEqual([
    expect.objectContaining({
      key: expect.stringMatching(/^nx:scope:[a-f0-9]{12}$/),
      payload: {
        accountBalance: expect.objectContaining({ kind: 'signal', initial: 1200 }),
      },
    }),
  ])
})

it('classifies useState tuple declarations as signal captures', async () => {
  const result = await transformNexisSource(
    `import { useState } from '@mohammedaydan/core'
const [count, setCount] = useState(7)
export const view = <button onClick$={() => setCount(count + 1)}>+</button>`,
    '/app/src/routes/tuple.tsx',
  )
  expect(result.scopeCaptures).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ name: 'count', kind: 'signal', initial: 7 }),
      expect.objectContaining({ name: 'setCount', kind: 'signal', initial: 7 }),
    ]),
  )
})

it('downgrades non-literal signal initializers to unsupported diagnostics', async () => {
  const result = await transformNexisSource(
    `import { state } from '@mohammedaydan/core'
const items = state([1, 2, 3].map((n) => n * 2))
export const view = <button onClick$={() => items.set([])}>clear</button>`,
    '/app/src/routes/dynamic.tsx',
  )
  expect(result.scopeCaptures).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: 'items',
        kind: 'unsupported',
        reason: expect.stringContaining('JSON-literal'),
      }),
    ]),
  )
  expect(result.warnings.some((warning) => warning.includes('items'))).toBe(true)
  expect(result.code).not.toContain('data-nx-scope')
})

it('lowers explicit bindText$ into a ScopeRef DOM binding', async () => {
  const result = await transformNexisSource(
    `import { state } from '@mohammedaydan/core'
const count = state(0)
export const view = <button bindText$={count} onClick$={() => count.set((value) => value + 1)}>{count()}</button>`,
    '/app/src/routes/bind-text.tsx',
  )
  expect(result.bindings).toEqual([
    expect.objectContaining({ target: 'text', source: 'count', automatic: false }),
  ])
  expect(result.code).not.toContain('bindText$')
  expect(result.code).toContain('data-nx-bind="nx:signal:')
  expect(result.code).toContain('#text')
  expect(result.code).toContain('data-nx-scope=')
})

it('lowers explicit scalar property bindings and removes authoring-only props', async () => {
  const result = await transformNexisSource(
    `import { state } from '@mohammedaydan/core'
const disabled = state(false)
export const view = <button bindDisabled$={disabled} disabled={disabled()}>Save</button>`,
    '/app/src/routes/bind-disabled.tsx',
  )
  expect(result.bindings).toEqual([
    expect.objectContaining({ target: 'disabled', source: 'disabled', automatic: false }),
  ])
  expect(result.code).not.toContain('bindDisabled$')
  expect(result.code).toContain('#disabled')
})

it('automatically binds a direct Signal child read without a component rerender', async () => {
  const result = await transformNexisSource(
    `import { state } from '@mohammedaydan/core'
const count = state(0)
export const view = <output>{count()}</output>`,
    '/app/src/routes/auto-bind.tsx',
  )
  expect(result.bindings).toEqual([
    expect.objectContaining({ target: 'text', source: 'count', automatic: true }),
  ])
  expect(result.code).toContain('data-nx-bind="nx:signal:')
  expect(result.code).toContain('{count()}')
})

it('does not auto-bind derived or structurally ambiguous JSX expressions', async () => {
  const result = await transformNexisSource(
    `import { state } from '@mohammedaydan/core'
const count = state(0)
export const view = <output>{count() + ' items'}</output>`,
    '/app/src/routes/ambiguous-bind.tsx',
  )
  expect(result.bindings).toHaveLength(0)
  expect(result.code).not.toContain('data-nx-bind=')
  expect(result.warnings.some((warning) => warning.includes('dynamic'))).toBe(true)
})

it('automatically binds a direct Signal value property read', async () => {
  const result = await transformNexisSource(
    `import { state } from '@mohammedaydan/core'
const disabled = state(false)
export const view = <button disabled={disabled.value}>{disabled.value ? 'Disabled' : 'Save'}</button>`,
    '/app/src/routes/auto-value-bind.tsx',
  )
  expect(result.bindings).toEqual([
    expect.objectContaining({ target: 'disabled', source: 'disabled', automatic: true }),
  ])
  expect(result.code).toContain('data-nx-bind="nx:signal:')
  expect(result.code).toContain('#disabled')
})

it('extracts single-quoted and nested literal signal initializers with the AST evaluator', async () => {
  const result = await transformNexisSource(
    `import { state } from '@mohammedaydan/core'
const label = state('hello')
const settings = state({ theme: 'dark', flags: [true, false] })
export const view = <button onClick$={() => label.set('world')}>{label()}</button>`,
    '/app/src/routes/literals.tsx',
  )
  expect(result.scopeCaptures).toEqual(
    expect.arrayContaining([expect.objectContaining({ name: 'label', initial: 'hello' })]),
  )
})

it('shares chunks for identical handler expressions', async () => {
  const result = await transformNexisSource(
    `const count = state(0)
export const view = <div><button onClick$={() => count.set((value) => value + 1)}>+</button><button onClick$={() => count.set((value) => value + 1)}>+</button></div>`,
    '/app/src/routes/dedup.tsx',
  )
  expect(result.chunks).toHaveLength(1)
  expect(result.code.match(/data-nx-on-click=/g)).toHaveLength(2)
})

it('wraps direct signal expressions in mixed text interpolations', async () => {
  const result = await transformNexisSource(
    `import { state } from '@mohammedaydan/core'
const count = state(0)
export const view = <span>Items: {count()}</span>`,
    '/app/src/routes/interpolation.tsx',
  )
  expect(result.bindings).toEqual([
    expect.objectContaining({ target: 'text', source: 'count', automatic: true }),
  ])
  expect(result.code).toContain('<span data-nx-bind="nx:signal:')
})
