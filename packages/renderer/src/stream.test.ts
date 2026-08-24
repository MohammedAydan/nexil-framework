import { describe, expect, it } from 'vitest'
import { element } from '@nexis/core'
import { renderToStream } from './stream'

async function readText(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let output = ''
  while (true) {
    const chunk = await reader.read()
    if (chunk.done) return output
    output += decoder.decode(chunk.value, { stream: true })
  }
}

describe('renderToStream', () => {
  it('streams asynchronously resolved HTML', async () => {
    await expect(readText(renderToStream(Promise.resolve(element('h1', {}, 'Streamed'))))).resolves.toBe(
      '<h1>Streamed</h1>',
    )
  })

  it('propagates render failures to the reader', async () => {
    const reader = renderToStream(Promise.reject(new Error('render failed'))).getReader()
    await expect(reader.read()).rejects.toThrow('render failed')
  })
})
