import { existsSync } from 'node:fs'
import { readFile, readdir } from 'node:fs/promises'
import { join, relative } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import { escapeHtml, renderToString } from '@nexil/nexil/server'
import type { Child, ComponentContext } from '@nexil/nexil'
import { createRequestContext, runWithScope } from '@nexil/nexil'
import { __clearAccessedStoreIds, __getStoresScriptTag } from '@nexil/nexil'
import { renderHead, withCanonical } from '@nexil/nexil'
import type { SeoMetadata } from '@nexil/nexil'
import { routeFromFile, resolveRoute, matchRoute } from '@nexil/nexil/router'
import type { NexilHandler } from '@nexil/nexil/server'
import { createMemoryIdempotencyStore, handleActionRequest } from '@nexil/nexil/server'
import type { ServerAction } from '@nexil/nexil/server'
import nexil from '@nexil/vite-plugin'

const routeCache = new Map<string, ReturnType<typeof routeFromFile>[]>()
const devIdempotency = createMemoryIdempotencyStore()

const SOURCE_EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js'] as const

type RouteComponent =
  | Child
  | ((
      props: Readonly<Record<string, string | string[]>>,
      context?: ComponentContext,
    ) => Child | Promise<Child>)

interface DevRouteModule {
  readonly default?:
    | RouteComponent
    | ((
        props: Readonly<Record<string, unknown>>,
        context?: ComponentContext,
      ) => Child | Promise<Child>)
  readonly seo?: SeoMetadata | ((context: { readonly pathname: string }) => SeoMetadata)
  readonly metadata?: Partial<SeoMetadata>
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
    process.env.NEXIL_TRUST_PROXY === '1' ? request.headers['x-forwarded-proto'] : undefined
  const forwardedHost =
    process.env.NEXIL_TRUST_PROXY === '1' ? request.headers['x-forwarded-host'] : undefined
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
  const match = /^\/__nexil\/actions\/(.+)\/([^/]+)$/.exec(pathname)
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
  readonly handle: NexilHandler
  readonly revision: () => number
  readonly invalidate: () => number
}

