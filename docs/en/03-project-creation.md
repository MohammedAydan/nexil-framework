# 03 — Creating a Nexis Project with the Current Release

## Requirements

Use a recent Node.js release with ESM and TypeScript support, together with pnpm. The repository currently uses Node `22.13.0` and pnpm `10.15.0`. Pin the package-manager version in your team and CI so lockfiles remain reproducible.

```bash
node --version
pnpm --version
```

## Create a project

The repository provides `@mohammedaydan/create-nexis-app` and `@mohammedaydan/create-nexis`. Use the published CLI or the workspace package when developing the framework itself.

```bash
pnpm dlx @mohammedaydan/create-nexis-app my-site
cd my-site
pnpm install
```

Do not mix an old generated `dist` directory with a new CLI version. Recreate a disposable project or reinstall dependencies from the target release.

## Recommended structure

```text
my-site/
├── src/
│   ├── routes/
│   │   ├── index.tsx
│   │   ├── about.tsx
│   │   └── docs/
│   │       └── [slug].tsx
│   ├── components/
│   ├── lib/
│   └── styles/
├── public/
├── nexis.config.ts
├── package.json
├── tsconfig.json
└── pnpm-lock.yaml
```

Keep database access out of component modules. Place it in a server-only data layer and pass validated results into routes or components.

## First page

```tsx
// src/routes/index.tsx
import { renderHead } from '@mohammedaydan/seo'

export default function Home() {
  return (
    <html lang="en">
      <head>
        {renderHead({
          title: 'My Nexis site',
          description: 'An HTML-first page built with Nexis.',
        })}
      </head>
      <body>
        <main>
          <h1>Hello from Nexis</h1>
        </main>
      </body>
    </html>
  )
}
```

Projects using the JSX runtime can keep the route even simpler:

```tsx
export default function Home() {
  return (
    <main>
      <h1>Hello from Nexis</h1>
    </main>
  )
}
```

## `nexis.config.ts`

```ts
import type { NexisBuildConfig } from '@mohammedaydan/cli'

const config: NexisBuildConfig = {
  siteOrigin: 'https://example.com',
  feed: {
    title: 'My site',
    description: 'Recent pages and updates.',
    language: 'en',
  },
  redirects: [{ from: '/old-docs', to: '/docs/architecture', status: 308 }],
}

export default config
```

Use the real production origin when generating canonical URLs and sitemaps. Do not use a temporary preview hostname for public metadata.

## Development commands

| Command              | Purpose                                                  |
| -------------------- | -------------------------------------------------------- |
| `pnpm dev`           | Start the development server when defined by the project |
| `pnpm build`         | Build the workspace or application                       |
| `pnpm typecheck`     | Run TypeScript project-reference checks                  |
| `pnpm test`          | Run Vitest                                               |
| `pnpm test:e2e`      | Run Playwright                                           |
| `pnpm lint`          | Run ESLint                                               |
| `pnpm format:check`  | Run the Prettier check                                   |
| `pnpm release:check` | Dry-run the publishable packages                         |

## First verification

After scaffolding, run:

```bash
pnpm build
pnpm typecheck
pnpm lint
pnpm test
```

Do not move to deployment while TypeScript or formatting checks are failing. In Nexis, a build failure can mean that routes, chunks, or assets will not reach `dist` correctly.

## Version updates

Update dependencies from one controlled source, review the lockfile, and run the full project checks. Do not use `latest` in production without pinning the resulting version in the lockfile. For major-version upgrades, read [Releases and upgrades](./19-releases-and-upgrades.md).
