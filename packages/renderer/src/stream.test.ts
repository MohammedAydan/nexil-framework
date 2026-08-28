import { describe, expect, it } from 'vitest'
import { element, Suspense } from '@nexis/core'
import { renderToString } from './index'
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
  it('flushes a Suspense fallback before the resolved subtree template', async () => {
    let resolveContent!: (value: ReturnType<typeof element>) => void
    const content = new Promise<ReturnType<typeof element>>((resolve) => {
      resolveContent = resolve
    })
    const stream = renderToStream(
      element(
        'main',
        {},
        Suspense({ id: 'user-card', fallback: element('p', {}, 'Loading'), children: content }),
      ),
      { flushThreshold: 1 },
    )
    const reader = stream.getReader()
    let output = ''
    while (!output.includes('data-nx-suspense="user-card"')) {
      const next = await reader.read()
      if (next.done) break
      output += new TextDecoder().decode(next.value)
    }
    expect(output).toContain('data-nx-suspense="user-card"')
    resolveContent(element('p', {}, 'Ada'))
    while (true) {
      const next = await reader.read()
      if (next.done) break
      output += new TextDecoder().decode(next.value)
    }
    expect(output).toContain('<template id="nx-suspense-user-card"><p>Ada</p></template>')
  })

  it('streams asynchronously resolved HTML', async () => {
    await expect(
      readText(renderToStream(Promise.resolve(element('h1', {}, 'Streamed')))),
    ).resolves.toBe('<h1>Streamed</h1>')
  })

  it('propagates render failures to the reader', async () => {
    const reader = renderToStream(Promise.reject(new Error('render failed'))).getReader()
    await expect(reader.read()).rejects.toThrow('render failed')
  })
})

it('produces byte-identical output to buffered rendering', async () => {
  const root = element('section', {}, [
    element('h1', {}, 'Home'),
    element('p', {}, 'Dynamic route'),
  ])
  await expect(readText(renderToStream(root, { chunkSize: 5 }))).resolves.toBe(renderToString(root))
})

it('stops after an aborted client signal and calls the cancellation hook', async () => {
  const controller = new AbortController()
  let cancelled = false
  const stream = renderToStream(
    new Promise((resolve) => setTimeout(() => resolve(element('p', {}, 'late')), 5)),
    {
      signal: controller.signal,
      onCancel: () => {
        cancelled = true
      },
    },
  )
  controller.abort('client disconnect')
  await expect(readText(stream)).resolves.toBe('')
  expect(cancelled).toBe(true)
})

it('keeps each queued chunk within the configured backpressure bound', async () => {
  const stream = renderToStream(element('p', {}, '0123456789'), { chunkSize: 3 })
  const reader = stream.getReader()
  const sizes: number[] = []
  while (true) {
    const result = await reader.read()
    if (result.done) break
    sizes.push(result.value.byteLength)
    await new Promise((resolve) => setTimeout(resolve, 1))
  }
  expect(sizes.length).toBeGreaterThan(1)
  expect(Math.max(...sizes)).toBeLessThanOrEqual(3)
})
