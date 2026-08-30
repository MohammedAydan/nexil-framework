# 24 — Build Nexil Workbench: from an empty folder to production

This chapter is a complete, practical path for an application built with Nexil `1.3.1`. **Nexil Workbench** is a public knowledge base with static articles, a narrow interactive filter, semantic Link navigation, a native-first support request, application-owned access policy, discovery metadata, and a release gate. It is deliberately not a promise that Nexil includes a database, user directory, OAuth provider, email vendor, or permanent session store. Those remain application choices.

## What you will prove

| Stage         | Observable result before continuing                                                          |
| ------------- | -------------------------------------------------------------------------------------------- |
| Project       | `pnpm dev` serves a generated Nexil application.                                             |
| HTML shell    | The title, navigation, and main content exist before JavaScript.                             |
| Routing       | Static article paths render, unknown paths become real 404 responses.                        |
| Navigation    | A marked same-origin Link can replace `#app`; the anchor still works without JavaScript.     |
| Interaction   | One filter control loads only its boundary and updates only its target.                      |
| Data mutation | The support request has validation, Origin, authorization, and idempotency boundaries.       |
| Production    | Metadata, assets, tests, budgets, and deployment configuration are reviewed as one artifact. |

> **Rule:** do not move to the next stage because the code “looks right.” Run the check listed at the end of each stage and inspect the generated HTML or response it names.

## 0. Create the project safely

Configure access to the `@nexil` package scope through your user or CI environment. Do not commit a registry token or paste it into `.npmrc`. Then use the current initializer and commit the lockfile produced by your own installation.

```bash
pnpm dlx create-nexil@0.2.0 nexil-workbench --yes --ts --template interactive
cd nexil-workbench
pnpm install
pnpm dev
```

The Starter creates an HTML shell with `#app`, a `<!--nexil-app-outlet-->`, route sources, CSS, and scripts for `dev`, `build`, `start`, `typecheck`, `check`, and `analyze`. Inspect `package.json` before adding dependencies. The generated dependencies are public browser or build dependencies; they are not a place to store service credentials.

```bash
pnpm typecheck
pnpm check
```

Expected result: TypeScript succeeds and `nexil check --budget` reports a passing artifact policy. If either fails, fix the generated setup before adding application code.

## 1. Render the document first

Create a layout that has semantic navigation and a main landmark. A layout renders on the server with its child route; it is not a client application root.

```tsx
// src/routes/_layout.tsx
import { Link } from '@nexil/router'

export default function WorkbenchLayout({ children }: { readonly children: unknown }) {
  return (
    <>
      <a className="skip-link" href="#content">
        Skip to content
      </a>
      <header>
        <Link href="/">Workbench</Link>
        <nav aria-label="Primary navigation">
          <Link href="/articles/">Articles</Link>
          <Link href="/support/">Support</Link>
        </nav>
      </header>
      <main id="content">{children}</main>
      <footer>Built as useful HTML first.</footer>
    </>
  )
}
```

Then make the home route readable even when scripts never load.

```tsx
// src/routes/index.tsx
export const seo = {
  title: 'Nexil Workbench',
  description: 'A public knowledge base built with server-rendered HTML.',
}

export default function Home() {
  return (
    <section>
      <h1>Useful documentation before JavaScript.</h1>
      <p>Articles, route links, and support instructions belong in the first response.</p>
      <a href="/articles/">Read the articles</a>
    </section>
  )
}
```

Verify with the browser’s **View Source**, not only the Elements panel: the `h1`, paragraph, landmarks, and `href` values must be present in the raw response. The `<a>` in the example is intentionally valid before any navigation enhancement starts.

## 2. Add predictable article routes

Keep public article metadata in a server-side module. Exporting static paths means the build can render known article pages in advance.

```ts
// src/lib/articles.ts
export const articles = [
  { slug: 'first-boundary', title: 'Find the first boundary', summary: 'Keep interaction narrow.' },
  { slug: 'release-check', title: 'Prove the release', summary: 'Treat output as evidence.' },
] as const

export function getArticle(slug: string) {
  return articles.find((article) => article.slug === slug)
}
```

```tsx
// src/routes/articles/[slug].tsx
import { notFound } from '@nexil/server'
import { getArticle, articles } from '../../lib/articles'

export async function getStaticPaths() {
  return articles.map((article) => ({ params: { slug: article.slug } }))
}

export default function Article({ slug }: { readonly slug?: string }) {
  const article = slug ? getArticle(slug) : undefined
  if (!article) return notFound('Article not found')
  return (
    <article>
      <h1>{article.title}</h1>
      <p>{article.summary}</p>
    </article>
  )
}
```

Do not let an unvalidated `slug` choose a filesystem path, database query, cache key, or redirect target. Build the route and inspect its generated article directories. Request an unknown article and verify a 404 rather than a successful empty page.

