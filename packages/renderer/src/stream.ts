import type { Child } from '@mohammedaydan/core'
import { renderToString } from './index.js'

export interface RenderStreamOptions {
  readonly signal?: AbortSignal
  readonly chunkSize?: number
  readonly onCancel?: (reason?: unknown) => void
}

function waitForCapacity(controller: ReadableStreamDefaultController<Uint8Array>): Promise<void> {
  if ((controller.desiredSize ?? 1) > 0) return Promise.resolve()
  return new Promise((resolve) => setTimeout(resolve, 0))
}

export function renderToStream(
  root: Child | Promise<Child>,
  options: RenderStreamOptions = {},
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  const chunkSize = Math.max(1, Math.floor(options.chunkSize ?? 16 * 1024))
  let cancelled = false
  const cancel = (reason?: unknown) => {
    if (cancelled) return
    cancelled = true
    options.onCancel?.(reason)
  }
  options.signal?.addEventListener('abort', () => cancel(options.signal?.reason), { once: true })
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        if (cancelled) {
          controller.close()
          return
        }
        const bytes = encoder.encode(renderToString(await root))
        if (cancelled) {
          controller.close()
          return
        }
        for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
          if (cancelled) return
          await waitForCapacity(controller)
          if (cancelled) return
          controller.enqueue(bytes.slice(offset, Math.min(offset + chunkSize, bytes.byteLength)))
        }
        if (!cancelled) controller.close()
      } catch (error) {
        if (!cancelled) controller.error(error)
      }
    },
    cancel(reason) {
      cancel(reason)
    },
  })
}
