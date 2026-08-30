import { describe, expect, it } from 'vitest'
import { createContext, createContextScope, element, provideContext, text } from '../core/index.js'
import { renderToString, renderToStringAsync } from './index'
import { renderRoute } from './modes'

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

describe('SSR request isolation (§6) — renderRoute + Context', () => {
  it('500 concurrent renderRoute with unique Context per request — no leakage', async () => {
    const Ctx = createContext<string>('default')
    const N = 500
    const results = await Promise.all(
      Array.from({ length: N }, async (_, i) => {
        const id = `request-${String(i + 1).padStart(3, '0')}`
        const delay = Math.floor(Math.random() * 12)
        const out = await renderRoute({
          key: `ctx-concurrency-${i}`,
          mode: { mode: 'server' },
          render: async () => {
            await sleep(delay)
            return Ctx.Provider({
              value: id,
              children: () => element('div', { id: 'ctx' }, text(Ctx.use())),
            })
          },
        })
        return { id, html: out.html }
      }),
    )
    for (const { id, html } of results) {
      expect(html).toBe(`<div id="ctx">${id}</div>`)
    }
    expect(results).toHaveLength(N)
  }, 30_000)

  it('100 concurrent explicit-scope renders with random async delays — no leakage', async () => {
    const Ctx = createContext<string>('default')
    const N = 100
    const results = await Promise.all(
      Array.from({ length: N }, async (_, i) => {
        const id = `explicit-${i}`
        const scope = provideContext(createContextScope(), Ctx, id)
        await sleep(Math.floor(Math.random() * 8))
        const html = await renderToStringAsync(
          Ctx.Provider({
            value: id,
            scope,
            children: () => element('span', {}, text(Ctx.use(scope))),
          }),
        )
        return { id, html }
      }),
    )
    for (const { id, html } of results) expect(html).toBe(`<span>${id}</span>`)
  })

  it('throwing render disposes its scope without corrupting next request', async () => {
    const Ctx = createContext<string>('default')
    await expect(
      renderRoute({
        key: 'throw-A',
        mode: { mode: 'server' },
        render: async () => {
          await sleep(2)
          return Ctx.Provider({
            value: 'A',
            children: () => {
              throw new Error('boom A')
            },
          })
        },
      }),
    ).rejects.toThrow('boom A')
    const outB = await renderRoute({
      key: 'throw-B',
      mode: { mode: 'server' },
      render: () =>
        Ctx.Provider({ value: 'B', children: () => element('div', {}, text(Ctx.use())) }),
    })
    expect(outB.html).toBe('<div>B</div>')
  })

  it('ISR/static cache does not leak Context between keys', async () => {
    const Ctx = createContext<string>('default')
    const cache = new Map<string, { html: string; expiresAt: number }>()
    const memCache = {
      get: async (k: string) => cache.get(k),
      set: async (k: string, v: { html: string; expiresAt: number }) => {
        cache.set(k, v)
      },
    }
    const out1 = await renderRoute({
      key: '/page-a',
      mode: { mode: 'isr', revalidate: 60 },
      cache: memCache,
      render: () =>
        Ctx.Provider({ value: 'value-A', children: () => element('div', {}, text(Ctx.use())) }),
    })
    const out2 = await renderRoute({
      key: '/page-b',
      mode: { mode: 'isr', revalidate: 60 },
      cache: memCache,
      render: () =>
        Ctx.Provider({ value: 'value-B', children: () => element('div', {}, text(Ctx.use())) }),
    })
    expect(out1.html).toBe('<div>value-A</div>')
    expect(out2.html).toBe('<div>value-B</div>')
    const hit = await renderRoute({
      key: '/page-a',
      mode: { mode: 'isr', revalidate: 60 },
      cache: memCache,
      render: () =>
        Ctx.Provider({ value: 'value-C', children: () => element('div', {}, text(Ctx.use())) }),
    })
    expect(hit.html).toBe('<div>value-A</div>')
  })
})
