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
