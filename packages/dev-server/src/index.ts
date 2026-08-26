import { readFile, readdir } from 'node:fs/promises'
import { join, relative } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import { escapeHtml, renderToString } from '@mohammedaydan/renderer'
import type { Child } from '@mohammedaydan/core'
import { renderHead, withCanonical } from '@mohammedaydan/seo'
import type { SeoMetadata } from '@mohammedaydan/seo'
import { routeFromFile, resolveRoute, matchRoute } from '@mohammedaydan/router'
import type { NexisHandler } from '@mohammedaydan/adapters'
import { createMemoryIdempotencyStore, handleActionRequest } from '@mohammedaydan/actions'
import type { ServerAction } from '@mohammedaydan/actions'
import nexis from '@mohammedaydan/vite-plugin'

const routeCache = new Map<string, ReturnType<typeof routeFromFile>[]>()
const devIdempotency = createMemoryIdempotencyStore()

type RouteComponent =
  Child | ((props: Readonly<Record<string, string | string[]>>) => Child | Promise<Child>)

interface DevRouteModule {
  readonly default?: RouteComponent
  readonly seo?: SeoMetadata | ((context: { readonly pathname: string }) => SeoMetadata)
}

function routeModuleFromUnknown(value: unknown): DevRouteModule {
  return value && typeof value === 'object' ? (value as DevRouteModule) : {}
}

function errorFromUnknown(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value))
}

function injectStylesheetLink(template: string, href: string): string {
  const link = `<link rel="stylesheet" href="${href}">`
  if (template.includes(`href="${href}"`) || template.includes(`href='${href}'`)) return template
  if (template.includes('</head>')) return template.replace('</head>', `  ${link}\n</head>`)
  return `${link}${template}`
}

export async function nodeRequest(request: IncomingMessage): Promise<Request> {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(Buffer.from(chunk))
  const headers = new Headers()
  for (const [name, value] of Object.entries(request.headers)) {
    if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value)
  }
  const method = request.method ?? 'GET'
  const init: RequestInit = { method, headers }
  if (method !== 'GET' && method !== 'HEAD') init.body = Buffer.concat(chunks)
  const forwardedProto =
    process.env.NEXIS_TRUST_PROXY === '1' ? request.headers['x-forwarded-proto'] : undefined
  const forwardedHost =
    process.env.NEXIS_TRUST_PROXY === '1' ? request.headers['x-forwarded-host'] : undefined
  const proto =
    (Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto)?.split(',')[0]?.trim() ||
    'http'
  const host =
    (Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost)?.split(',')[0]?.trim() ||
    request.headers.host ||
    'localhost'
  return new Request(`${proto}://${host}${request.url ?? '/'}`, init)
}

async function handleDevAction(
  root: string,
  server: { readonly ssrLoadModule: (path: string) => Promise<unknown> },
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
): Promise<boolean> {
  const match = /^\/__nexis\/actions\/(.+)\/([^/]+)$/.exec(pathname)
  if (!match?.[1] || !match[2]) return false
  const route = match[1]
  const name = match[2]
  if (!/^[a-zA-Z0-9_/-]+$/.test(route) || !/^[a-zA-Z0-9_-]+$/.test(name)) return false
  const module = (await server.ssrLoadModule(`/src/routes/${route}.tsx`)) as {
    readonly actions?: Readonly<Record<string, ServerAction<unknown, unknown>>>
  }
  const action = module.actions?.[name]
  if (!action) return false
  const result = await handleActionRequest(await nodeRequest(request), action, {
    idempotency: devIdempotency,
  })
  response.statusCode = result.status
  result.headers.forEach((value: string, key: string) => response.setHeader(key, value))
  response.end(Buffer.from(await result.arrayBuffer()))
  void root
  return true
}

export interface DevServer {
  readonly handle: NexisHandler
  readonly revision: () => number
  readonly invalidate: () => number
}

export function createDevServer(handler: NexisHandler): DevServer {
  let currentRevision = 0
  return {
    handle: handler,
    revision: () => currentRevision,
    invalidate: () => {
      currentRevision += 1
      return currentRevision
    },
  }
}

async function discoverRouteRecords(root: string) {
  const cached = routeCache.get(root)
  if (cached) return cached
  const routeRoot = join(root, 'src', 'routes')
  async function walk(dir: string, base: string): Promise<string[]> {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return []
    }
    const files: string[] = []
    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        files.push(...(await walk(full, base)))
      } else if (
        /\.(tsx|jsx|ts|js)$/.test(entry.name) &&
        !/\.(?:d|spec|test)\.(?:tsx|jsx|ts|js)$/.test(entry.name) &&
        !entry.name.startsWith('layout.')
      ) {
        files.push(relative(base, full))
      }
    }
    return files
  }
  try {
    const files = await walk(routeRoot, routeRoot)
    const routes = files
      .map((file) => {
        try {
          return routeFromFile(`src/routes/${file.replace(/\\/g, '/')}`)
        } catch {
          return null
        }
      })
      .filter(Boolean) as ReturnType<typeof routeFromFile>[]
    routeCache.set(root, routes)
    return routes
  } catch {
    return []
  }
}

