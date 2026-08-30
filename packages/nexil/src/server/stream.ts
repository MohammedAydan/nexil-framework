import type { Child, ContextScope, RenderNode } from '../core/index.js'
import { getActiveScope, runWithScope } from '../core/index.js'
import {
  escapeHtml,
  isVoidElement,
  renderElementClosing,
  renderElementOpening,
  renderToString,
  renderToStringAsync,
} from './index.js'

export interface RenderStreamOptions {
  readonly signal?: AbortSignal
  readonly chunkSize?: number
  readonly flushThreshold?: number
  readonly onCancel?: (reason?: unknown) => void
  readonly scope?: ContextScope
}

function waitForCapacity(controller: ReadableStreamDefaultController<Uint8Array>): Promise<void> {
  if ((controller.desiredSize ?? 1) > 0) return Promise.resolve()
  return new Promise((resolve) => setTimeout(resolve, 0))
}

function isPromise(value: unknown): value is Promise<unknown> {
  return Boolean(value && typeof (value as { then?: unknown }).then === 'function')
}

function suspenseTemplate(id: string, html: string): string {
  const safeId = escapeHtml(id)
  return `<template id="nx-suspense-${safeId}">${html}</template><script>(function(){var t=document.getElementById('nx-suspense-${safeId}'),e=document.querySelector('[data-nx-suspense="${safeId}"]');if(t&&e)e.replaceWith(t.content.cloneNode(true))})()</script>`
}

async function* renderIncrementally(
  child: Child | Promise<Child>,
  deferred: Array<Promise<string>> = [],
): AsyncGenerator<string> {
  const resolved = await child
  if (typeof resolved === 'function') {
    yield* renderIncrementally((resolved as () => Child)(), deferred)
    return
  }
  if (resolved === null || resolved === undefined || typeof resolved === 'boolean') return
  if (Array.isArray(resolved)) {
    for (const item of resolved) yield* renderIncrementally(item, deferred)
    return
  }
  if (typeof resolved === 'string' || typeof resolved === 'number') {
    yield escapeHtml(String(resolved))
    return
  }
  if (isPromise(resolved)) {
    yield* renderIncrementally(resolved as Promise<Child>, deferred)
    return
  }
  const node = resolved as RenderNode
  if (node.kind === 'text') {
    yield escapeHtml(node.value)
    return
  }
  if (node.kind === 'suspense') {
    yield `<span data-nx-suspense="${escapeHtml(node.id)}">`
    yield* renderIncrementally(node.fallback, deferred)
    yield '</span>'
    deferred.push(renderToStringAsync(node.content).then((html) => suspenseTemplate(node.id, html)))
    return
  }
  if (node.kind !== 'element') {
    yield renderToString(node as never)
    return
  }
  yield renderElementOpening(node)
  if (isVoidElement(node)) return
  for (const item of node.children) yield* renderIncrementally(item, deferred)
  yield renderElementClosing(node)
}

/**
 * Returns an AsyncIterable stream of HTML chunks with request isolation.
 */
export async function* renderToAsyncIterable(
  root: Child | Promise<Child>,
  scope?: ContextScope,
): AsyncGenerator<string> {
  const activeScope = scope ?? getActiveScope()
  const renderInner = async function* (): AsyncGenerator<string> {
    const deferred: Array<Promise<string>> = []
    for await (const piece of renderIncrementally(root, deferred)) {
      yield piece
    }
    while (deferred.length > 0) {
      const ready = await Promise.race(
        deferred.map((promise, index) => promise.then((value) => ({ index, value }))),
      )
      deferred.splice(ready.index, 1)
      yield ready.value
    }
  }

  if (activeScope) {
    const iterator = renderInner()
    while (true) {
      const nextItem = await runWithScope(activeScope, () => iterator.next())
      if (nextItem.done) break
      yield nextItem.value
    }
  } else {
    yield* renderInner()
  }
}

/**
 * Returns a Web ReadableStream of UTF-8 encoded HTML bytes with backpressure and chunk buffering.
 */
export function renderToStream(
  root: Child | Promise<Child>,
  options: RenderStreamOptions = {},
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  const chunkSize = Math.max(1, Math.floor(options.chunkSize ?? 16 * 1024))
  const flushThreshold = Math.max(1, Math.min(chunkSize, Math.floor(options.flushThreshold ?? 512)))
  const activeScope = options.scope ?? getActiveScope()
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
        const executeStreaming = async () => {
          for await (const piece of renderToAsyncIterable(root, activeScope)) {
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
        }

        if (activeScope) {
          await runWithScope(activeScope, executeStreaming)
        } else {
          await executeStreaming()
        }
      } catch (error) {
        if (!cancelled) controller.error(error)
      }
    },
    cancel(reason) {
      cancel(reason)
    },
  })
}
