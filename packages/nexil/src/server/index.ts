import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Child } from '../core/index.js'
import {
  createRequestContext,
  getActiveScope,
  runWithScope,
  type RequestContext,
} from '../core/index.js'
import { renderToString, renderToStream, type RenderStreamOptions } from './renderer.js'
import { matchRoute, resolveRoute, type RouteMatch, type RouteRecord } from '../router/index.js'

// -----------------------------------------------------------------------------
// Data Context & Deduplication
// -----------------------------------------------------------------------------

export interface DataContext {
  readonly request: Request
  readonly pending: Map<string, Promise<unknown>>
}

export function createDataContext(request: Request): DataContext {
  return { request, pending: new Map() }
}

export function data<T>(
  context: DataContext,
  key: string,
  loader: () => T | Promise<T>,
): Promise<T> {
  if (!/^[\w:./-]+$/.test(key)) throw new TypeError('Data keys must be non-empty safe identifiers.')
  const existing = context.pending.get(key)
  if (existing) return existing as Promise<T>
  const pending = Promise.resolve().then(loader)
  context.pending.set(key, pending)
  return pending
}

// -----------------------------------------------------------------------------
// Cookies & Security Headers
// -----------------------------------------------------------------------------

export interface CookieOptions {
  readonly maxAge?: number
  readonly expires?: Date
  readonly path?: string
  readonly domain?: string
  readonly secure?: boolean
  readonly httpOnly?: boolean
  readonly sameSite?: 'Strict' | 'Lax' | 'None'
}

function assertToken(value: string, label: string): void {
  if (!value || /[\r\n;]/.test(value)) throw new TypeError(`Invalid cookie ${label}.`)
}

