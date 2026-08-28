import {
  createSession,
  requireAccess,
  requirePermission,
  type SessionStore,
} from '@mohammedaydan/security'

export interface WorkbenchUser {
  readonly id: string
  readonly tenantId: string
  readonly permissions: readonly string[]
}

// The application supplies a durable store; this typed declaration deliberately does not pretend Nexis owns it.
declare const applicationSessionStore: SessionStore<WorkbenchUser>

export const sessions = createSession(applicationSessionStore, { cookieName: 'workbench_session' })

export async function authorizeArticleEdit(
  request: Request,
  article: { readonly tenantId: string },
) {
  const { principal } = await sessions.require(request)
  requirePermission(principal, 'article:write')
  await requireAccess(principal, article, (user, resource) => user.tenantId === resource.tenantId)
}
