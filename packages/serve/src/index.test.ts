import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  composeMiddleware,
  createMiddleware,
  createProductionServer,
  createSecurityHeaders,
  createServer,
} from './index.js'

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
  it('serves configured redirects with safe status and location headers', async () => {
    const root = await mkdtemp(join(tmpdir(), 'nexis-serve-redirect-'))
    await writeFile(join(root, 'index.html'), '<h1>home</h1>')
    const app = createProductionServer(root, {
      host: '127.0.0.1',
      port: 0,
      redirects: [{ from: '/old', to: '/new', status: 308 }],
    })
    await app.listen()
    const address = app.server.address()
    if (!address || typeof address === 'string') throw new Error('Missing test server address.')
    try {
      const redirect = await fetch(`http://127.0.0.1:${address.port}/old`, { redirect: 'manual' })
      expect(redirect.status).toBe(308)
      expect(redirect.headers.get('location')).toBe('/new')
      expect(await redirect.text()).toContain('/new')
      const head = await fetch(`http://127.0.0.1:${address.port}/old`, {
        method: 'HEAD',
        redirect: 'manual',
      })
      expect(head.status).toBe(308)
      expect(await head.text()).toBe('')
    } finally {
      await app.close()
      await rm(root, { recursive: true, force: true })
    }
    expect(() =>
      createProductionServer(root, {
        redirects: [{ from: 'https://evil.test', to: '/new', status: 301 }],
      }),
    ).toThrow(/local absolute/)
  })

  it('accepts valid telemetry events and rejects malformed payloads', async () => {
    const root = await mkdtemp(join(tmpdir(), 'nexis-serve-telemetry-'))
    await writeFile(join(root, 'index.html'), '<h1>home</h1>')
    const events: unknown[] = []
    const app = createProductionServer(root, {
      host: '127.0.0.1',
      port: 0,
      telemetry: { onEvent: (event) => events.push(event) },
    })
    await app.listen()
    const address = app.server.address()
    if (!address || typeof address === 'string') throw new Error('Missing test server address.')
    try {
      const valid = await fetch(`http://127.0.0.1:${address.port}/__nexis/telemetry`, {
        method: 'POST',
        body: JSON.stringify({ name: 'web-vital', value: 123 }),
      })
      expect(valid.status).toBe(202)
      expect(events).toHaveLength(1)
      const invalid = await fetch(`http://127.0.0.1:${address.port}/__nexis/telemetry`, {
        method: 'POST',
        body: '[]',
      })
      expect(invalid.status).toBe(400)
    } finally {
      await app.close()
      await rm(root, { recursive: true, force: true })
    }
  })

  it('applies opt-in security headers and trusts forwarded identity only when configured', async () => {
    const root = await mkdtemp(join(tmpdir(), 'nexis-serve-security-'))
    const serverDir = join(root, 'server')
    await mkdir(serverDir, { recursive: true })
    await writeFile(join(root, 'index.html'), '<h1>home</h1>')
    await writeFile(
      join(serverDir, 'labs.js'),
      'export const actions = { inspect: { execute: async (context) => ({ url: context.request.url }) } }\n',
    )
    const launch = async (trustProxy: boolean) => {
      const app = createServer(root, {
        host: '127.0.0.1',
        port: 0,
        serverDir,
        trustProxy,
        actionOrigins: ['https://portal.example'],
        securityHeaders: {
          contentSecurityPolicy: "default-src 'self'",
          strictTransportSecurity: 'max-age=31536000; includeSubDomains',
        },
      })
      await app.listen()
      const address = app.server.address()
      if (!address || typeof address === 'string') throw new Error('Missing test server address.')
      return { app, base: `http://127.0.0.1:${address.port}` }
    }
    try {
      const untrusted = await launch(false)
      try {
        const response = await fetch(`${untrusted.base}/__nexis/actions/labs/inspect`, {
          method: 'POST',
          headers: {
            Origin: 'https://portal.example',
            'x-forwarded-proto': 'https',
            'x-forwarded-host': 'portal.example',
          },
          body: '{}',
        })
        expect(response.status).toBe(200)
        expect(((await response.json()) as { data: { url: string } }).data.url).toMatch(
          /^http:\/\/127\.0\.0\.1:/,
        )
      } finally {
        await untrusted.app.close()
      }

      const trusted = await launch(true)
      try {
        const forbidden = await fetch(`${trusted.base}/__nexis/actions/labs/inspect`, {
          method: 'POST',
          headers: { Origin: 'https://attacker.example' },
          body: '{}',
        })
        expect(forbidden.status).toBe(403)
        const response = await fetch(`${trusted.base}/__nexis/actions/labs/inspect`, {
          method: 'POST',
          headers: {
            Origin: 'https://portal.example',
            'x-forwarded-proto': 'https',
            'x-forwarded-host': 'portal.example',
          },
          body: '{}',
        })
        expect(response.status).toBe(200)
        expect(response.headers.get('content-security-policy')).toBe("default-src 'self'")
        expect(response.headers.get('strict-transport-security')).toContain('max-age=31536000')
        expect(response.headers.get('x-frame-options')).toBe('DENY')
        expect(response.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin')
        expect(((await response.json()) as { data: { url: string } }).data.url).toBe(
          'https://portal.example/__nexis/actions/labs/inspect',
        )
      } finally {
        await trusted.app.close()
      }
    } finally {
      await rm(root, { recursive: true, force: true })
    }
    expect(() =>
      createSecurityHeaders({ contentSecurityPolicy: "default-src 'self'\nX-Test: 1" }),
    ).toThrow(/CR or LF/)
  })

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

  it('exposes concise server and middleware APIs for application composition', async () => {
    const root = await mkdtemp(join(tmpdir(), 'nexis-serve-composed-'))
    await writeFile(join(root, 'index.html'), '<h1>home</h1>')
    const app = createServer(root, {
      host: '127.0.0.1',
      port: 0,
      middleware: [
        async (_request, response, next) => {
          response.setHeader('X-Request-Policy', 'applied')
          await next?.()
        },
      ],
    })
    await app.listen()
    const address = app.server.address()
    if (!address || typeof address === 'string') throw new Error('Missing test server address.')
    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/`)
      expect(response.status).toBe(200)
      expect(response.headers.get('x-request-policy')).toBe('applied')
      const handler = composeMiddleware(createMiddleware(root))
      expect(typeof handler).toBe('function')
    } finally {
      await app.close()
      await rm(root, { recursive: true, force: true })
    }
  })
})