## 3. Enhance navigation without replacing anchors

Use `Link` only when direct, same-origin page navigation benefits from an optional `#app` replacement. It emits a normal anchor with `data-nx-link`; it does not create a virtual router or client-side component tree.

```tsx
import { Link } from '@nexil/router'

export function ArticleNavigation() {
  return (
    <nav aria-label="Article navigation">
      <Link href="/articles/first-boundary/" prefetch="intent">
        First boundary
      </Link>
      <Link href="/articles/release-check/" prefetch="viewport" transition={false}>
        Release check
      </Link>
      <a href="#comments">Jump to comments</a>
    </nav>
  )
}
```

Keep hash-only links as native anchors. Modified clicks, middle clicks, external origins, `target`, `download`, and `rel="external"` links also remain native. A failed fetch, non-HTML response, or missing destination outlet falls back to document navigation. Prefetch is a bounded public in-memory hint: responses marked `private` or `no-store` are not retained.

Run the browser once with JavaScript disabled and confirm the article link works. Then run it with JavaScript enabled, set a temporary `window` marker, visit an eligible Link, and confirm the marker survives while the destination title and content update. See the Router test suite for the full bypass, history, cancellation, and fallback contract.

## 4. Add one small resumable interaction

Use a Signal for local interactive state. Initial article content still renders on the server; the click is the only enhanced behavior.

```tsx
// src/components/ArticleFilter.tsx
import { state } from '@nexil/core'

export function ArticleFilter() {
  const active = state(false)
  return (
    <section aria-labelledby="filter-title">
      <h2 id="filter-title">Filter articles</h2>
      <button aria-pressed={active()} onClick$={() => active.set(!active())}>
        Toggle release-ready filter
      </button>
      <p bindHidden$={active}>Showing every article.</p>
      <p bindHidden$={() => !active()}>Showing release-ready articles.</p>
    </section>
  )
}
```

Capture only JSON-literal values, Signals, Stores, Actions, or supported ScopeRef values across a lazy boundary. DOM nodes, database clients, secrets, arbitrary class instances, and request-private values are unsupported. Inspect the HTML for opaque scope markers and inspect the network: no event chunk should load before the user reaches the button.

## 5. Use Context and Store lifetimes explicitly

Context avoids prop drilling; it is not a browser-global store or an asynchronous ambient context mechanism. Use a ContextScope for SSR/SSG work that crosses asynchronous boundaries.

```tsx
import { createContext, createContextScope, provideContext, state } from '@nexil/core'
import { createStore } from '@nexil/state'

const Locale = createContext('en')

const requestScope = createContextScope()
const frenchScope = provideContext(requestScope, Locale, 'fr')
Locale.use(frenchScope) // "fr"

export function LocaleSection() {
  const locale = state('en')
  return Locale.Provider({
    value: locale,
    children: () => <button onClick$={() => locale.set('fr')}>{Locale.use()}</button>,
  })
}

export const visualPreference = createStore({ contrast: 'default' }, 'global')
```

The Provider convenience resolves children synchronously. Pass `context.scope` or an explicit child scope to asynchronous code with `withContext`; do not assume a provider survives `await`. The `global` Store survives successful Link replacements only within one browser document. It resets on reload and must never contain a secret, a session, or an authorization decision.

Write two SSR renders with different ContextScope values and assert that the response for one cannot see the other. In the browser, change the global preference, perform a Link navigation, and then reload: it may survive the first operation but must reset after the second.

## 6. Make a native-first support request

Begin with a real form. Browser JavaScript may enhance feedback, but server validation and access control remain authoritative.

```tsx
// src/routes/support/index.tsx
export default function Support() {
  return (
    <form action="/api/support" method="post">
      <label htmlFor="message">Describe the issue</label>
      <textarea id="message" name="message" minLength={20} required />
      <button type="submit">Send support request</button>
    </form>
  )
}
```

Define the mutation with the public Action surface. The persistence function and queue are application-owned dependencies.

```ts
// src/server/support-action.ts
import {
  action,
  assertTrustedOrigin,
  createMemoryIdempotencyStore,
  handleActionRequest,
} from '@nexil/actions'

const idempotency = createMemoryIdempotencyStore()

const supportAction = action({
  endpoint: '/api/support',
  validate(input) {
    const message =
      typeof input === 'object' && input
        ? String((input as { message?: unknown }).message ?? '')
        : ''
    if (message.trim().length < 20)
      throw new Response('Message must contain at least 20 characters.', { status: 400 })
    return { message: message.trim() }
  },
  async authorize({ request }) {
    assertTrustedOrigin(request, ['https://workbench.example'])
    // Resolve the application-owned session here before a mutation.
  },
  async handle(_context, input) {
    await saveSupportRequest(input) // application-owned durable persistence
    return { accepted: true }
  },
})

export function postSupport(request: Request) {
  return handleActionRequest(request, supportAction, {
    allowedOrigins: ['https://workbench.example'],
    idempotency,
  })
}
```

