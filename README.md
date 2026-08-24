# Nexis

**Nexis is an HTML-first, resumable TypeScript web framework.** Applications render useful HTML immediately and ship client JavaScript only when an interaction genuinely requires it. The framework is built on progressive enhancement, fine-grained reactivity, static CSS extraction, and Web Standard request/response contracts that run unchanged on Node.js and edge runtimes such as Cloudflare workerd and Deno.

> **HTML First → Progressive Enhancement → Resumable Fine-Grained Reactivity → Client JS Only When Needed**

---

## The four governing invariants

These are release contracts, not defaults. They are enforced by the compiler (`nexis check --budget`), runtime tests, browser tests, and CI.

| #   | Invariant                  | Contract                                                                                                                 | Enforced by                                               |
| --- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| 1   | **Static JavaScript**      | A route without resumable interaction ships **0 bytes** of client JavaScript.                                            | `DEFAULT_BUDGET.staticClientJsBytes = 0`                  |
| 2   | **Interactive JavaScript** | Each interactive route stays below **15 KB gzipped** of route client code.                                               | `DEFAULT_BUDGET.interactiveClientJsGzipBytes = 15 * 1024` |
| 3   | **Bootstrap runtime**      | The resumability bootstrap stays below **1 KB gzipped**.                                                                 | `DEFAULT_BUDGET.bootstrapGzipBytes = 1024`                |
| 4   | **Web Vitals discipline**  | LCP < 2.5 s and CLS < 0.1 are operational targets; `<Image>`-style media pipelines prevent layout shift by construction. | Media pipeline + build gates                              |

Additional architectural commitments: rendering produces real HTML (no virtual DOM, no reconciliation), inline static style objects are extracted to a CSS artifact at build time, user/request state stays request-local, and all runtime boundaries use WHATWG `Request`/`Response`/`Headers`/streams plus Web Crypto-compatible semantics.

---

## Quickstart

Initialize a project from **GitHub Packages** (the registry hosting every `@mohammedaydan/*` package):

```powershell
# One-time: authenticate with a classic PAT that has read:packages
npm config set @mohammedaydan:registry https://npm.pkg.github.com
npm config set //npm.pkg.github.com/:_authToken $env:GITHUB_TOKEN
```

Then scaffold with your favorite package manager:

```bash
# pnpm
pnpm dlx @mohammedaydan/create-nexis@latest my-nexis-app --yes --ts
cd my-nexis-app && pnpm install && pnpm dev
```

```bash
# npm
npx --yes @mohammedaydan/create-nexis@latest my-nexis-app --yes --ts
cd my-nexis-app && npm install && npm run dev
```

```bash
# yarn
yarn dlx @mohammedaydan/create-nexis@latest my-nexis-app --yes --ts
cd my-nexis-app && yarn install && yarn dev
```

The initializer also installs under its compatibility name, so both commands work after resolution:

```bash
npm exec --yes --package @mohammedaydan/create-nexis@latest -- create-nexis-app my-nexis-app --yes --ts
pnpm dlx --package=@mohammedaydan/create-nexis@latest create-nexis-app my-nexis-app --yes --ts
```

Inside an existing app, the CLI exposes the same engine: `nexis create <name> [--yes] [--ts|--js] [--tailwind]`.

Initializer flags: `--yes` (non-interactive), `--ts` / `--js`, `--tailwind` / `--no-tailwind`. Without `--yes`, the initializer prompts for language and Tailwind preference.

> `ERR_PNPM_FETCH_404` means either the scope is not routed to GitHub Packages or your token lacks `read:packages`. The unscoped `pnpm create nexis` form resolves against npmjs and is not the GitHub Packages form.

### What you get

```text
my-nexis-app/
├── src/
│   ├── routes/
│   │   ├── layout.tsx         # Root layout shell
│   │   ├── index.tsx          # Static home page — 0 KB client JS
│   │   └── counter.tsx        # Resumable interactive counter (onClick$)
│   └── shared/types.ts
├── public/                    # Static assets served as-is
├── index.html                 # Application shell
├── package.json
├── tsconfig.json
└── README.md
```

