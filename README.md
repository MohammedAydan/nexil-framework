# Nexil Framework

> **Published on npm as `nexil`, `@nexil/vite-plugin`, `@nexil/cli`, and `create-nexil` at version `0.1.0`.**

**Nexil is an HTML-first, resumable TypeScript framework for building server-rendered web applications.** It produces useful HTML first, keeps static routes free of route-specific client JavaScript, and loads interaction code only when a user reaches an interactive boundary. Nexil has no virtual DOM and does not hydrate or reconcile an entire component tree.

> **HTML first → progressive enhancement → resumable interaction → fine-grained DOM updates**

Nexil is designed for applications that need strong server rendering, small client boundaries, typed Web Standard interfaces, and deployment flexibility across Node.js and edge runtimes.

## Current status

The repository contains the v0.1.0 framework surface and its production verification fixtures. The main branch includes compiler-inferred resumability, hierarchical ScopeRef deduplication, nested layouts, inherited SEO metadata, out-of-order Suspense streaming, fine-grained Signal-to-DOM bindings, progressive Forms, typed loaders, static CSS extraction, SSG/ISR/SSR/PPR rendering modes, media processing, server Actions, Node/Deno/Cloudflare adapters, telemetry primitives, and release-oriented quality gates.

The detailed documentation is available in the [English documentation package](docs/en/README.md). The equivalent Arabic package is available at [docs/ar/README.md](docs/ar/README.md).

## Why Nexil?

Nexil separates server rendering from client interaction instead of treating every page as a browser application. A static route can ship HTML and CSS without application JavaScript. An interactive route declares a small boundary with a `$`-suffixed event or binding directive. The compiler extracts the boundary, serializes only supported references, and emits small assets that the browser loads when they are needed.

State changes use fine-grained Signals. A bound text node or scalar property is updated directly by an `effect()` subscription; the component function is not executed again, and no virtual-DOM tree is created or reconciled. Essential content still belongs in the initial server-rendered HTML so that the page remains useful before any script executes.

## Core contracts

These contracts are enforced by compiler tests, integration tests, runtime parity checks, browser tests, and CI budgets.

| Contract                 | Meaning                                                                                                                          | Verification surface                          |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Static output            | A route without resumable interaction emits zero route-specific client JavaScript.                                               | CLI manifest, build tests, Playwright         |
| Small interactive output | Interactive route code remains within the configured compressed budget.                                                          | `pnpm check:budget`, CLI checks               |
| Isolated runtimes        | `nexil-bootstrap.js` serves events; `nexil-bindings.js` serves bindings; `nexil-forms.js` is emitted only for progressive forms. | CLI integration tests, E2E network assertions |
| No full hydration        | Resumed handlers and bindings materialize their references without rerunning the component tree.                                 | Client runtime and browser tests              |
| Request isolation        | Request-specific values are created per request and are not shared through mutable module singletons.                            | Server and parity tests                       |
| Web-standard boundaries  | Adapters use `Request`, `Response`, `Headers`, `ReadableStream`, and Web Crypto-compatible contracts where applicable.           | Node, Deno, Cloudflare, and parity tests      |

## Quick start

Published packages are hosted on the public npm registry (`https://registry.npmjs.org/`). No special registry configuration is required for `nexil` or `@nexil/*` — install directly via `pnpm add nexil @nexil/vite-plugin`.

Create a TypeScript application with the current initializer:

```bash
pnpm dlx create-nexil@0.1.0 my-nexil-app --yes --ts
cd my-nexil-app
pnpm install
pnpm dev
```

Equivalent forms (all create the same `my-nexil-app` via `create-nexil`):

```bash
npx --yes create-nexil@0.1.0 my-nexil-app --yes --ts
yarn dlx create-nexil@0.1.0 my-nexil-app --yes --ts
npm create nexil@0.1.0 my-nexil-app -- --yes --ts
pnpm create nexil@0.1.0 my-nexil-app -- --yes --ts
# inside an existing Nexil workspace or after installing @nexil/cli:
nexil create my-nexil-app --yes --ts
```

The initializer supports `--yes`, `--ts`, `--js`, `--tailwind`, and `--no-tailwind`. Inside an existing application, the CLI exposes the same project operations through `nexil create <name>`. The generated project includes route files, an HTML shell, TypeScript configuration, public assets, and package scripts for development and production builds.

## Project structure

A small application commonly looks like this:

