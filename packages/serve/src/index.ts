import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize, relative, resolve } from 'node:path'
import {
  createServer as createHttpServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http'
import { createMemoryIdempotencyStore, handleActionRequest } from '@mohammedaydan/actions'
import type { IdempotencyStore, ServerAction } from '@mohammedaydan/actions'

export interface ProductionServerOptions {
  readonly host?: string
  readonly port?: number
  readonly notFoundFile?: string
  readonly serverDir?: string
  readonly actionOrigins?: readonly string[]
  readonly redirects?: readonly RedirectRule[]
  readonly telemetry?: TelemetryReceiverOptions
  readonly idempotency?: IdempotencyStore
  /** Runs before Nexis route and Action handling for app-level guards and instrumentation. */
  readonly middleware?: readonly ProductionRequestHandler[]
  readonly cacheControl?: {
    readonly html?: string
    readonly assets?: string
  }
}

/** Optional project configuration. Applications run without it; use it to override defaults. */
export interface NexisConfig {
  readonly app?: {
    readonly origin?: string
  }
  readonly server?: ProductionServerOptions
  readonly redirects?: readonly RedirectRule[]
  readonly feed?: {
    readonly title?: string
    readonly description?: string
    readonly language?: string
  }
}

/** Define typed optional project configuration with no runtime work. */
export function defineConfig<Config extends NexisConfig>(config: Config): Config {
  return config
}

export interface RedirectRule {
  readonly from: string
  readonly to: string
  readonly status: 301 | 308
}

export interface TelemetryReceiverOptions {
  readonly endpoint?: string
  readonly onEvent?: (event: unknown) => void
}

export interface ProductionRequestHandler {
  (request: IncomingMessage, response: ServerResponse, next?: () => void): void | Promise<void>
}

export interface ProductionServer {
  readonly middleware: ProductionRequestHandler
  readonly server: Server
  readonly listen: (port?: number, host?: string) => Promise<Server>
  readonly close: () => Promise<void>
}

/** Compose Node middleware in order. The Nexis route handler is normally the final handler. */
export function composeMiddleware(
  ...handlers: readonly ProductionRequestHandler[]
): ProductionRequestHandler {
  return async (request, response, next) => {
    let cursor = -1
    const dispatch = async (index: number): Promise<void> => {
      if (index <= cursor) throw new Error('Nexis middleware called next() more than once.')
      cursor = index
      const handler = handlers[index]
      if (!handler) {
        next?.()
        return
      }
      await handler(request, response, () => dispatch(index + 1))
    }
    await dispatch(0)
  }
}

const MIME_TYPES: Readonly<Record<string, string>> = {
  '.avif': 'image/avif',
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webm': 'video/webm',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml; charset=utf-8',
}

const DEFAULT_NOT_FOUND =
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Not Found</title></head><body><h1>Not Found</h1></body></html>'

function pathnameFromRequest(request: IncomingMessage): string {
  try {
    return new URL(request.url ?? '/', 'http://nexis.invalid').pathname
  } catch {
    return '/%invalid%'
  }
}

function candidates(pathname: string): readonly string[] {
  const clean = pathname.replace(/^\/+/, '').replace(/\/$/, '')
  if (!clean) return ['index.html']
  return [`${clean}/index.html`, clean]
}

function safeFile(root: string, candidate: string): string | undefined {
  const file = normalize(join(root, candidate))
  const relativePath = relative(root, file)
  if (relativePath.startsWith('..') || relativePath.includes('..')) return undefined
  return file
}

function isAsset(candidate: string): boolean {
  return (
    candidate.startsWith('assets/') ||
    candidate.startsWith('nexis-') ||
    extname(candidate).toLowerCase() !== '.html'
  )
}

function setCommonHeaders(
  response: ServerResponse,
  contentType: string,
  cacheControl: string,
): void {
  response.setHeader('Content-Type', contentType)
  response.setHeader('Cache-Control', cacheControl)
  response.setHeader('X-Content-Type-Options', 'nosniff')
}

async function requestFromNode(request: IncomingMessage): Promise<Request> {
  const chunks: Buffer[] = []
  for await (const chunk of request) {
    chunks.push(Buffer.from(chunk))
    if (Buffer.concat(chunks).byteLength > 1024 * 1024)
      throw new RangeError('Action request body exceeds 1MB.')
  }
  const headers = new Headers()
  for (const [name, value] of Object.entries(request.headers)) {
    if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value)
  }
  const method = request.method ?? 'GET'
  const init: RequestInit = { method, headers }
  if (method !== 'GET' && method !== 'HEAD') init.body = Buffer.concat(chunks)
  return new Request(`http://${request.headers.host ?? 'localhost'}${request.url ?? '/'}`, init)
}