TypeScript is native by construction — `jsx: "react-jsx"` with `jsxImportSource: "@mohammedaydan/core"`, strict mode, ES2022 targets:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "jsxImportSource": "@mohammedaydan/core",
    "strict": true,
    "skipLibCheck": true
  }
}
```

JavaScript projects (`--js`) are first-class: routes become `.jsx`, `allowJs` flips on, and every template has a JS variant.

---

## Authoring JSX and TSX

JSX/TSX is Nexis's primary syntax. There is no React, no virtual DOM, and no reconciliation engine: components execute once on the server, produce HTML, and finish. Interactivity is declared as explicit lazy boundaries that the compiler extracts into hashed chunks loaded on demand.

### Static server components (0 KB JS)

A default-exported component that renders markup ships zero application JavaScript. The `seo` export feeds document metadata:

```tsx
export const seo = {
  title: 'Home | Nexis App',
  description: 'Rendered server-side with zero client JavaScript overhead.',
}

export default async function HomePage() {
  return (
    <main>
      <h1>Hello Nexis</h1>
      <p>This page arrives useful before any script runs.</p>
    </main>
  )
}
```

Async components are supported at the route boundary — data fetching can `await` directly inside the component body while the server renders.

### Resumable interactive components (`onClick$`)

Appending `$` to an event prop marks a **lazy interaction boundary**. The compiler extracts the expression into a content-hashed chunk (`chunk_<hash>.js`), rewrites the attribute to `data-nx-on-click="chunk_<hash>.js#handler_<hash>"`, and removes the code from the server response. On first click, the sub-kilobyte bootstrap imports that chunk and invokes the handler with `{ element }`.

```tsx
export default function CounterPage() {
  return (
    <main>
      <h1>Resumable counter</h1>
      <button
        data-nx-state="0"
        onClick$={({ element }: { element: HTMLElement }) => {
          const next = Number(element.textContent || '0') + 1
          element.textContent = String(next)
          element.dataset.nxState = String(next)
        }}
      >
        0
      </button>
    </main>
  )
}
```

What this page costs before the first click: **0 bytes** of application JavaScript. After a click: exactly one small chunk, cached forever.

For stateful logic inside handlers, import fine-grained signals from `@mohammedaydan/reactivity` (`state`, `computed`, `batch`) and synchronize the DOM explicitly — signals are plain primitives, not a reactivity-to-DOM binding layer.

### Boundaries and guarantees

- Handler expressions must be serializable (arrow functions closing over DOM-free values).
- Server-only imports cannot leak into client modules — the compiler rejects them (`NEXIS_SERVER_IMPORT_IN_CLIENT`).
- Secret-like environment access in shipped code is a hard error (`NEXIS_SECRET_EXPOSURE`).
- Inline static style objects (`style={{ color: 'red' }}`) compile to hash-scoped CSS classes; dynamic styles do not exist by design.

---

## Render modes

Routes choose how their HTML is produced and cached through `renderRoute` from `@mohammedaydan/renderer`. Four tempos cover the spectrum:

```ts
import { renderRoute } from '@mohammedaydan/renderer'

const output = await renderRoute({
  key: '/feed',
  mode: { mode: 'isr', revalidate: 60 },
  render: () => renderFeed(),
  cache, // ISR requires an injected cache implementation
})

