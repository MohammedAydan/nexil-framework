import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createProductionServer } from './index.js'

async function withServer(run: (base: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'nexis-serve-'))
  await mkdir(join(root, 'features'), { recursive: true })
  await mkdir(join(root, 'assets'), { recursive: true })
  await writeFile(join(root, 'index.html'), '<h1>home</h1>')
  await writeFile(join(root, 'features', 'index.html'), '<h1>features</h1>')
  await writeFile(join(root, 'assets', 'app.abc.js'), 'export default 1')
  const app = createProductionServer(root, { host: '127.0.0.1', port: 0 })
  await app.listen()
  const address = app.server.address()
  if (!address || typeof address === 'string') throw new Error('Missing test server address.')
  try {
    await run(`http://127.0.0.1:${address.port}`)
  } finally {
    await app.close()
    await rm(root, { recursive: true, force: true })
  }
}

describe('official production server', () => {
  it('serves routes, assets, 404 documents, HEAD, 405, and cache headers', async () => {
    await withServer(async (base) => {
      const route = await fetch(`${base}/features`)
      expect(route.status).toBe(200)
      expect(route.headers.get('content-type')).toContain('text/html')
      expect(route.headers.get('cache-control')).toContain('must-revalidate')
      expect(await route.text()).toContain('features')

      const asset = await fetch(`${base}/assets/app.abc.js`)
      expect(asset.status).toBe(200)
      expect(asset.headers.get('content-type')).toContain('javascript')
      expect(asset.headers.get('cache-control')).toContain('immutable')

      const head = await fetch(`${base}/features`, { method: 'HEAD' })
      expect(head.status).toBe(200)
      expect(await head.text()).toBe('')
      expect(head.headers.get('content-type')).toContain('text/html')

      const missing = await fetch(`${base}/missing`)
      expect(missing.status).toBe(404)
      expect(await missing.text()).toContain('<h1>Not Found</h1>')

      const unsupported = await fetch(`${base}/features`, { method: 'POST' })
      expect(unsupported.status).toBe(405)
      expect(unsupported.headers.get('allow')).toBe('GET, HEAD')
    })
  })
})
