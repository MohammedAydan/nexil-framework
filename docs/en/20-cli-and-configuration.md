# 20 — CLI and Configuration

## Discover the available commands

Start with the scripts in `package.json` and the CLI help for the installed release. Workspace scripts are the stable entry point for this repository.

```bash
# For the published scoped initializer, configure GitHub Packages when required.
npm config set @mohammedaydan:registry https://npm.pkg.github.com
pnpm dlx @mohammedaydan/create-nexis@latest my-app --yes --ts
cd my-app
pnpm install
pnpm dev
```

For an existing project, inspect the installed CLI and use the repository scripts:

```bash
nexis --help
nexis start
nexis generate route account/settings
nexis generate component Button
nexis add action saveProfile
nexis doctor
pnpm build
pnpm check:budget
pnpm release:check
```

The v1.1 CLI also provides `generate route`, `generate component`, `add action`, `doctor`, `preview`, `test`, and `upgrade`. The exact flags are versioned; do not copy an option from an unrelated release without checking `nexis --help` and the installed declarations.

## Typical workflow

```bash
pnpm install
pnpm dev
pnpm build
pnpm start
pnpm typecheck
pnpm test
```

`dev` is for local iteration. `build` creates the full production artifact, including `public/` assets, and `start` serves it with Nexis route, Action, cache, and security semantics. Production verification must use `pnpm build` then `pnpm start`, not only the development server.

## Route discovery

The build discovers route files under the configured source directory, recursively composes `_layout.*` modules, derives route records, renders the selected mode, and emits a manifest. Route-group directories contribute layout context but not public URL segments. Inspect the manifest when a route is missing or has the wrong rendering mode.

## Rendering configuration

Configuration is optional. Import `defineConfig` from `@mohammedaydan/serve` only when overriding defaults such as the public origin, server port, redirects, feed metadata, cache policy, or Action origin policy. Keep configuration narrowly typed and avoid undocumented fields.

```ts
import { defineConfig } from '@mohammedaydan/serve'

export default defineConfig({
  app: { origin: 'https://app.example.com' },
  server: { port: 3000 },
  redirects: [{ from: '/old', to: '/new', status: 308 }],
})
```

## Feeds

Feed configuration describes title, description, site link, feed URL, language, and published route records. The build can emit RSS and Atom when the configured route inventory contains feed items.

## Redirects

Redirect entries should use local paths and an allowed status such as `301`, `302`, `307`, or `308` according to the current API. Validate targets and test that external or dangerous protocols are rejected.

## OG images

When OG generation is enabled, build outputs PNG cards from escaped title and description data. Keep generation deterministic and review output size. Do not add a runtime browser dependency to the client bundle for this build step.

## Environment variables

Use environment variables for deployment-specific values such as host, port, public origin, trusted-proxy mode, and secrets. Document whether each variable is read at build time or request time.

```bash
NEXIS_HOST=127.0.0.1 NEXIS_PORT=3000 pnpm start
```

Never commit secrets or include them in generated HTML.

## Output inspection

After a build, inspect:

```text
dist/
├── client/
│   ├── index.html
│   ├── assets/
│   ├── og/
│   ├── nexis-manifest.json
│   ├── nexis-bootstrap.js       # interactive routes only
│   ├── nexis-bindings.js        # binding routes only
│   ├── nexis-forms.js           # progressive Form routes only
│   ├── robots.txt
│   ├── sitemap.xml
│   ├── feed.xml
│   └── atom.xml
├── server/routes/                # generated SSR route modules
└── nexis-chunks/                 # hashed lazy handler chunks
```

The current CLI writes `nexis-manifest.json`. `nexis-bootstrap.js` is emitted when an event boundary exists, `nexis-bindings.js` when transformed routes contain binding metadata, and `nexis-forms.js` when a route contains a progressive `Form`. Use the generated manifest and build logs as the release-specific source of truth.

## CI configuration

Use a clean checkout and a frozen lockfile. Cache package-manager downloads, not generated production output that might hide a missing build step. Store reports and benchmark artifacts as CI artifacts.

## Configuration principles

- Prefer typed configuration over arbitrary environment strings.
- Keep public configuration separate from secrets.
- Validate URLs at configuration load time.
- Make defaults safe for shared caching.
- Fail the build on invalid SEO or redirect data.
- Record configuration changes in release notes.
- Keep generated runtime assumptions synchronized with `nexis-bootstrap.js`, `nexis-bindings.js`, and `nexis-forms.js`.