output.html // ready-to-serve HTML
output.cacheControl // header value for this mode
output.stale // true when stale-while-revalidate regenerated it
```

| Mode    | Export shape                           | Cache-Control emitted | Use for                                        |
| ------- | -------------------------------------- | --------------------- | ---------------------------------------------- |
| **SSG** | `{ mode: 'static' }` _(default)_       | `public, immutable`   | Content that does not need a request to exist  |
| **ISR** | `{ mode: 'isr', revalidate: seconds }` | `s-maxage=<seconds>`  | Freshness within a bounded regeneration window |
| **SSR** | `{ mode: 'server' }`                   | `private, no-store`   | Personal or request-time data                  |
| **PPR** | `{ mode: 'partial' }`                  | `public, max-age=0`   | A public shell with per-request partials       |

ISR validates `revalidate` (1 second – 365 days) and regenerates lazily: requests inside the window serve cached HTML instantly; the first request after expiry triggers regeneration and reports `stale: true`.

---

## Media & SEO built in

### Images without layout shift

`@mohammedaydan/media` generates AVIF and WebP variants at multiple widths via sharp, returning everything needed for responsive `srcset` markup:

```ts
import { transformImage, imageAttributes } from '@mohammedaydan/media'

const variants = await transformImage(sourceSvgOrBitmap, 'hero', [320, 640])
// → [{ format: 'webp' | 'avif', width, fileName, bytes }, ...]
```

Because each variant carries explicit intrinsic dimensions, CLS from late-loading media is prevented by construction rather than patched afterward.

### Self-hosted fonts

```ts
import { fontFace } from '@mohammedaydan/media'

fontFace({ family: 'Inter', weight: [400], source: '/assets/inter.woff2' })
// → @font-face rule with font-display: swap, self-hosted — no third-party requests
```

`selfHostFont(url)` / `downloadFont(url)` fetch and materialize remote fonts into your asset tree; `imageAttributes()` produces sanitized attribute records for template use.

### Structured SEO

```ts
import { renderHead, buildSitemap, buildRobots } from '@mohammedaydan/seo'

renderHead({
  title: 'Home | Nexis App',
  description: '…',
  canonical: 'https://example.com/',
  jsonLd: { '@type': 'Organization', name: 'Example' },
})
// → <title>, meta description, canonical link, og tags, JSON-LD script (injection-safe)

