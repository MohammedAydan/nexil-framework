import type { Child, RenderNode } from '@mohammedaydan/core'
import {
  escapeHtml,
  isVoidElement,
  renderElementClosing,
  renderElementOpening,
  renderToString,
} from './index.js'

export interface RenderStreamOptions {
  readonly signal?: AbortSignal
  readonly chunkSize?: number
  readonly flushThreshold?: number
  readonly onCancel?: (reason?: unknown) => void
}

function waitForCapacity(controller: ReadableStreamDefaultController<Uint8Array>): Promise<void> {
  if ((controller.desiredSize ?? 1) > 0) return Promise.resolve()
  return new Promise((resolve) => setTimeout(resolve, 0))
}

function isPromise(value: unknown): value is Promise<unknown> {
  return Boolean(value && typeof (value as { then?: unknown }).then === 'function')
}

async function* renderIncrementally(child: Child | Promise<Child>): AsyncGenerator<string> {
  const resolved = await child
  if (resolved === null || resolved === undefined || typeof resolved === 'boolean') return
  if (Array.isArray(resolved)) {
    for (const item of resolved) yield* renderIncrementally(item)
    return
  }
  if (typeof resolved === 'string' || typeof resolved === 'number') {
    yield escapeHtml(String(resolved))
    return
  }
  if (isPromise(resolved)) {
    yield* renderIncrementally(resolved as Promise<Child>)
    return
  }
  const node = resolved as RenderNode
  if (node.kind === 'text') {
    yield escapeHtml(node.value)
    return
  }
  if (node.kind !== 'element') {
    yield renderToString(node as never)
    return
  }
  yield renderElementOpening(node)
  if (isVoidElement(node)) return
  for (const item of node.children) yield* renderIncrementally(item)
  yield renderElementClosing(node)
}

export function renderToStream(
  root: Child | Promise<Child>,
  options: RenderStreamOptions = {},
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  const chunkSize = Math.max(1, Math.floor(options.chunkSize ?? 16 * 1024))
  const flushThreshold = Math.max(1, Math.min(chunkSize, Math.floor(options.flushThreshold ?? 512)))
  let cancelled = false
  let controllerRef: ReadableStreamDefaultController<Uint8Array> | undefined
  const cancel = (reason?: unknown) => {
    if (cancelled) return
    cancelled = true
    options.onCancel?.(reason)
    try {
      controllerRef?.close()
    } catch {
      // The stream may already be closed or errored.
    }
  }
  options.signal?.addEventListener('abort', () => cancel(options.signal?.reason), { once: true })

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      controllerRef = controller
      const enqueue = async (text: string): Promise<void> => {
        const bytes = encoder.encode(text)
        for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
          if (cancelled) return
          await waitForCapacity(controller)
          if (cancelled) return
          controller.enqueue(bytes.slice(offset, Math.min(offset + chunkSize, bytes.byteLength)))
        }
      }
      try {
        if (cancelled) {
          controller.close()
          return
        }
        let buffer = ''
        let firstPiece = true
        for await (const piece of renderIncrementally(root)) {
          if (cancelled) return
          if (firstPiece) {
            firstPiece = false
            await enqueue(piece)
            continue
          }
          const next = buffer + piece
          if (encoder.encode(next).byteLength >= flushThreshold) {
            await enqueue(next)
            buffer = ''
          } else {
            buffer = next
          }
        }
        if (!cancelled && buffer) await enqueue(buffer)
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