```text
my-nexil-app/
├── src/
│   ├── routes/
│   │   ├── _layout.tsx
│   │   ├── index.tsx
│   │   └── counter.tsx
│   └── styles.css
├── public/
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

Routes are discovered under `src/routes/**/*.{tsx,jsx,ts,js}`. `_layout.*` files are recursive composition modules rather than standalone routes; legacy `layout.*` files remain supported for compatibility. Route groups retain their directory context for layout composition without becoming URL segments. The application shell should contain the Nexil outlet markers:

```html
<!doctype html>
<html lang="en">
  <head>
    <!--nexil-head-outlet-->
  </head>
  <body>
    <div id="app"><!--nexil-app-outlet--></div>
    <!--nexil-scripts-outlet-->
  </body>
</html>
```

The build replaces these markers with the route head, rendered HTML, and only the scripts required by the route. Do not place route content outside the outlets if it is expected to pass through the Nexil renderer.

## JSX and TSX authoring

Nexil uses JSX and TSX with its own runtime. Generated projects use `react-jsx` with `@nexil/jsx-runtime`; React is not required.

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "jsxImportSource": "@nexil/jsx-runtime",
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "exactOptionalPropertyTypes": true
  }
}
```

A static route is an ordinary component that returns renderable children. Its HTML is produced on the server and it needs no client JavaScript:

```tsx
export const seo = {
  title: 'Home | Nexil App',
  description: 'A server-rendered page with no route-specific client JavaScript.',
}

export default function HomePage() {
  return (
    <main>
      <h1>Welcome to Nexil</h1>
      <p>This content is available before any client script runs.</p>
    </main>
  )
}
```

Components may be composed normally, and asynchronous route components may await server-side work before returning their children. Validate data at the boundary and keep private request data out of browser-visible markup.

## Resumable events

Append `$` to an event prop to declare a lazy interaction boundary. The compiler extracts the handler into a hashed chunk and writes a `data-nx-on-*` reference into the rendered HTML. The small event bootstrap delegates the event, imports the required chunk on first interaction, resolves serialized scope references, and invokes the handler.

```tsx
export default function CounterPage() {
  return (
    <main>
      <h1>Resumable counter</h1>
      <button
        type="button"
        onClick$={({ element }: { readonly element: HTMLElement }) => {
          const current = Number(element.dataset.count ?? '0')
          const next = current + 1
          element.dataset.count = String(next)
          element.textContent = `Count: ${next}`
        }}
        data-count="0"
      >
        Count: 0
      </button>
    </main>
  )
}
```

The handler is not executed during initial paint. The browser loads its lazy chunk only after interaction. Handlers receive `{ element, event, scope }` when those values are needed. Keep captured values serializable and do not capture database clients, secrets, DOM nodes, or class instances.

## Fine-grained Signal bindings

Nexil also supports direct Signal-to-DOM updates without manual `textContent` assignments and without component rerenders. Direct Signal reads are lowered conservatively:

```tsx
import { state } from '@nexil/core'

const count = state(0)

export default function Status() {
  return <output>{count()}</output>
}
```

The compiler keeps the initial SSR value, emits a stable binding marker, and the browser subscribes the target through `effect()`. When `count.set(...)` runs, only the bound target is changed.

Use explicit directives when the target is a DOM property or the intended binding should be unambiguous:

```tsx
import { state } from '@nexil/core'

const name = state('Ada')
const busy = state(false)
const selected = state(false)

export default function ProfileForm() {
  return (
    <form>
      <input bindValue$={name} aria-label="Name" />
      <input type="checkbox" bindChecked$={selected} aria-label="Selected" />
      <button bindDisabled$={busy} type="submit">
        Save {name()}
      </button>
      <p bindHidden$={busy}>Ready</p>
    </form>
  )
}
```

The supported directives and runtime targets are:

| Directive        | Runtime target | Typical use                                     |
| ---------------- | -------------- | ----------------------------------------------- |
| `bindText$`      | `text`         | Replace the target text content                 |
| `bindValue$`     | `value`        | Synchronize an input, textarea, or select value |
| `bindChecked$`   | `checked`      | Synchronize a checkbox or radio state           |
| `bindDisabled$`  | `disabled`     | Enable or disable a form control                |
| `bindHidden$`    | `hidden`       | Toggle an element’s hidden property             |
| `bindClass$`     | `class`        | Update the element class                        |
| `bindStyle$`     | `style`        | Update inline style values                      |
| `bindHref$`      | `href`         | Update an anchor URL                            |
| `bindSrc$`       | `src`          | Update an image or media URL                    |
| `bindAriaLabel$` | `aria-label`   | Update an accessible label                      |

The public client primitive is:

```ts
bindSignalToDOM(
  scopeId: string,
  node: Text | HTMLElement,
  targetProperty:
    | 'text'
    | 'value'
    | 'checked'
    | 'disabled'
    | 'hidden'
    | 'class'
    | 'style'
    | 'href'
    | 'src'
    | `aria-${string}`
): () => void
```

It resolves a registered `nx:signal:<id>` or `nx:store:<id>`, applies the current value, installs an effect, and returns a disposer. The runtime mutates the target directly. It does not rerun the component and it does not perform virtual-DOM reconciliation.

Automatic lowering intentionally does not guess arbitrary dependency graphs. An expression such as `{count() + ' items'}` remains ordinary SSR output and emits a compiler diagnostic recommending an explicit directive. Use `bindText$` when a complex expression must be updated as one binding.

A route that contains only events receives `nexil-bootstrap.js`. A route that contains bindings receives the separate `nexil-bindings.js` runtime in addition to any required event bootstrap. A route containing a `Form` receives `nexil-forms.js`; a route may receive more than one runtime when it contains multiple boundary kinds. Static routes receive none of these runtimes.

## State and reactivity

Signals also support comparator-aware updates and asynchronous resources. Use `resource()` for request-local loading, success, and error state; its refetch generation prevents stale responses from replacing newer data. Use stores with `setPath()` for nested immutable updates and `lens()` for writable focused views.

```ts
import { resource, state } from '@nexil/reactivity'
import { createStore, setPath } from '@nexil/state'

const userId = state('ada')
const profile = resource(() => fetchProfile(userId()), { immediate: true })
const preferences = createStore({ theme: 'light' })

setPath(preferences, ['theme'], 'dark')
```

Signals are callable for reads and expose a readonly `.value` getter. Update them with `.set(...)` or `.setValue(...)`; do not assign to `.value`.

```ts
import { batch, computed, effect, state } from '@nexil/reactivity'

const firstName = state('Ada')
const lastName = state('Lovelace')
const fullName = computed(() => `${firstName()} ${lastName()}`)

const dispose = effect(() => {
  console.log(fullName())
})

batch(() => {
  firstName.set('Grace')
  lastName.set('Hopper')
})

dispose()
```

Stores provide `value`, `snapshot()`, `set`, `select`, `subscribe`, and `dispose`. Keep route and user state request-local, give effects a clear owner, and dispose stores and bindings when their route or application lifetime ends. Do not use a mutable global signal for private request data.

## Layouts, metadata, and streaming

Use `_layout.tsx` files to share navigation, shells, and metadata. Parent `seo` exports may define a `titleTemplate` and `openGraph.siteName`; child routes override only the fields they need. Use `Suspense` to stream a fallback immediately and flush completed asynchronous boundaries out of order.

```tsx
import { Suspense } from '@nexil/core'

export default function Page() {
  return (
    <Suspense id="results" fallback={<p>Loading…</p>}>
      {loadResults().then(renderResults)}
    </Suspense>
  )
}
```

## Rendering modes

`@nexil/renderer` provides four render modes through `renderRoute`:

| Mode    | Configuration                          | Cache behavior                         | Appropriate use                              |
| ------- | -------------------------------------- | -------------------------------------- | -------------------------------------------- |
| Static  | `{ mode: 'static' }`                   | Public and immutable                   | Content that does not depend on a request    |
| ISR     | `{ mode: 'isr', revalidate: seconds }` | Shared cache with bounded revalidation | Content that can be regenerated periodically |
| Server  | `{ mode: 'server' }`                   | Private, no shared cache               | Request-specific or personalized content     |
| Partial | `{ mode: 'partial' }`                  | Public shell with partial request work | Public pages with controlled dynamic regions |

```ts
import { renderRoute } from '@nexil/renderer'

const result = await renderRoute({
  key: '/news',
  mode: { mode: 'isr', revalidate: 60 },
  render: () => renderNewsPage(),
  cache,
})

result.html
result.cacheControl
result.stale
```

ISR requires a cache implementation and validates the revalidation interval. Server-rendered output must not be placed in a shared cache unless the application has explicitly designed a safe variation strategy.

## CSS and Tailwind

Inline static style objects are extracted into CSS at build time. For Tailwind CSS 4, create the application with `--tailwind`; the scaffold adds `@tailwindcss/vite`, creates `src/styles.css`, and configures the generated Vite integration.

The `@nexil/css` package provides `cx` for composing class names:

```tsx
import { cx } from '@nexil/css'

export function Card({ featured }: { readonly featured: boolean }) {
  return (
    <article className={cx('rounded-xl border p-6', featured && 'border-indigo-500')}>
      Content
    </article>
  )
}
```

