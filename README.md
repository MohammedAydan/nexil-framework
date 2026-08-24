# Nexis

Nexis is an **HTML-first, resumable TypeScript web framework** for applications that should render useful HTML immediately and ship client JavaScript only when interaction requires it. The framework is built around progressive enhancement, fine-grained reactivity, static CSS extraction, and Web Standard request/response contracts that can run on Node.js and edge runtimes.

> **HTML First → Progressive Enhancement → Resumable Fine-Grained Reactivity → Client JS Only When Needed**

## v2.0.0 GA contract

The following promises are the governing release contracts for Nexis. They are enforced by compiler checks, runtime tests, browser tests, and CI rather than being framework defaults that can silently be bypassed.

| Promise                | Contract                                                                                                              |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Static JavaScript      | A route without resumable interaction emits **0 bytes of client JavaScript**.                                         |
| Interactive JavaScript | Each interactive route remains below **15 KB gzipped** of route client code.                                          |
| Bootstrap              | The resumability bootstrap remains below **1 KB gzipped**.                                                            |
| Rendering model        | The renderer produces HTML and does not use a virtual DOM or reconciliation engine.                                   |
| CSS                    | Inline static style objects are extracted into a static CSS artifact; CSS does not require a client runtime.          |
| Request isolation      | User and request state must remain request-local; mutable server singletons are not part of the application contract. |
| Edge compatibility     | Runtime boundaries use WHATWG `Request`, `Response`, `Headers`, streams, and Web Crypto-compatible semantics.         |

For user-facing performance targets, the recommended production budgets are **LCP below 2.5 seconds** and **CLS below 0.1** on representative mobile and desktop traffic. These are operational targets to validate with field or lab data, while the JavaScript and bootstrap limits above are build-time framework gates. [1]

## Quickstart

The recommended path is the standalone initializer. It supports both the `create-nexis` and `create-nexis-app` package names and accepts deterministic flags for automation.

```bash
# pnpm
pnpm create nexis my-nexis-app --yes --ts
cd my-nexis-app
pnpm install
pnpm dev
```

```bash
# npm
npx create-nexis-app my-nexis-app --yes --ts
cd my-nexis-app
npm install
npm run dev
```

```bash
# yarn
yarn create nexis my-nexis-app --yes --ts
cd my-nexis-app
yarn install
yarn dev
```

The initializer also accepts `--js` for JSX projects, `--tailwind` to add Tailwind metadata, and `--no-tailwind` to make the default explicit. Running `nexis create <name> --yes` delegates to the same scaffold engine used by the standalone packages.

## Generated project structure

A TypeScript project created by Nexis has a deliberately small route surface and no configuration file that is required merely to render a static page.

```text
my-nexis-app/
├── src/
│   ├── routes/
│   │   ├── layout.tsx
│   │   ├── index.tsx
│   │   └── counter.tsx
│   └── shared/
│       └── types.ts
├── public/
│   └── favicon.ico
├── package.json
├── tsconfig.json
└── README.md
```

The generated `tsconfig.json` uses the native TypeScript JSX transform and the Nexis runtime bridge:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "jsxImportSource": "@nexis/core",
    "strict": true,
    "skipLibCheck": true
  }
}
```

The JavaScript variant uses the same JSX runtime contract, enables `allowJs`, and generates `.jsx` route modules. Neither variant requires React or a client-side virtual DOM.

## Authoring JSX and TSX

JSX and TSX are authoring syntaxes, not a requirement to install React. Nexis converts route modules into HTML-oriented output and extracts explicit resumable boundaries. A static route can remain a very small server component:

```tsx
export const seo = {
  title: 'Home | Nexis App',
  description: 'Blazing fast web app',
}

export default async function HomePage() {
  return (
    <main>
      <h1>Hello Nexis</h1>
      <p>Rendered server-side with zero client JavaScript overhead.</p>
    </main>
  )
}
```

The `onClick$` suffix marks a function for lazy extraction. The initial HTML contains the boundary metadata, while the handler is loaded only when the event occurs:

```tsx
export default function Counter() {
  return <button onClick$={() => undefined}>Clicks: 0</button>
}
```

For fine-grained state, use the signal API from `@nexis/reactivity`. Signals are callable readers with explicit setters and subscriptions; they are not a virtual DOM diffing layer.

```tsx
import { state } from '@nexis/reactivity'

const count = state(0)
count.set((previous) => previous + 1)
const current = count()
```

Handlers must be serializable boundaries. Do not close over server-only modules, private environment variables, database clients, or mutable process-global state. The compiler rejects server/client boundary violations and secret exposure in public graphs.

## Render modes

Route modules can declare an explicit render mode through an exported `render` value. The renderer’s current public mode names and cache semantics are:

| Mode        | Declaration                               | Intended behavior                                    | Cache contract       |
| ----------- | ----------------------------------------- | ---------------------------------------------------- | -------------------- |
| SSG/static  | Omit `render` or use `{ mode: 'static' }` | Immutable HTML generated ahead of request time       | `public, immutable`  |
| ISR         | `{ mode: 'isr', revalidate: 60 }`         | Cache-backed regeneration after a bounded interval   | `s-maxage=<seconds>` |
| SSR/server  | `{ mode: 'server' }`                      | Request-time rendering, including private data       | `private, no-store`  |
| PPR/partial | `{ mode: 'partial' }`                     | Public shell or partial output that is not immutable | `public, max-age=0`  |

Examples:

```tsx
export const render = { mode: 'static' as const }
```

```tsx
export const render = { mode: 'isr' as const, revalidate: 60 }
```

```tsx
export const render = { mode: 'server' as const }
```

```tsx
export const render = { mode: 'partial' as const }
```

ISR requires an injected cache implementation. Nexis does not hide a process-global cache behind the renderer, which keeps request and deployment isolation explicit.

## Media and SEO

The media package provides build-time image attributes and a Sharp-backed transformation pipeline. `imageAttributes` validates local absolute paths, dimensions, alternative text, responsive widths, lazy/eager loading, and `srcset` generation. `transformImage` emits WebP and AVIF variants without enlarging smaller source images.

```tsx
import { imageAttributes } from '@nexis/media'

