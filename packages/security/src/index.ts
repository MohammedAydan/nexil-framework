import { getCookie, serializeCookie } from '@mohammedaydan/server'
import type { CookieOptions } from '@mohammedaydan/server'

/** The minimum identity information needed for framework-level access checks. */
export interface Principal {
  readonly id: string
  readonly roles?: readonly string[]
  readonly permissions?: readonly string[]
}

export interface Session<Identity extends Principal = Principal> {
  readonly id: string
  readonly principal: Identity
  readonly expiresAt?: Date
}

/** Implement persistence in the application (database, Redis, or another durable store). */
export interface SessionStore<Identity extends Principal = Principal> {
  find(id: string): Promise<Session<Identity> | undefined>
  destroy(id: string): Promise<void>
}

export interface SessionOptions {
  readonly cookieName?: string
  readonly cookie?: CookieOptions
}

export interface SessionManager<Identity extends Principal = Principal> {
  readonly cookieName: string
  read(request: Request): Promise<Session<Identity> | undefined>
  require(request: Request): Promise<Session<Identity>>
  setCookie(sessionId: string): string
  clearCookie(): string
  destroy(request: Request): Promise<void>
}

const DEFAULT_COOKIE_NAME = 'nexis_session'

function cookieOptions(options: SessionOptions): CookieOptions {
  return {
    secure: true,
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    ...options.cookie,
  }
}

/**
 * Creates a secure, storage-agnostic session manager. Nexis does not own users,
 * credentials, OAuth/OIDC verification, or the database behind this adapter.
 */
export function createSession<Identity extends Principal = Principal>(
  store: SessionStore<Identity>,
  options: SessionOptions = {},
): SessionManager<Identity> {
  const cookieName = options.cookieName ?? DEFAULT_COOKIE_NAME
  const optionsForCookie = cookieOptions(options)
  const read = async (request: Request): Promise<Session<Identity> | undefined> => {
    const id = getCookie(request, cookieName)
    if (!id) return undefined
    const session = await store.find(id)
    if (!session) return undefined
    if (session.expiresAt && session.expiresAt.getTime() <= Date.now()) {
      await store.destroy(session.id)
      return undefined
    }
    return session
  }
  return {
    cookieName,
    read,
    async require(request) {
      const session = await read(request)
      if (!session) throw new Response('Unauthorized', { status: 401 })
      return session
    },
    setCookie(sessionId) {
      return serializeCookie(cookieName, sessionId, optionsForCookie)
    },
    clearCookie() {
      return serializeCookie(cookieName, 'deleted', { ...optionsForCookie, maxAge: 0 })
    },
    async destroy(request) {
      const id = getCookie(request, cookieName)
      if (id) await store.destroy(id)
    },
  }
}

export function hasRole(principal: Principal, role: string): boolean {
  return principal.roles?.includes(role) ?? false
}

export function hasPermission(principal: Principal, permission: string): boolean {
  return principal.permissions?.includes(permission) ?? false
}

export function requireRole(principal: Principal, role: string): void {
  if (!hasRole(principal, role)) throw new Response('Forbidden', { status: 403 })
}

export function requirePermission(principal: Principal, permission: string): void {
  if (!hasPermission(principal, permission)) throw new Response('Forbidden', { status: 403 })
}

export type AuthorizationRule<Resource, Identity extends Principal = Principal> = (
  principal: Identity,
  resource: Resource,
) => boolean | Promise<boolean>

/** Require a role/permission policy plus the application’s resource ownership rule. */
export async function requireAccess<Resource, Identity extends Principal = Principal>(
  principal: Identity,
  resource: Resource,
  rule: AuthorizationRule<Resource, Identity>,
): Promise<void> {
  if (!(await rule(principal, resource))) throw new Response('Forbidden', { status: 403 })
}