buildSitemap([{ url: 'https://example.com/', priority: 1 }])
buildRobots('https://example.com/sitemap.xml', ['/admin'])
```

JSON-LD is escaped against `</script>` injection; URLs are validated to http(s); sitemaps and robots.txt emit from typed entries.

---

## CLI reference

Every project ships the `nexis` binary:

| Command                | Purpose                                                                                                                                        |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `nexis dev`            | Start the development server (instant, HMR-capable)                                                                                            |
| `nexis build`          | Produce SSG/ISR/SSR bundles: server route modules, hashed handler chunks, the resumability bootstrap, extracted CSS, and `nexis-manifest.json` |
| `nexis start`          | Serve a production build locally                                                                                                               |
| `nexis check --budget` | Build, then enforce the three byte budgets per route; fails loudly with violation messages                                                     |
| `nexis analyze`        | Report per-route output: client JS (gzipped), CSS bytes, interactive/static mode                                                               |
| `nexis routes`         | List discovered routes from `src/routes`                                                                                                       |
| `nexis create <name>`  | Scaffold a new project (same engine as this initializer)                                                                                       |

Route discovery walks `src/routes/**/*.{tsx,jsx,ts,js}`; `layout.*` files are excluded from route emission.

---

## Architecture

```text
┌────────────────────────────────────────────────────────────┐
│                      your application                       │
│            src/routes/*.tsx  ·  public assets               │
└───────────────┬────────────────────────────┬───────────────┘
                │ nexis dev / build          │
┌───────────────▼─────────────┐  ┌───────────▼───────────────┐
│  @mohammedaydan/cli         │  │  @mohammedaydan/compiler   │
│  (vite orchestration)       │  │  boundaries · budgets      │
└───────┬─────────────┬───────┘  └────────────────────────────┘
        │             │
┌───────▼──────┐ ┌────▼───────────────────────┐
│ vite-plugin  │ │ dist/server/routes (ESM)   │
│ onClick$ →   │ │ dist/nexis-chunks/*.js     │
│ lazy chunks  │ │ dist/nexis-bootstrap.js    │
└──────────────┘ └────────────────────────────┘
        │
┌───────▼──────────────────────────────────────────────────┐
│ core (JSX primitives) · renderer (modes/streams) ·       │
│ reactivity (signals) · seo · media · server · adapters   │
└──────────────────────────────────────────────────────────┘
```

**Package map**

| Package                       | Responsibility                                                                    |
| ----------------------------- | --------------------------------------------------------------------------------- |
| `@mohammedaydan/core`         | JSX element primitives, component types, request context                          |
| `@mohammedaydan/jsx-runtime`  | Automatic JSX factory (`jsx`/`jsxs`/`Fragment`)                                   |
| `@mohammedaydan/compiler`     | Import-boundary validation, secret detection, budget enforcement                  |
| `@mohammedaydan/vite-plugin`  | `onClick$` extraction, dev middleware for bootstrap/chunks, static CSS extraction |
| `@mohammedaydan/cli`          | `nexis` command surface and build pipeline                                        |
| `@mohammedaydan/renderer`     | String/stream rendering, the four render modes                                    |
| `@mohammedaydan/reactivity`   | Fine-grained signals: `state`, `computed`, `batch`                                |
| `@mohammedaydan/state`        | Request-scoped state primitives                                                   |
| `@mohammedaydan/server`       | HTTP server composition                                                           |
| `@mohammedaydan/adapters`     | Node / Cloudflare / Deno adapter contracts                                        |
| `@mohammedaydan/dev-server`   | Development serving utilities                                                     |
| `@mohammedaydan/actions`      | Server actions                                                                    |
| `@mohammedaydan/client`       | Client-side helpers for resumed islands                                           |
| `@mohammedaydan/router`       | Route table primitives                                                            |
| `@mohammedaydan/css`          | CSS extraction utilities                                                          |
| `@mohammedaydan/media`        | Image variant pipeline, self-hosted fonts                                         |
| `@mohammedaydan/seo`          | Head tags, JSON-LD, sitemaps, robots                                              |
| `@mohammedaydan/create-nexis` | Project initializer (`create-nexis`, `create-nexis-app` bins)                     |

All packages live under the `@mohammedaydan` scope on GitHub Packages and share the same version line.

---

## Testing and release gates

```powershell
pnpm install          # workspace install
pnpm -r build         # compile every package
pnpm typecheck        # tsc -b across project references
pnpm lint             # eslint
pnpm format:check     # prettier
pnpm test             # vitest unit + integration
pnpm test:e2e         # Playwright, real Chromium
pnpm test:node-runtime   # Node adapter smoke
pnpm test:edge           # Miniflare/workerd smoke
pnpm test:deno           # Deno adapter smoke
pnpm test:deno:e2e       # Deno render-mode + bootstrap spec
pnpm security         # pnpm audit --audit-level high
pnpm budget           # compiler budget suite
pnpm publish:github:dry  # pack validation (no upload)
```

Releases are tag-driven: pushing `v<version>` triggers the publishing workflow, which re-runs every gate, validates packed tarballs, publishes all non-private packages in dependency order using the workflow `GITHUB_TOKEN` (`contents: read`, `packages: write`), and finally verifies the initializer resolves from the registry.

---

## Repository map

```text
packages/     one directory per published package
examples/     basic-app, landing-page, blog, ecommerce, hello
tests/
  e2e/        Playwright specs + fixture builders + Deno runtime spec
  parity/     cross-runtime smoke scripts (Node, workerd, Deno)
  integration/security-isolation.test.ts
docs/         architecture notes and ADRs
.github/      quality.yml (per-push) · publish-packages.yml (tag-driven)
```

## Status

**v2.0.0 GA.** All governing invariants hold on every supported runtime. See `SECURITY.md` for reporting policy and credential handling.
