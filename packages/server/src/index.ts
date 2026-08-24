import type { RequestContext } from '@nexis/core'

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
  return { request: context.request, id, values: new Map() }
}