Prefer semantic class names and accessible HTML. Test responsive behavior, keyboard navigation, focus visibility, color contrast, and RTL layouts where they apply.

## Media and SEO

The media package can generate WebP and AVIF variants, responsive `picture` markup, self-hosted font rules, and optional persistent transform caches:

```ts
import { imageAttributes, transformImage } from '@nexil/media'

const variants = await transformImage(source, 'hero', [320, 640, 1024])
const attributes = imageAttributes({
  src: variants[0]?.fileName ?? '/images/hero.webp',
  alt: 'Product overview',
  width: 1024,
  height: 640,
})
```

Use intrinsic dimensions, meaningful alternative text, and responsive sources. Treat remote image and font URLs as untrusted input and validate the allowed origin policy before fetching.

After a build, `nexil analyze` also inventories emitted non-HTML assets. It reports the total delivery size, image subtotal, and five largest files. Images at or above 256 KiB receive an advisory to generate AVIF/WebP variants and use correct responsive loading. This is a build-time delivery guard, not a substitute for field Core Web Vitals or real CDN measurements.

The SEO package provides typed head output, canonical URLs, JSON-LD validation and escaping, breadcrumbs, sitemaps, robots.txt, RSS, Atom, and related metadata helpers:

```ts
import { buildRobots, buildSitemap, renderHead } from '@nexil/seo'

const head = renderHead({
  title: 'Home | Nexil App',
  description: 'A server-rendered Nexil application.',
  canonical: 'https://example.com/',
  jsonLd: { '@type': 'WebSite', name: 'Example' },
})

const sitemap = buildSitemap([{ url: 'https://example.com/' }])
const robots = buildRobots('https://example.com/sitemap.xml', ['/admin'])
```

URLs are validated, JSON-LD is escaped for safe embedding in a script element, and generated metadata should be tested against the actual published route inventory.

## Server and deployment

The repository exposes Fetch-native adapters for Node.js, Deno, and Cloudflare. The Node production server is provided by `@nexil/serve`; edge packages provide Deno and Cloudflare handlers. Keep request and response behavior consistent across adapters and test cache headers for each render mode.

Production deployment should include the built `dist` directory, generated route modules, route HTML, assets, lazy chunks, manifests, feed files, sitemap and robots artifacts, and the runtime assets required by interactive or binding-enabled routes. Trust forwarded host and protocol headers only when the deployment is behind a controlled proxy and the explicit trust setting is enabled.

Health checks, graceful shutdown, bounded request bodies, safe cookies, strict Origin validation for Actions, and secret management belong in the deployment configuration rather than in page components. Never place credentials in client code or generated HTML.

## Progressive forms

`Form` and `SubmitButton` preserve native browser submission while enabling the generated forms runtime. The runtime serializes repeated fields, sends an idempotency key, forwards an optional CSRF token, and exposes loading and success/error events. Server-side actions must still validate input, authorize the request, enforce trusted origins, and bound idempotency storage.

```tsx
import { Form, SubmitButton } from '@nexil/core'

export default function Contact() {
  return (
    <Form action="/__nexil/actions/contact" csrfToken={csrfToken}>
      <input name="email" type="email" required />
      <SubmitButton loadingText="Sending…">Send</SubmitButton>
    </Form>
  )
}
```

## CLI commands

The installed `nexil` binary and repository scripts expose the framework workflow:

| Command                           | Purpose                                                                                                          |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `nexil dev`                       | Run the Vite development server with Nexil SSR middleware and hot updates                                        |
| `nexil build`                     | Build route HTML, server modules, assets, lazy chunks, runtimes, feeds, redirects, manifest, and `public/` files |
| `nexil start`                     | Serve the built artifact with route-aware Nexil production behavior                                              |
| `nexil serve`                     | Compatibility alias for `nexil start`                                                                            |
| `nexil check --budget`            | Run build and byte-budget checks                                                                                 |
| `nexil analyze`                   | Report route output, client-size metrics, static-asset totals, and the largest emitted assets                    |
| `nexil routes`                    | List discovered route files                                                                                      |
| `nexil create <name>`             | Scaffold an application                                                                                          |
| `nexil preview`                   | Compatibility alias for `nexil start`                                                                            |
| `nexil generate route <path>`     | Generate a route safely                                                                                          |
| `nexil generate component <name>` | Generate a component safely                                                                                      |
| `nexil add action <name>`         | Generate a server action scaffold                                                                                |
| `nexil doctor`                    | Diagnose package, shell, and route configuration                                                                 |
| `nexil test`                      | Run the integrated test workflow                                                                                 |
| `nexil upgrade`                   | Scan for upgrade and migration work                                                                              |

