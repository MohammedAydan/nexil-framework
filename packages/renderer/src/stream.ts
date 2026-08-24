import type { Child } from '@nexis/core'
import { renderToString } from './index'

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