export function serializeCookie(name: string, value: string, options: CookieOptions = {}): string {
  assertToken(name, 'name')
  assertToken(value, 'value')
  const path = options.path ?? '/'
  if (!path.startsWith('/') || /[\r\n;]/.test(path)) throw new TypeError('Invalid cookie path.')
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${path}`]
  if (options.secure ?? true) parts.push('Secure')
  if (options.httpOnly ?? true) parts.push('HttpOnly')
  parts.push(`SameSite=${options.sameSite ?? 'Lax'}`)
  if (options.maxAge !== undefined) {
    if (!Number.isInteger(options.maxAge) || options.maxAge < 0)
      throw new TypeError('Invalid cookie maxAge.')
    parts.push(`Max-Age=${options.maxAge}`)
  }
  if (options.expires) parts.push(`Expires=${options.expires.toUTCString()}`)
  if (options.domain) {
    assertToken(options.domain, 'domain')
    parts.push(`Domain=${options.domain}`)
  }
  return parts.join('; ')
}

function cookieHeader(input: Request | Headers | string): string {
  if (typeof input === 'string') return input
  if (input instanceof Request) return input.headers.get('cookie') ?? ''
  return input.get('cookie') ?? ''
}

/** Parse a Cookie header without throwing on malformed percent-encoding. */
export function parseCookies(input: Request | Headers | string): Record<string, string> {
  const cookies: Record<string, string> = {}
  for (const part of cookieHeader(input).split(';')) {
    const separator = part.indexOf('=')
    if (separator <= 0) continue
    const name = part.slice(0, separator).trim()
    const rawValue = part.slice(separator + 1).trim()
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name)) continue
    try {
      cookies[name] = decodeURIComponent(rawValue)
    } catch {
      cookies[name] = rawValue
    }
  }
  return cookies
}

export function getCookie(input: Request | Headers | string, name: string): string | undefined {
  assertToken(name, 'name')
  return parseCookies(input)[name]
}

export function notFound(message = 'Not Found'): Response {
  return new Response(message, { status: 404, statusText: 'Not Found' })
}

export function createSecurityHeaders(nonce?: string): Headers {
  if (nonce !== undefined && !/^[a-zA-Z0-9+/_-]+={0,2}$/.test(nonce))
    throw new TypeError('Invalid CSP nonce.')
  const scriptSource = nonce ? ` 'nonce-${nonce}'` : ''
  const headers = new Headers()
  headers.set(
    'Content-Security-Policy',
    `default-src 'self'; script-src 'self'${scriptSource}; object-src 'none'; base-uri 'self'; frame-ancestors 'none'`,
  )
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  headers.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=()')
  return headers
}

// -----------------------------------------------------------------------------
// RequestEvent & Server Primitives
// -----------------------------------------------------------------------------

export interface RequestEvent<
  Params extends Readonly<Record<string, string | string[]>> = Readonly<
    Record<string, string | string[]>
  >,
> {
  readonly request: Request
  readonly url: URL
  readonly params: Params
  readonly cookies: Record<string, string>
  readonly data: DataContext
  getCookie(name: string): string | undefined
  setCookie(name: string, value: string, options?: CookieOptions): void
  json<T>(data: T, init?: ResponseInit): Response
  text(data: string, init?: ResponseInit): Response
  redirect(location: string, status?: 301 | 302 | 303 | 307 | 308): Response
  notFound(message?: string): Response
}

export function createRequestEvent<
  Params extends Readonly<Record<string, string | string[]>> = Readonly<
    Record<string, string | string[]>
  >,
>(request: Request, params: Params = {} as Params): RequestEvent<Params> {
  const url = new URL(request.url)
  const cookies = parseCookies(request)
  const dataContext = createDataContext(request)
  const outgoingCookies: string[] = []

  const event: RequestEvent<Params> = {
    request,
    url,
    params,
    cookies,
    data: dataContext,
    getCookie: (name) => cookies[name],
    setCookie: (name, value, options) => {
      outgoingCookies.push(serializeCookie(name, value, options))
    },
    json: (data, init = {}) => {
      const headers = new Headers(init.headers)
      headers.set('Content-Type', 'application/json')
      for (const c of outgoingCookies) headers.append('Set-Cookie', c)
      return new Response(JSON.stringify(data), { ...init, headers })
    },
    text: (data, init = {}) => {
      const headers = new Headers(init.headers)
      headers.set('Content-Type', 'text/plain; charset=utf-8')
      for (const c of outgoingCookies) headers.append('Set-Cookie', c)
      return new Response(data, { ...init, headers })
    },
    redirect: (location, status = 302) => {
      const headers = new Headers()
      headers.set('Location', location)
      for (const c of outgoingCookies) headers.append('Set-Cookie', c)
      return new Response(null, { status, headers })
    },
    notFound: (message = 'Not Found') => notFound(message),
  }

  return event
}

// -----------------------------------------------------------------------------
// Data Loaders (routeLoader$) & Server Actions (serverAction$)
// -----------------------------------------------------------------------------

export interface RouteLoader<T> {
  (): T
  readonly key: string
  run(event: RequestEvent): Promise<T>
}

let loaderKeyCounter = 0

/**
 * Declares a server data loader that runs on the server before page rendering,
 * serializes returned data into the SSR state snapshot, and returns a typed getter signal.
 */
export function routeLoader$<T>(loaderFn: (event: RequestEvent) => T | Promise<T>): RouteLoader<T> {
  const key = `nx:loader:${++loaderKeyCounter}`
  let currentLoadedValue: T | undefined

  const loaderInstance: RouteLoader<T> = Object.assign(
    () => {
      return currentLoadedValue as T
    },
    {
      key,
      run: async (event: RequestEvent): Promise<T> => {
        const value = await loaderFn(event)
        currentLoadedValue = value
        return value
      },
    },
  )

  return loaderInstance
}

export type NexilHandler = (req: Request) => Promise<Response>

export interface ServerAction<Input, Output> {
  (input: Input): Promise<Output>
  readonly endpoint: string
  run(input: Input, event: RequestEvent): Promise<Output>
  submit(formData: FormData, event: RequestEvent): Promise<Output>
  execute(context: { readonly request: Request; readonly data?: DataContext }, input: unknown): Promise<Output>
}

let actionKeyCounter = 0

/**
 * Declares a type-safe server action supporting form submissions (POST)
 * and progressive enhancement client RPCs.
 */
export function serverAction$<Input, Output>(
  actionFn: (input: Input, event: RequestEvent) => Output | Promise<Output>,
  options: { readonly endpoint?: string } = {},
): ServerAction<Input, Output> {
  const id = ++actionKeyCounter
  const endpoint = options.endpoint ?? `/__nexil/actions/action_${id}`

  const actionInstance: ServerAction<Input, Output> = Object.assign(
    async (input: Input): Promise<Output> => {
      // In client environment: post to endpoint
      if (typeof window !== 'undefined') {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        })
        return res.json() as Promise<Output>
      }
      throw new Error(
        'serverAction$ called directly on server without request context; use action.run(input, event)',
      )
    },
    {
      endpoint,
      run: async (input: Input, event: RequestEvent): Promise<Output> => {
        return actionFn(input, event)
      },
      submit: async (formData: FormData, event: RequestEvent): Promise<Output> => {
        const data: Record<string, unknown> = {}
        formData.forEach((value, key) => {
          const prev = data[key]
          if (prev === undefined) data[key] = value
          else data[key] = Array.isArray(prev) ? [...prev, value] : [prev, value]
        })
        return actionFn(data as unknown as Input, event)
      },
      execute: async (context: { readonly request: Request; readonly data?: DataContext }, input: unknown): Promise<Output> => {
        const event = createRequestEvent(context.request)
        return actionFn(input as Input, event)
      },
    },
  )

  return actionInstance
}

export const action$ = serverAction$

// -----------------------------------------------------------------------------
// Unified Nexil Web Handler & Node.js Adapter
// -----------------------------------------------------------------------------

export interface RouteModule {
  readonly default?: (props: Record<string, unknown>) => Child
  readonly loader?: RouteLoader<unknown> | ((event: RequestEvent) => unknown | Promise<unknown>)
  readonly action?: ServerAction<unknown, unknown>
}

export interface NexilHandlerOptions {
  readonly routes: readonly RouteRecord[]
  readonly loadRoute: (file: string) => Promise<RouteModule>
  readonly renderMode?: 'string' | 'stream'
  readonly streamOptions?: RenderStreamOptions
}

/**
 * Creates a unified standard Web Fetch handler `(Request) => Promise<Response>`.
 */
export function createNexilHandler(
  options: NexilHandlerOptions,
): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url)
    const match = resolveRoute(options.routes, url.pathname)

    if (!match) {
      return notFound(`Cannot find route: ${url.pathname}`)
    }

    const event = createRequestEvent(request, match.params)
    const routeModule = await options.loadRoute(match.route.file)

    // Handle POST action submissions
    if (request.method === 'POST') {
      if (routeModule.action) {
        let input: unknown = {}
        const contentType = request.headers.get('content-type') ?? ''
        if (contentType.includes('application/json')) {
          input = await request.json().catch(() => ({}))
        } else if (
          contentType.includes('multipart/form-data') ||
          contentType.includes('application/x-www-form-urlencoded')
        ) {
          const formData = await request.formData()
          return event.json(await routeModule.action.submit(formData, event))
        }
        return event.json(await routeModule.action.run(input, event))
      }
    }

    // Run loader if defined
    let loaderData: unknown = undefined
    if (routeModule.loader) {
      if (typeof (routeModule.loader as RouteLoader<unknown>).run === 'function') {
        loaderData = await (routeModule.loader as RouteLoader<unknown>).run(event)
      } else if (typeof routeModule.loader === 'function') {
        loaderData = await (routeModule.loader as (e: RequestEvent) => unknown)(event)
      }
    }

    // Render component
    const Component = routeModule.default
    if (!Component) {
      return notFound('Missing page component.')
    }

    const elementTree = Component({ params: match.params, data: loaderData })

    if (options.renderMode === 'stream') {
      const stream = renderToStream(elementTree, options.streamOptions)
      const headers = createSecurityHeaders()
      headers.set('Content-Type', 'text/html; charset=utf-8')
      return new Response(stream, { status: 200, headers })
    }

    const html = renderToString(elementTree)
    const headers = createSecurityHeaders()
    headers.set('Content-Type', 'text/html; charset=utf-8')
    return new Response(html, { status: 200, headers })
  }
}

/**
 * Converts a Node.js `http.IncomingMessage` / `http.ServerResponse` into Web Fetch API.
 */
export function createNodeHandler(
  handler: (request: Request) => Promise<Response>,
): (req: IncomingMessage, res: ServerResponse) => void {
  return async (req: IncomingMessage, res: ServerResponse) => {
    try {
      const protocol = (req.socket as { encrypted?: boolean }).encrypted ? 'https' : 'http'
      const host = req.headers.host ?? 'localhost'
      const url = new URL(req.url ?? '/', `${protocol}://${host}`)

      const headers = new Headers()
      for (const [key, value] of Object.entries(req.headers)) {
        if (value === undefined) continue
        if (Array.isArray(value)) {
          for (const v of value) headers.append(key, v)
        } else {
          headers.set(key, value)
        }
      }

      const body =
        req.method === 'GET' || req.method === 'HEAD'
          ? undefined
          : new ReadableStream({
              start(controller) {
                req.on('data', (chunk) => controller.enqueue(chunk))
                req.on('end', () => controller.close())
                req.on('error', (err) => controller.error(err))
              },
            })

      const webRequest = new Request(url.href, {
        method: req.method,
        headers,
        body,
        // @ts-expect-error duplex required for Node.js fetch with ReadableStream body
        duplex: 'half',
      })

      const webResponse = await handler(webRequest)

      res.statusCode = webResponse.status
      webResponse.headers.forEach((value, key) => {
        res.setHeader(key, value)
      })

      if (!webResponse.body) {
        res.end()
        return
      }

      const reader = webResponse.body.getReader()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        res.write(value)
      }
      res.end()
    } catch (error) {
      if (!res.headersSent) {
        res.statusCode = 500
        res.setHeader('Content-Type', 'text/plain')
        res.end('Internal Server Error')
      }
    }
  }
}

// -----------------------------------------------------------------------------
// Legacy Loader Compatibility API
// -----------------------------------------------------------------------------

export interface LoaderContext<
  Params extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>,
> {
  readonly request: Request
  readonly params: Params
  readonly data: DataContext
}

export type Loader<Params extends Readonly<Record<string, unknown>>, Output> = (
  context: LoaderContext<Params>,
) => Output | Promise<Output>

export function defineLoader<Params extends Readonly<Record<string, unknown>>, Output>(
  loader: Loader<Params, Output>,
): Loader<Params, Output> {
  return loader
}

export function requestContextFromData(context: DataContext, id: string): RequestContext {
  return createRequestContext(context.request, id)
}

export * from './renderer.js'
export * from './stream.js'
export * from './actions.js'
export * from './modes.js'
export * from './adapters.js'