export function nexisSSRPlugin(root: string): Plugin {
  return {
    name: 'nexis-ssr',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        try {
          const requestUrl = req.url || '/'
          const pathname = new URL(requestUrl, 'http://localhost').pathname
          if (pathname.startsWith('/__nexis/actions/')) {
            if (await handleDevAction(root, server, req, res, pathname)) return
          }
          if (pathname === '/sitemap.xml' || pathname === '/robots.txt') {
            try {
              const file = await readFile(join(root, 'dist', 'client', pathname.slice(1)))
              res.statusCode = 200
              res.setHeader(
                'Content-Type',
                pathname.endsWith('.xml')
                  ? 'application/xml; charset=utf-8'
                  : 'text/plain; charset=utf-8',
              )
              res.setHeader('Cache-Control', 'no-store')
              res.end(req.method === 'HEAD' ? undefined : file)
              return
            } catch {
              // Continue through Vite when no generated artifact exists yet.
            }
          }
          if (req.method !== 'GET' && req.method !== 'HEAD') return next()

          const url = req.url || '/'
          const accept = req.headers.accept || ''

          const isHtmlRequest =
            accept.includes('text/html') || (!pathname.includes('.') && !pathname.startsWith('/@'))

          if (!isHtmlRequest) return next()
          if (
            pathname.startsWith('/@') ||
            pathname.startsWith('/__') ||
            pathname.startsWith('/node_modules')
          )
            return next()
          if (
            /\.(?:js|mjs|cjs|css|json|map|png|jpg|jpeg|svg|webp|avif|gif|mp4|webm|woff|woff2|ttf|eot|otf|ico|webmanifest|wasm)$/.test(
              pathname,
            )
          )
            return next()

          const routes = await discoverRouteRecords(root)
          if (routes.length === 0) {
            res.statusCode = 404
            res.end('Not Found')
            return
          }

          const sorted = [...routes].sort((a, b) => b.score - a.score)
          const matched = resolveRoute(sorted, pathname)
          if (!matched) {
            res.statusCode = 404
            res.setHeader('Content-Type', 'text/plain; charset=utf-8')
            res.setHeader('Cache-Control', 'no-store')
            res.end('Not Found')
            return
          }

          const filePath = matched.route.file
          const modulePath = `/${filePath}`

          let routeModule: DevRouteModule
          try {
            routeModule = routeModuleFromUnknown(await server.ssrLoadModule(modulePath))
          } catch (err) {
            const error = errorFromUnknown(err)
            server.ssrFixStacktrace(error)
            console.error(`[nexis] SSR load error for ${modulePath}:`, error.message)
            return next(error)
          }

          const rawSeo = routeModule.seo
          const resolvedSeo = typeof rawSeo === 'function' ? rawSeo({ pathname }) : rawSeo
          const seo = resolvedSeo
            ? withCanonical(
                resolvedSeo,
                pathname,
                process.env.NEXIS_SITE_ORIGIN ?? 'https://nexis-showcase.example',
              )
            : undefined
          const head = (() => {
            try {
              if (seo?.title) return renderHead(seo)
            } catch {
              // Fall through to the escaped title fallback.
            }
            if (seo?.title) return `<title>${escapeHtml(seo.title)}</title>`
            return '<title>Nexis App</title>'
          })()

          const Component = routeModule.default
          let renderedHtml = ''
          if (typeof Component === 'function') {
            const result = await Component(matched.params ?? {})
            renderedHtml = renderToString(result)
          } else if (Component) {
            renderedHtml = renderToString(Component)
          }

          const hasEventHandlers = renderedHtml.includes('data-nx-on')
          const hasBindings = renderedHtml.includes('data-nx-bind')
          const scripts = `${
            hasEventHandlers || hasBindings
              ? '<script type="module" src="/nexis-bootstrap.js"></script>'
              : ''
          }${hasBindings ? '<script type="module" src="/nexis-bindings.js"></script>' : ''}`

          let template: string
          try {
            template = await readFile(join(root, 'index.html'), 'utf-8')
          } catch {
            template = `<!DOCTYPE html><html lang="en"><head><!--nexis-head-outlet--></head><body><div id="app"><!--nexis-app-outlet--></div><!--nexis-scripts-outlet--></body></html>`
          }

          template = await server.transformIndexHtml(url, template)
          try {
            await readFile(join(root, 'src', 'styles.css'), 'utf8')
            template = injectStylesheetLink(template, '/src/styles.css')
          } catch {
            // Applications without a source stylesheet remain CSS-free by design.
          }

          const html = template
            .replace('<!--nexis-head-outlet-->', head)
            .replace('<!--nexis-app-outlet-->', renderedHtml)
            .replace('<!--nexis-scripts-outlet-->', scripts)

          res.statusCode = 200
          res.setHeader('Content-Type', 'text/html; charset=utf-8')
          res.setHeader('Cache-Control', 'no-store')
          res.end(html)
        } catch (err) {
          const error = errorFromUnknown(err)
          server.ssrFixStacktrace(error)
          next(error)
        }
      })
    },
  }
}

export async function createNexisDevMiddleware(root: string) {
  const { createServer } = await import('vite')
  const vite = await createServer({
    root,
    plugins: [nexis({ root }), nexisSSRPlugin(root)],
    server: { middlewareMode: true },
    appType: 'custom',
  })
  return vite.middlewares
}