A production build commonly contains:

```text
dist/
├── client/
│   ├── index.html
│   ├── assets/
│   ├── og/
│   ├── nexil-manifest.json
│   ├── nexil-bootstrap.js       # event routes only
│   ├── nexil-bindings.js        # binding routes only
│   ├── nexil-forms.js           # progressive form routes only
│   ├── robots.txt
│   ├── sitemap.xml
│   ├── feed.xml
│   └── atom.xml
├── server/routes/                # generated SSR modules
└── nexil-chunks/                 # hashed lazy handlers
```

Exact generated files depend on the route inventory and configuration. Treat `nexil-manifest.json` and the build output as the source of truth for a particular release.

A generated project needs no configuration for the standard lifecycle:

```bash
pnpm dev
pnpm build
pnpm start
```

Use an optional typed `nexil.config.ts` with `defineConfig` from `@nexil/serve` only to override defaults such as the public origin, port, redirects, feed metadata, cache controls, or Action policy.

## Package map

| Package                   | Responsibility                                                                                      |
| ------------------------- | --------------------------------------------------------------------------------------------------- |
| `@nexil/core`             | Render nodes, component types, layouts, Suspense, forms, request context, and reactivity re-exports |
| `@nexil/jsx-runtime`      | Automatic JSX runtime used by `react-jsx` projects                                                  |
| `@nexil/reactivity`       | Signals, comparators, resources, computed values, effects, batching, roots, and cleanup             |
| `@nexil/state`            | Serializable stores, selectors, registries, and disposal                                            |
| `@nexil/compiler`         | Boundary analysis, capture diagnostics, and byte-budget enforcement                                 |
| `@nexil/vite-plugin`      | JSX transformation, lazy chunks, ScopeRef metadata, binding markers, and development assets         |
| `@nexil/client`           | Scope materialization, delegated events, DOM bindings, progressive forms, and cleanup               |
| `@nexil/renderer`         | HTML/string/stream rendering and render modes                                                       |
| `@nexil/router`           | Route discovery, groups, nested layouts, query/hash matching, parameters, and resolution            |
| `@nexil/seo`              | Head tags, canonicals, JSON-LD, sitemap, robots, RSS, and Atom                                      |
| `@nexil/media`            | Image variants, responsive markup, fonts, and media caching                                         |
| `@nexil/actions`          | Typed server Actions, validation, Origin checks, cookies, and idempotency                           |
| `@nexil/server`           | Server composition and request-scoped data helpers                                                  |
| `@nexil/security`         | Session, role, permission, and resource-policy primitives with application-owned storage            |
| `@nexil/adapters`         | Node, Deno, Cloudflare, and Fetch adapter contracts                                                 |
| `@nexil/serve`            | Node production server and middleware                                                               |
| `@nexil/serve-deno`       | Deno edge handler package                                                                           |
| `@nexil/serve-cloudflare` | Cloudflare edge handler package                                                                     |
| `@nexil/telemetry`        | Optional Web Vitals and telemetry receiver primitives                                               |
| `@nexil/cli`              | CLI orchestration and production build pipeline                                                     |
| `@nexil/create-nexil`     | Project initializer and compatibility initializer binaries                                          |

## Verification workflow

From the repository root, install dependencies and run the gates in a clean environment:

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm check:budget
pnpm test:parity
pnpm test:node-runtime
pnpm test:edge
pnpm test:e2e
pnpm test:deno:e2e   # requires an actual Deno executable
pnpm security
pnpm test:node-runtime
pnpm test:edge
```

The repository’s Playwright suite verifies SSR output, no-JavaScript static routes, lazy event chunks, binding behavior, metadata, Actions, 404 responses, and showcase routes. Runtime parity tests compare Node and edge contracts. Local Lighthouse and benchmark results are controlled lab measurements; they are not field Web Vitals, production traffic measurements, search rankings, or CDN performance guarantees.

## Documentation and contribution

Start with the [English documentation index](docs/en/README.md). The package contains focused guides for architecture, project creation, pages and components, routing, resumability, state, Actions, CSS, media, SEO, deployment, testing, security, API reference, troubleshooting, best practices, a complete application example, releases, CLI configuration, contribution, and terminology.

Before opening a pull request, run the relevant unit and integration tests, the complete typecheck, lint and formatting checks, the browser suite for runtime changes, and `git diff --check`. Keep commits focused, document compatibility changes, and never commit credentials or generated secrets.

## Security

Review `SECURITY.md` for the vulnerability-reporting process and credential-handling guidance. Security reports should not include credentials or exploit details in public issues.
