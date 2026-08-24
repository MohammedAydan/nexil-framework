import type { Child } from '@nexis/core'
import { renderToString } from './index.js'

export type RenderMode =
  | { readonly mode: 'static' }
  | { readonly mode: 'isr'; readonly revalidate: number }
  | { readonly mode: 'server' }
  | { readonly mode: 'partial' }

export interface RenderOutput {
  readonly html: string
  readonly mode: RenderMode['mode']
  readonly cacheControl: string
  readonly stale: boolean
}

export interface RenderCache {
  get(key: string): Promise<{ readonly html: string; readonly expiresAt: number } | undefined>
  set(key: string, value: { readonly html: string; readonly expiresAt: number }): Promise<void>
}

export interface RouteRenderInput {
  readonly key: string
  readonly mode?: RenderMode
  readonly render: () => Child | Promise<Child>
  readonly cache?: RenderCache
  readonly now?: () => number
}

function assertRevalidate(seconds: number): void {
  if (!Number.isInteger(seconds) || seconds < 1 || seconds > 31_536_000) {
    throw new RangeError('ISR revalidate must be an integer between 1 second and 365 days.')
  }
}

export async function renderRoute(input: RouteRenderInput): Promise<RenderOutput> {
  const mode = input.mode ?? { mode: 'static' }
  const now = input.now ?? Date.now

  if (mode.mode === 'isr') {
    assertRevalidate(mode.revalidate)
    if (!input.cache) throw new TypeError('ISR requires an injected cache implementation.')
    const cached = await input.cache.get(input.key)
    if (cached && cached.expiresAt > now()) {
      return {
        html: cached.html,
        mode: 'isr',
        cacheControl: `s-maxage=${mode.revalidate}`,
        stale: false,
      }
    }

    const html = renderToString(await input.render())
    await input.cache.set(input.key, { html, expiresAt: now() + mode.revalidate * 1000 })
    return {
      html,
      mode: 'isr',
      cacheControl: `s-maxage=${mode.revalidate}`,
      stale: Boolean(cached),
    }
  }

  const html = renderToString(await input.render())
  if (mode.mode === 'static')
    return { html, mode: 'static', cacheControl: 'public, immutable', stale: false }
  if (mode.mode === 'partial')
    return { html, mode: 'partial', cacheControl: 'public, max-age=0', stale: false }
  return { html, mode: 'server', cacheControl: 'private, no-store', stale: false }
}
