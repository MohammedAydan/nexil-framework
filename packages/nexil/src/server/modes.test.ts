import { describe, expect, it } from 'vitest'
import { element } from '../core/index.js'
import { renderRoute } from './modes'

describe('renderRoute', () => {
  it('defaults to immutable static output', async () => {
    await expect(
      renderRoute({ key: '/', render: () => element('h1', {}, 'Home') }),
    ).resolves.toMatchObject({
      html: '<h1>Home</h1>',
      mode: 'static',
      cacheControl: 'public, immutable',
    })
  })

  it('requires an injected cache for ISR', async () => {
    await expect(
      renderRoute({ key: '/post', mode: { mode: 'isr', revalidate: 60 }, render: () => 'Post' }),
    ).rejects.toThrow(/injected cache/)
  })

  it('stores and serves unexpired ISR output', async () => {
    const entries = new Map<string, { html: string; expiresAt: number }>()
    const cache = {
      get: async (key: string) => entries.get(key),
      set: async (key: string, value: { html: string; expiresAt: number }) => {
        entries.set(key, value)
      },
    }
    let renders = 0
    const input = {
      key: '/post',
      mode: { mode: 'isr' as const, revalidate: 60 },
      cache,
      now: () => 1_000,
      render: () => {
        renders += 1
        return `Post ${renders}`
      },
    }

    await expect(renderRoute(input)).resolves.toMatchObject({ html: 'Post 1', stale: false })
    await expect(renderRoute(input)).resolves.toMatchObject({ html: 'Post 1', stale: false })
    expect(renders).toBe(1)
  })

  it('marks server output private and partial output non-immutable', async () => {
    await expect(
      renderRoute({ key: '/dashboard', mode: { mode: 'server' }, render: () => 'Dashboard' }),
    ).resolves.toMatchObject({ cacheControl: 'private, no-store' })
    await expect(
      renderRoute({ key: '/', mode: { mode: 'partial' }, render: () => 'Shell' }),
    ).resolves.toMatchObject({ cacheControl: 'public, max-age=0' })
  })
})
