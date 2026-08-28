import { describe, expect, it } from 'vitest'
import {
  createSession,
  hasPermission,
  hasRole,
  requireAccess,
  requirePermission,
  requireRole,
} from './index.js'
import type { Principal, Session, SessionStore } from './index.js'

type User = Principal & { readonly tenantId: string }

class MemorySessions implements SessionStore<User> {
  readonly records = new Map<string, Session<User>>()
  readonly destroyed: string[] = []

  async find(id: string): Promise<Session<User> | undefined> {
    return this.records.get(id)
  }

  async destroy(id: string): Promise<void> {
    this.destroyed.push(id)
    this.records.delete(id)
  }
}

describe('Nexil security', () => {
  it('uses secure cookie defaults and resolves an application-owned session', async () => {
    const store = new MemorySessions()
    const user: User = {
      id: 'user_1',
      tenantId: 'tenant_a',
      roles: ['admin'],
      permissions: ['billing:read'],
    }
    store.records.set('session_1', { id: 'session_1', principal: user })
    const sessions = createSession(store)
    const cookie = sessions.setCookie('session_1')
    expect(cookie).toContain('Secure')
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Lax')
    const request = new Request('https://app.example.test', {
      headers: { cookie: 'nexis_session=session_1' },
    })
    await expect(sessions.require(request)).resolves.toMatchObject({ principal: { id: 'user_1' } })
    expect(sessions.clearCookie()).toContain('Max-Age=0')
  })

  it('expires sessions and provides clear role, permission, and ownership guards', async () => {
    const store = new MemorySessions()
    store.records.set('expired', {
      id: 'expired',
      principal: { id: 'user_1', tenantId: 'tenant_a' },
      expiresAt: new Date(0),
    })
    const sessions = createSession(store)
    await expect(
      sessions.read(
        new Request('https://app.example.test', { headers: { cookie: 'nexis_session=expired' } }),
      ),
    ).resolves.toBeUndefined()
    expect(store.destroyed).toContain('expired')
    const principal: User = {
      id: 'user_1',
      tenantId: 'tenant_a',
      roles: ['admin'],
      permissions: ['invoice:approve'],
    }
    expect(hasRole(principal, 'admin')).toBe(true)
    expect(hasPermission(principal, 'invoice:approve')).toBe(true)
    expect(() => requireRole(principal, 'member')).toThrow(Response)
    expect(() => requirePermission(principal, 'invoice:delete')).toThrow(Response)
    await expect(
      requireAccess(
        principal,
        { tenantId: 'tenant_a' },
        (user, invoice) => user.tenantId === invoice.tenantId,
      ),
    ).resolves.toBeUndefined()
    await expect(
      requireAccess(
        principal,
        { tenantId: 'tenant_b' },
        (user, invoice) => user.tenantId === invoice.tenantId,
      ),
    ).rejects.toBeInstanceOf(Response)
  })
})