export function createDevServer(handler: NexilHandler): DevServer {
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

export function invalidateRouteCache(root?: string): void {
  if (root) routeCache.delete(root)
  else routeCache.clear()
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
        !entry.name.startsWith('layout.') &&
        !entry.name.startsWith('_layout.')
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

function toRelativeRouteFile(routeFile: string): string {
  return routeFile.replace(/\\/g, '/').replace(/^src\/routes\//, '')
}

async function discoverLayouts(root: string, routeFile: string): Promise<readonly string[]> {
  const routeRoot = join(root, 'src', 'routes')
  const normalized = toRelativeRouteFile(routeFile)
  const routeParts = normalized.split('/')
  const directories = routeParts.slice(0, -1)
  const candidates: string[] = []
  for (let index = 0; index <= directories.length; index += 1) {
    const directory = directories.slice(0, index).join('/')
    for (const stem of ['_layout', 'layout'] as const) {
      for (const extension of SOURCE_EXTENSIONS) {
        const relativePath = [directory, `${stem}${extension}`].filter(Boolean).join('/')
        if (existsSync(join(routeRoot, relativePath))) {
          candidates.push(relativePath)
          break
        }
      }
      if (candidates.at(-1)?.startsWith([directory, stem].filter(Boolean).join('/'))) break
    }
  }
  return candidates
}

async function applyLayouts(
  server: { readonly ssrLoadModule: (path: string) => Promise<unknown> },
  root: string,
  routeFile: string,
  child: Child,
  props: Readonly<Record<string, unknown>> = {},
  context?: ComponentContext,
): Promise<Child> {
  let current = child
  const layouts = await discoverLayouts(root, routeFile)
  // Apply from innermost to outermost so root remains outermost (mirrors production intent)
  for (let index = layouts.length - 1; index >= 0; index -= 1) {
    const layout = layouts[index]!
    const modulePath = `/src/routes/${layout}`
    let mod: DevRouteModule
    try {
      mod = routeModuleFromUnknown(await server.ssrLoadModule(modulePath))
    } catch {
      continue
    }
    const Layout = mod.default as
      | ((
          props: Readonly<Record<string, unknown> & { readonly children?: Child }>,
          ctx?: ComponentContext,
        ) => Child | Promise<Child>)
      | undefined
    if (typeof Layout === 'function') {
      const next = await Layout({ ...props, children: current }, context)
      // Layout may return null/undefined to indicate passthrough
      if (next !== undefined && next !== null) current = next as Child
    }
  }
  return current
}

async function resolveInheritedSeo(
  server: { readonly ssrLoadModule: (path: string) => Promise<unknown> },
  root: string,
  routeFile: string,
  routeModule: DevRouteModule,
  pathname: string,
  siteOrigin: string,
): Promise<SeoMetadata | undefined> {
  const inherited: Partial<SeoMetadata> = {}
  let inheritedOpenGraph: SeoMetadata['openGraph'] | undefined
  for (const layout of await discoverLayouts(root, routeFile)) {
    let layoutModule: DevRouteModule
    try {
      layoutModule = routeModuleFromUnknown(await server.ssrLoadModule(`/src/routes/${layout}`))
    } catch {
      continue
    }
    if (layoutModule.metadata) {
      Object.assign(inherited, layoutModule.metadata)
      if (layoutModule.metadata.openGraph) {
        inheritedOpenGraph = { ...inheritedOpenGraph, ...layoutModule.metadata.openGraph }
      }
    }
    // Legacy: layout may export seo instead of metadata
    if (layoutModule.seo) {
      const raw =
        typeof layoutModule.seo === 'function'
          ? (layoutModule.seo as (c: { pathname: string }) => SeoMetadata)({ pathname })
          : layoutModule.seo
      if (raw) {
        Object.assign(inherited, raw)
        if (raw.openGraph) inheritedOpenGraph = { ...inheritedOpenGraph, ...raw.openGraph }
      }
    }
  }
  const rawSeo = routeModule.seo
  const legacy = rawSeo
    ? typeof rawSeo === 'function'
      ? (rawSeo as (c: { pathname: string }) => SeoMetadata)({ pathname })
      : rawSeo
    : undefined
  const own = routeModule.metadata ?? {}
  const merged: Partial<SeoMetadata> = {
    ...inherited,
    ...(legacy ?? {}),
    ...own,
    ...(inheritedOpenGraph || legacy?.openGraph || own.openGraph
      ? {
          openGraph: {
            ...inheritedOpenGraph,
            ...legacy?.openGraph,
            ...own.openGraph,
          },
        }
      : {}),
  }
  if (typeof merged.title !== 'string' || merged.title.trim().length === 0) return undefined
  return withCanonical(merged as SeoMetadata, pathname, siteOrigin)
}

export function nexilSSRPlugin(root: string): Plugin {
  return {
    name: 'nexil-ssr',
    configureServer(server) {
      const invalidate = (file?: string) => {
        if (!file) {
          invalidateRouteCache(root)
          return
        }
        const normalized = file.replace(/\\/g, '/')
        if (normalized.includes('src/routes')) {
          invalidateRouteCache(root)
        }
      }
      server.watcher.on('add', (file) => invalidate(file))
      server.watcher.on('unlink', (file) => invalidate(file))
      server.watcher.on('change', (file) => invalidate(file))

      server.middlewares.use(async (req, res, next) => {
        try {
          const requestUrl = req.url || '/'
          const pathname = new URL(requestUrl, 'http://localhost').pathname
          if (pathname.startsWith('/__nexil/actions/')) {
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
            console.error(`[nexil] SSR load error for ${modulePath}:`, error.message)
            return next(error)
          }

          const siteOrigin = process.env.NEXIL_SITE_ORIGIN ?? 'https://nexil-showcase.example'
          const seo = await resolveInheritedSeo(
            server,
            root,
            filePath,
            routeModule,
            pathname,
            siteOrigin,
          )
          const head = (() => {
            try {
              if (seo?.title) return renderHead(seo)
            } catch {
              // Fall through to the escaped title fallback.
            }
            if (seo?.title) return `<title>${escapeHtml(seo.title)}</title>`
            return '<title>Nexil App</title>'
          })()

          const Component = routeModule.default as
            | ((
                props: Readonly<Record<string, string | string[]>>,
                ctx?: ComponentContext,
              ) => Child | Promise<Child>)
            | Child
            | undefined

          const devRequest = new Request(new URL(pathname, siteOrigin).href)
          const devRequestContext = createRequestContext(devRequest, `dev:${pathname}`)
          const normalizedContext: ComponentContext = {
            requestId: devRequestContext.id,
            scope: devRequestContext.scope,
          }
          ;(
            globalThis as unknown as { __nexil_buildRequestContext?: unknown }
          ).__nexil_buildRequestContext = devRequestContext as unknown

          const { renderedHtml, scripts: scriptsBase } = await runWithScope(
            devRequestContext.scope,
            async () => {
              let child: Child
              let isThunk = false
              if (typeof Component === 'function') {
                const pageThunk = () =>
                  (
                    Component as (
                      p: Readonly<Record<string, string | string[]>>,
                      c?: ComponentContext,
                    ) => Child | Promise<Child>
                  )(matched.params ?? {}, normalizedContext) as Child
                child = pageThunk as unknown as Child
                isThunk = true
              } else if (Component) {
                child = Component as Child
              } else {
                child = '' as unknown as Child
              }

              let composedRaw: Child
              try {
                composedRaw = await applyLayouts(
                  server,
                  root,
                  filePath,
                  child,
                  matched.params ?? {},
                  normalizedContext,
                )
              } catch (err) {
                if (err instanceof TypeError && /synchronously/.test(err.message)) {
                  const eager = await (
                    Component as (
                      p: Readonly<Record<string, string | string[]>>,
                      c?: ComponentContext,
                    ) => Child | Promise<Child>
                  )(matched.params ?? {}, normalizedContext)
                  child = eager as Child
                  isThunk = false
                  composedRaw = await applyLayouts(
                    server,
                    root,
                    filePath,
                    child,
                    matched.params ?? {},
                    normalizedContext,
                  )
                } else {
                  throw err
                }
              }
              const resolveThunk = (node: Child): Child => {
                if (typeof node === 'function') {
                  const res = (node as () => Child)()
                  if (res && typeof (res as unknown as { then?: unknown }).then === 'function') {
                    throw new TypeError('Async page with Provider requires explicit ContextScope')
                  }
                  return resolveThunk(res as Child)
                }
                if (Array.isArray(node))
                  return node.map((entry) => resolveThunk(entry as Child)) as unknown as Child
                if (node && typeof node === 'object' && 'kind' in node) {
                  const renderNode = node as unknown as {
                    kind: string
                    children?: readonly Child[]
                  }
                  if (renderNode.kind === 'element' && renderNode.children) {
                    return {
                      ...(node as object),
                      children: (renderNode.children as readonly Child[]).map((c) =>
                        resolveThunk(c as Child),
                      ),
                    } as unknown as Child
                  }
                }
                return node
              }
              let composed: Child = composedRaw
              if (isThunk) {
                try {
                  composed =
                    typeof composedRaw === 'function'
                      ? resolveThunk(composedRaw)
                      : (() => {
                          const deep = resolveThunk(composedRaw)
                          return deep
                        })()
                } catch (e) {
                  if (e instanceof TypeError && /Async page/.test((e as Error).message)) {
                    const eager = await (
                      Component as (
                        p: Readonly<Record<string, string | string[]>>,
                        c?: ComponentContext,
                      ) => Child | Promise<Child>
                    )(matched.params ?? {}, normalizedContext)
                    composed = await applyLayouts(
                      server,
                      root,
                      filePath,
                      eager as Child,
                      matched.params ?? {},
                      normalizedContext,
                    )
                  } else {
                    throw e
                  }
                }
              }
              const html = renderToString(composed as Child)
              const hasEventHandlers = html.includes('data-nx-on')
              const hasBindings = html.includes('data-nx-bind')
              const baseScripts = `${
                hasEventHandlers || hasBindings
                  ? '<script type="module" src="/nexil-bootstrap.js"></script>'
                  : ''
              }${hasBindings ? '<script type="module" src="/nexil-bindings.js"></script>' : ''}`
              return { renderedHtml: html, scripts: baseScripts }
            },
          )

          // Inject Nexil Stores state for this dev request (per-request via ALS)
          const storesScriptTag = await runWithScope(devRequestContext.scope, () =>
            __getStoresScriptTag(),
          )
          let scripts = scriptsBase
          if (storesScriptTag) scripts = `${storesScriptTag}${scripts}`
          await runWithScope(devRequestContext.scope, () => __clearAccessedStoreIds())

          let template: string
          try {
            template = await readFile(join(root, 'index.html'), 'utf-8')
          } catch {
            template = `<!DOCTYPE html><html lang="en"><head><!--nexil-head-outlet--></head><body><div id="app"><!--nexil-app-outlet--></div><!--nexil-scripts-outlet--></body></html>`
          }

          template = await server.transformIndexHtml(url, template)
          try {
            await readFile(join(root, 'src', 'styles.css'), 'utf8')
            template = injectStylesheetLink(template, '/src/styles.css')
          } catch {
            // Applications without a source stylesheet remain CSS-free by design.
          }

          const html = template
            .replace('<!--nexil-head-outlet-->', head)
            .replace('<!--nexil-app-outlet-->', renderedHtml)
            .replace('<!--nexil-scripts-outlet-->', scripts)

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

export async function createNexilDevMiddleware(root: string) {
  const { createServer } = await import('vite')
  const vite = await createServer({
    root,
    plugins: [nexil({ root }), nexilSSRPlugin(root)],
    server: { middlewareMode: true },
    appType: 'custom',
  })
  return vite.middlewares
}
