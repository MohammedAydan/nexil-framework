import { createRequestContext, type RequestContext } from '@nexil/core'

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

export function requestContextFromData(context: DataContext, id: string): RequestContext {
  return createRequestContext(context.request, id)
}
