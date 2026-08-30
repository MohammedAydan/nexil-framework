import { describe, expect, it } from 'vitest'
import { transformResumableJSX } from './transform.js'

describe('transformResumableJSX (@nexil/compiler)', () => {
  it('extracts inline arrow function from onClick$ into hoisted resumable chunk', () => {
    const code = `
      export function Counter() {
        const count = state(0)
        return (
          <button onClick$={() => { count.set(count() + 1) }}>
            Increment
          </button>
        )
      }
    `
    const result = transformResumableJSX(code, '/src/routes/index.tsx')

    expect(result.chunks).toHaveLength(1)
    const chunk = result.chunks[0]!
    expect(chunk.fileName).toMatch(/^chunk_[a-f0-9]{12}\.js$/)
    expect(chunk.exportName).toMatch(/^__nexil_action_[a-f0-9]{12}$/)
    expect(chunk.source).toContain('export async function')
    expect(chunk.source).toContain('count.set(count() + 1)')

    expect(result.code).toContain(`data-nx-on-click="${chunk.fileName}#${chunk.exportName}"`)
    expect(result.code).not.toContain('onClick$')
    expect(result.map).toBeDefined()
  })

  it('detects lexical captures for signals and stores and emits data-nx-scope', () => {
    const code = `
      export function Profile() {
        const user = state({ name: 'Ada' })
        const cart = store({ items: [] })
        return (
          <form onSubmit$={(e) => { e.preventDefault(); console.log(user(), cart.items) }}>
            <button>Save</button>
          </form>
        )
      }
    `
    const result = transformResumableJSX(code, '/src/routes/profile.tsx')

    expect(result.chunks).toHaveLength(1)
    const captures = result.chunks[0]!.captures
    const userCapture = captures.find((c) => c.name === 'user')
    const cartCapture = captures.find((c) => c.name === 'cart')

    expect(userCapture).toBeDefined()
    expect(userCapture?.kind).toBe('signal')
    expect(cartCapture).toBeDefined()
    expect(cartCapture?.kind).toBe('store')

    expect(result.code).toContain('data-nx-on-submit=')
    expect(result.code).toContain('data-nx-scope=')
  })

  it('preserves top-level imported helpers inside extracted chunk headers', () => {
    const code = `
      import { formatCurrency } from '../utils/format'
      import confetti from 'canvas-confetti'

      export function BuyButton() {
        return (
          <button onClick$={() => { confetti(); alert(formatCurrency(99)) }}>
            Buy
          </button>
        )
      }
    `
    const result = transformResumableJSX(code, '/src/components/BuyButton.tsx')

    expect(result.chunks).toHaveLength(1)
    const chunk = result.chunks[0]!
    expect(chunk.source).toContain('import { formatCurrency } from "../utils/format"')
    expect(chunk.source).toContain('import { confetti } from "canvas-confetti"')
  })

  it('handles component$ attribute transformation', () => {
    const code = `
      export function Island() {
        return <div component$={() => console.log('mounted island')}>Island</div>
      }
    `
    const result = transformResumableJSX(code, '/src/routes/island.tsx')

    expect(result.chunks).toHaveLength(1)
    expect(result.code).toContain('data-nx-on-mount=')
  })

  it('returns graceful warning on invalid source syntax without throwing', () => {
    const code = `export function Bad( {`
    const result = transformResumableJSX(code, '/src/routes/bad.tsx')
    expect(result.warnings.length).toBeGreaterThan(0)
    expect(result.code).toBe(code)
  })
})