async function findAction(
  serverDir: string | undefined,
  route: string,
  actionName: string,
): Promise<ServerAction<unknown, unknown> | undefined> {
  if (!serverDir || !/^[a-zA-Z0-9_/-]+$/.test(route) || !/^[a-zA-Z0-9_-]+$/.test(actionName))
    return undefined
  const file = resolve(serverDir, `${route}.js`)
  if (relative(resolve(serverDir), file).startsWith('..')) return undefined
  try {
    const module = (await import(`${file}?nexis-action=${Date.now()}`)) as {
      readonly actions?: Readonly<Record<string, ServerAction<unknown, unknown>>>
    }
    return module.actions?.[actionName]
  } catch {
    return undefined
  }
}

/** Create the route-aware Nexis request handler for an existing Node server. */
export function createMiddleware(
  distDir: string,
  options: ProductionServerOptions = {},
): ProductionRequestHandler {
  const root = resolve(distDir)
  for (const redirect of options.redirects ?? []) {
    if (!/^\/(?:[^?#]*)$/.test(redirect.from) || !/^\/(?:[^?#]*)$/.test(redirect.to))
      throw new TypeError('Redirect paths must be local absolute paths.')
    if (redirect.status !== 301 && redirect.status !== 308)
      throw new TypeError('Redirect status must be 301 or 308.')
  }
  const idempotency = options.idempotency ?? createMemoryIdempotencyStore()
  const htmlCache = options.cacheControl?.html ?? 'public, max-age=0, must-revalidate'
  const assetCache = options.cacheControl?.assets ?? 'public, max-age=31536000, immutable'
  return async (request, response, next) => {
    const pathname = pathnameFromRequest(request)
    const method = request.method ?? 'GET'
    const telemetryEndpoint = options.telemetry?.endpoint ?? '/__nexis/telemetry'
    if (method === 'POST' && pathname === telemetryEndpoint) {
      try {
        const requestBody = await requestFromNode(request)
        const event = await requestBody.json()
        if (!event || typeof event !== 'object' || Array.isArray(event))
          throw new TypeError('Telemetry event must be an object.')
        options.telemetry?.onEvent?.(event)
        response.statusCode = 202
        setCommonHeaders(response, 'application/json; charset=utf-8', 'no-store')
        response.end(JSON.stringify({ ok: true }))
      } catch (error) {
        response.statusCode = 400
        setCommonHeaders(response, 'application/json; charset=utf-8', 'no-store')
        response.end(
          JSON.stringify({
            ok: false,
            errors: [error instanceof Error ? error.message : 'Invalid telemetry event.'],
          }),
        )
      }
      return
    }
    const redirect = (options.redirects ?? []).find((candidate) => candidate.from === pathname)
    if (redirect) {
      response.statusCode = redirect.status
      response.setHeader('Location', redirect.to)
      setCommonHeaders(response, 'text/plain; charset=utf-8', 'no-store')
      response.end(method === 'HEAD' ? undefined : `Redirecting to ${redirect.to}`)
      return
    }
    const actionMatch = /^\/__nexis\/actions\/(.+)\/([^/]+)$/.exec(pathname)
    if (actionMatch) {
      const actionRoute = actionMatch[1]
      const actionName = actionMatch[2]
      if (!actionRoute || !actionName) {
        response.statusCode = 404
        setCommonHeaders(response, 'application/json; charset=utf-8', 'no-store')
        response.end(JSON.stringify({ ok: false, errors: ['Unknown action endpoint.'] }))
        return
      }
      const action = await findAction(options.serverDir, actionRoute, actionName)
      if (!action) {
        response.statusCode = 404
        setCommonHeaders(response, 'application/json; charset=utf-8', 'no-store')
        response.end(JSON.stringify({ ok: false, errors: ['Unknown action endpoint.'] }))
        return
      }
      try {
        const actionRequest = await requestFromNode(request)
        const actionResponse = await handleActionRequest(actionRequest, action, {
          allowedOrigins: options.actionOrigins ?? [],
          idempotency,
        })
        response.statusCode = actionResponse.status
        actionResponse.headers.forEach((value: string, name: string) =>
          response.setHeader(name, value),
        )
        response.end(Buffer.from(await actionResponse.arrayBuffer()))
      } catch (error) {
        response.statusCode = 413
        setCommonHeaders(response, 'application/json; charset=utf-8', 'no-store')
        response.end(
          JSON.stringify({
            ok: false,
            errors: [error instanceof Error ? error.message : 'Invalid action request.'],
          }),
        )
      }
      return
    }
    if (method !== 'GET' && method !== 'HEAD') {
      response.statusCode = 405
      response.setHeader('Allow', 'GET, HEAD')
      setCommonHeaders(response, 'text/plain; charset=utf-8', 'no-store')
      response.end('Method Not Allowed')
      return
    }

    for (const candidate of candidates(pathname)) {
      const file = safeFile(root, candidate)
      if (!file) continue
      try {
        const info = await stat(file)
        if (!info.isFile()) continue
        const body = await readFile(file)
        const asset = isAsset(candidate)
        setCommonHeaders(
          response,
          MIME_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
          asset ? assetCache : htmlCache,
        )
        response.statusCode = 200
        response.end(method === 'HEAD' ? undefined : body)
        return
      } catch {
        // Try the next candidate and return a framework 404 if neither exists.
      }
    }

    const notFoundFile = options.notFoundFile
      ? resolve(options.notFoundFile)
      : join(root, '404.html')
    let notFoundBody: Buffer | string = DEFAULT_NOT_FOUND
    try {
      notFoundBody = await readFile(notFoundFile)
    } catch {
      // The built-in framework document is the final 404 template.
    }
    response.statusCode = 404
    setCommonHeaders(response, 'text/html; charset=utf-8', 'no-store')
    response.end(method === 'HEAD' ? undefined : notFoundBody)
    void next
  }
}

/** Create a production-ready Nexis server with route, Action, cache, and security defaults. */
export function createServer(
  distDir: string,
  options: ProductionServerOptions = {},
): ProductionServer {
  const routeMiddleware = createMiddleware(distDir, options)
  const middleware = options.middleware?.length
    ? composeMiddleware(...options.middleware, routeMiddleware)
    : routeMiddleware
  const server = createHttpServer((request, response) => {
    void middleware(request, response)
  })
  return {
    middleware,
    server,
    listen: (port = options.port ?? 4173, host = options.host ?? '0.0.0.0') =>
      new Promise((resolvePromise, reject) => {
        const onError = (error: Error) => {
          server.off('listening', onListening)
          reject(error)
        }
        const onListening = () => {
          server.off('error', onError)
          resolvePromise(server)
        }
        server.once('error', onError)
        server.once('listening', onListening)
        server.listen(port, host)
      }),
    close: () =>
      new Promise((resolvePromise, reject) => {
        if (!server.listening) {
          resolvePromise()
          return
        }
        server.close((error) => (error ? reject(error) : resolvePromise()))
      }),
  }
}

/** @deprecated Use createMiddleware for new projects. */
export const createProductionMiddleware = createMiddleware

/** @deprecated Use createServer for new projects. */
export const createProductionServer = createServer

export type { Server, ServerResponse }