const image = imageAttributes({
  src: '/images/hero.jpg',
  width: 1200,
  height: 630,
  alt: 'Nexis application hero image',
  sizes: '(max-width: 800px) 100vw, 800px',
})
```

The image contract requires explicit width, height, and non-empty alt text. These dimensions allow browsers to reserve layout space and help prevent cumulative layout shift; actual Core Web Vitals still require measurement in the deployed application. [1]

Fonts can be represented as local `@font-face` definitions or self-hosted during a build. The self-hosting helper validates HTTP(S), supports an origin allowlist, rejects redirects, checks content type and size limits, writes the font bytes locally, and returns preload metadata.

```ts
import { fontFace } from '@nexis/media'

const css = fontFace({
  family: 'Nexis Inter',
  weight: [400, 600],
  source: '/fonts/inter.woff2',
  display: 'swap',
})
```

SEO exports are kept close to the route. The SEO package provides typed metadata, canonical URL handling, Open Graph fields, JSON-LD sanitization, and sitemap helpers. Keep generated metadata request-safe and avoid placing credentials or private data in descriptions, JSON-LD, or public route modules.

## CLI reference

| Command                                                 | Purpose                                                                                         |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `nexis create <name> [--yes] [--ts\|--js] [--tailwind]` | Generate a safe project scaffold.                                                               |
| `nexis dev`                                             | Start the Vite-backed development server with the Nexis transform.                              |
| `nexis build`                                           | Transform route modules and write server routes, client chunks, CSS, bootstrap, and a manifest. |
| `nexis start`                                           | Preview the production build through Vite’s preview server.                                     |
| `nexis check --budget`                                  | Rebuild and fail when route or bootstrap budgets are exceeded.                                  |
| `nexis analyze`                                         | Print per-route client gzip bytes, CSS bytes, and mode classification from the build manifest.  |
| `nexis routes`                                          | List discovered route modules.                                                                  |

A production check should include:

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm check --budget
pnpm analyze
```

For a static route, `analyze` should report `0` JS gzip bytes. Interactive routes should show their measured lazy chunk size and bootstrap size in the manifest.

## Architecture

The framework is split into small packages with explicit boundaries. `@nexis/core` owns render nodes and serializable values. `@nexis/reactivity` owns signals and computed state. `@nexis/renderer` owns HTML rendering and render modes. `@nexis/compiler` owns boundary, security, and budget contracts. `@nexis/vite-plugin` performs AST-aware extraction and emits lazy chunks and static CSS. `@nexis/client` owns resumability serialization and bootstrap behavior. `@nexis/media` owns image and font pipelines. `@nexis/seo` owns public metadata. `@nexis/adapters` exposes Web Standard handler contracts for Node, Cloudflare-style, and Deno-style runtimes.

The central data flow is:

```text
TSX/JSX route
    │
    ├── Babel AST transform
    │     ├── security and import boundary checks
    │     ├── onClick$ lazy chunk extraction
    │     └── static CSS extraction
    │
    ├── server route artifact
    ├── client chunks only for resumable boundaries
    ├── optional bootstrap for interactive routes
    └── manifest with route mode and measured budgets
```

Nexis does not expose Vite as part of the framework’s core rendering API. Vite is the initial build and development implementation detail; route handlers and adapters use Web Standard primitives.

## Testing and release gates

The repository uses strict TypeScript project references, Vitest, Playwright, ESLint, Prettier, pnpm audit, Node HTTP smoke tests, and Miniflare/workerd smoke tests. The GA workflow also runs a real Deno subprocess smoke test.

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm test:e2e
pnpm test:node-runtime
pnpm test:edge
deno run --allow-read tests/parity/deno-smoke.ts
pnpm security
pnpm budget
```

The executable fixtures under `examples/` are part of the compatibility surface. `examples/basic-app` covers a static page with generated media, a resumable counter, and a streaming SSR response. CI rejects committed build output, common credential signatures, formatting violations, dependency vulnerabilities at the configured threshold, and failing runtime tests.

## Repository map

- `packages/` contains the framework packages and publishable initializer packages.
- `examples/` contains executable compatibility and runtime fixtures.
- `tests/e2e/` contains browser and fixture-server tests.
- `tests/parity/` contains Node, Miniflare/workerd, and Deno runtime smoke tests.
- `docs/adr/` contains architectural decisions.
- `docs/security/` contains threat models and control mappings.
- `.github/workflows/` contains reproducible CI gates.

## Status

Nexis is being prepared for the v2.0.0 GA release. The release candidate has passing local and GitHub quality gates for the existing Node, browser, and Miniflare/workerd paths. GA completion additionally requires the standalone initializer package tests, the generated TSX/JSX project checks, the Deno CI smoke, and the final post-push workflow to pass together.

## References

[1]: https://web.dev/articles/vitals 'Web Vitals — web.dev'
