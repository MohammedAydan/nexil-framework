# Security, authentication, authorization, and middleware

Nexil now provides a concise security surface for the parts a framework can safely standardize: opaque session cookies, session lookup contracts, role and permission checks, ownership policies, and Node middleware composition. It does **not** ship a password database, OAuth/OIDC client, user directory, MFA flow, identity provider, distributed rate limiter, or audit-log backend. Those remain explicit application choices.

## Session-first authentication

Persist a session server-side and place only its opaque identifier in a secure cookie.

```ts
import { createSession } from '@nexil/security'

const sessions = createSession(sessionStore)

export async function currentPrincipal(request: Request) {
  const { principal } = await sessions.require(request)
  return principal
}
```

The store must provide `find(id)` and `destroy(id)`. `createSession` emits `Secure`, `HttpOnly`, `SameSite=Lax`, and `Path=/` by default. Use a durable store for multiple production instances, rotate ids after authentication and privilege changes, and implement expiry and revocation deliberately.

## Authorization

Roles are coarse policy inputs; permissions are explicit capabilities; ownership and tenant checks belong to the application resource rule.

```ts
import { requireAccess, requirePermission } from '@nexil/security'

const principal = await currentPrincipal(request)
requirePermission(principal, 'invoice:approve')
await requireAccess(
  principal,
  invoice,
  (user, record) => user.id === record.ownerId || user.roles?.includes('finance-admin'),
)
```

Run authorization in the Action or server guard that owns the resource. Hiding a client control is not enforcement. Never trust a role, tenant id, permission, or owner id from a hidden form input.

## Actions

Actions remain the mutation boundary. Validation, origin policy, session resolution, authorization, ownership, CSRF policy, and idempotency have separate responsibilities.

```ts
import { action } from '@nexil/actions'
import { requirePermission } from '@nexil/security'

export const approveInvoice = action({
  validate: parseApprovalInput,
  async authorize(context, input) {
    const { principal } = await sessions.require(context.request)
    requirePermission(principal, 'invoice:approve')
    const invoice = await invoices.find(input.invoiceId)
    await requireAccess(principal, invoice, canApproveInvoice)
  },
  async handle(_context, input) {
    return invoices.approve(input.invoiceId)
  },
})
```

Use a durable idempotency store for retriable financial or externally visible operations. Origin checks are important, but they never replace session or resource authorization.

## Middleware

Use middleware for cross-cutting request work and let the final Nexil handler serve routes and Actions.

```ts
import { composeMiddleware, createMiddleware } from '@nexil/serve'

const handler = composeMiddleware(
  requestIdMiddleware,
  sessionResolutionMiddleware,
  rateLimitMiddleware,
  createMiddleware('./dist/client'),
)
```

Middleware runs in order and must call `next()` at most once. Use it for request ids, structured logging, initial session resolution, rate limits, security headers, and private-prefix guards. Keep a resource-level authorization check in the Action or endpoint itself.

## Production checklist

| Control    | Requirement                                                                   |
| ---------- | ----------------------------------------------------------------------------- |
| Cookies    | `Secure`, `HttpOnly`, `SameSite`, explicit expiry, rotation, revocation.      |
| Actions    | Origin policy, validation, session, permission, ownership, CSRF, idempotency. |
| Middleware | Ordered guards, no double `next()`, redacted logs, tested deny paths.         |
| Caching    | Never shared-cache private/session responses or Actions.                      |
| Scale      | Durable sessions, rate limits, idempotency, and audit storage.                |
| Secrets    | Secret manager, no client injection, no token logging, rotation runbook.      |

## Workbench lab

[`session-policy.ts`](../../examples/nexis-workbench/src/server/session-policy.ts) declares the required application-owned `SessionStore` and uses `sessions.require`, `requirePermission`, and `requireAccess` before an article edit. [`support-action.ts`](../../examples/nexis-workbench/src/server/support-action.ts) gives the corresponding Action shape. Replace the declared session store with a durable implementation, then test missing, expired, revoked, wrong-permission, and wrong-tenant requests. A client-side control or a hidden field is not evidence of authorization.