`createMemoryIdempotencyStore()` is useful for local development or one process only. A multi-instance production deployment needs a durable shared idempotency store. Test a normal form post, bad input, a wrong Origin, a duplicate idempotency key, and a request without access before connecting a real queue or database.

## 7. Add application-owned session and resource policy

Nexil can read an opaque session identifier and apply role or resource rules; it intentionally does not verify passwords, perform OAuth/OIDC exchange, or implement your user table.

```ts
// src/server/session.ts
import { createSession, requireAccess, requirePermission, type SessionStore } from '@nexil/security'

interface WorkbenchUser {
  readonly id: string
  readonly tenantId: string
  readonly permissions: readonly string[]
}

const store: SessionStore<WorkbenchUser> = applicationSessionStore
export const sessions = createSession(store, { cookieName: 'workbench_session' })

export async function editArticle(request: Request, article: { readonly tenantId: string }) {
  const { principal } = await sessions.require(request)
  requirePermission(principal, 'article:write')
  await requireAccess(principal, article, (user, resource) => user.tenantId === resource.tenantId)
}
```

Use durable storage, expiry, revocation, and audit records in the application. Treat the session cookie as an opaque identifier; never trust a role, tenant, or ownership value sent by a form or the browser. Test missing, expired, revoked, wrong-permission, and wrong-tenant paths, and prove a denied request does not call the mutation.

## 8. Generate discovery and media artifacts

Every public route needs accurate metadata. Use a real absolute production origin; preview URLs should not become canonical URLs.

```tsx
// src/routes/articles/index.tsx
export const seo = {
  title: 'Workbench articles',
  description: 'Public documentation for building and operating Nexil applications.',
  canonical: 'https://workbench.example/articles/',
}
```

Use the same public route inventory to produce sitemap, robots, RSS, and Atom artifacts. For meaningful images, provide intrinsic dimensions, a fallback, and accurate alternative text.

```tsx
<picture>
  <source srcSet="/images/workbench-960.avif" type="image/avif" />
  <source srcSet="/images/workbench-960.webp" type="image/webp" />
  <img src="/images/workbench-960.jpg" width="960" height="540" alt="Workbench article overview" />
</picture>
```

Check the built `sitemap.xml`, `robots.txt`, feeds, title, description, canonical URL, and Open Graph output. Validate URL protocols before accepting input, and make analytics/telemetry collection opt-in and data-minimizing.

## 9. Build and run the production artifact

Keep configuration reviewed and explicit. A typical production Node lifecycle is below; adapt the host boundary only after the Node artifact is correct.

```bash
pnpm typecheck
pnpm check
pnpm build
pnpm start
```

For Node, use the generated `nexil start` lifecycle or `@nexil/serve`. Use the Deno or Cloudflare adapter only when its Fetch-native runtime is the actual target. Set a public `siteOrigin`, define redirects, cache rules, header policy, and trusted-proxy behavior in reviewed configuration. Set proxy trust only when the proxy removes and reconstructs forwarded headers safely.

Your deployment checklist must include the following observable checks.

| Area       | Production check                                                                                                    |
| ---------- | ------------------------------------------------------------------------------------------------------------------- |
| HTML       | Fetch every critical URL and verify title, heading, canonical, and navigation exist without JavaScript.             |
| Routes     | Verify a public static route, a server route if present, unknown route 404, `HEAD`, redirect, and method rejection. |
| Link       | Verify direct swap, Back/Forward, hash and modified-click bypasses, cancellation, and native fallback.              |
| Forms      | Verify native submit, enhanced submit if used, validation, Origin, session, authorization, and duplicate handling.  |
| Assets     | Verify no meaningful image lacks dimensions, variants or fallback; inspect media cache limits.                      |
| Security   | Run dependency/secret scans; verify headers and cookie flags over real HTTPS.                                       |
| Operations | Record runtime version, commit, build command, budgets, health check, logs, rollback artifact, and alert owner.     |

## Where to go next

This chapter is the path through the framework, not a substitute for the exact API references. Read the corresponding detailed guides before changing a contract: [project creation](./03-project-creation.md), [routing and rendering](./05-routing-and-rendering.md), [interactivity](./06-interactivity-and-scoperef.md), [state and Context](./07-state-and-reactivity.md), [Actions and forms](./08-actions-and-forms.md), [SEO](./11-seo-and-metadata.md), [server and deployment](./12-server-and-deployment.md), [testing](./13-testing-and-performance.md), and [security](./23-security-authentication-and-middleware.md).

The executable Workbench example and its tests are the source of truth for the commands in this chapter. If a desired integration is absent, add it as an application boundary and test it; do not infer that it is automatically provided by Nexil.
