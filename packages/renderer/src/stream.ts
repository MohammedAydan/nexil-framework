import type { Child } from '@mohammedaydan/core'
import { renderToString } from './index.js'

export function renderToStream(root: Child | Promise<Child>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        controller.enqueue(encoder.encode(renderToString(await root)))
        controller.close()
      } catch (error) {
        controller.error(error)
      }
    },
  })
}
