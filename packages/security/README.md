# `@mohammedaydan/security`

`@mohammedaydan/security` provides the **framework-level building blocks** for sessions and authorization. It intentionally does not own users, passwords, OAuth/OIDC verification, a database, or a distributed cache. Applications provide their own durable session store and identity flow.

```ts
import { createSession, requirePermission } from '@mohammedaydan/security'

const sessions = createSession(sessionStore)

export async function requireBillingAccess(request: Request) {
  const { principal } = await sessions.require(request)
  requirePermission(principal, 'billing:read')
  return principal
}
```

`createSession(store)` uses an opaque cookie id and secure defaults: `Secure`, `HttpOnly`, `SameSite=Lax`, and `Path=/`. The store must implement `find(id)` and `destroy(id)`; use a durable implementation when running more than one process.

| API                                        | Purpose                                                              |
| ------------------------------------------ | -------------------------------------------------------------------- |
| `createSession(store, options?)`           | Read, require, issue, clear, and destroy application-owned sessions. |
| `hasRole` / `requireRole`                  | Check or enforce one role.                                           |
| `hasPermission` / `requirePermission`      | Check or enforce one explicit permission.                            |
| `requireAccess(principal, resource, rule)` | Enforce application-owned tenant, ownership, or ABAC policy.         |

Use the helpers inside Actions and server guards. Never trust roles, permissions, or account ownership supplied by the browser. Keep session identifiers out of localStorage and rotate/revoke them through the application’s identity service.
