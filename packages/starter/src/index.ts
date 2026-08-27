export type StarterLanguage = 'ts' | 'js'
export type StarterTemplate = 'minimal' | 'interactive' | 'secure-node'

export interface StarterOptions {
  readonly projectName: string
  readonly template?: StarterTemplate
  readonly language?: StarterLanguage
  readonly tailwind?: boolean
  /** Package range for published projects, or workspace:* for local framework development. */
  readonly dependencyVersion?: string
}

export interface ResolvedStarterOptions {
  readonly projectName: string
  readonly template: StarterTemplate
  readonly language: StarterLanguage
  readonly tailwind: boolean
  readonly dependencyVersion: string
}

export interface StarterFile {
  readonly path: string
  readonly content: string
}

export const STARTER_TEMPLATES: readonly StarterTemplate[] = [
  'minimal',
  'interactive',
  'secure-node',
]

const PROJECT_NAME = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/

export function assertStarterProjectName(projectName: string): void {
  if (!PROJECT_NAME.test(projectName) || projectName === 'node_modules') {
    throw new TypeError(
      'Project name must be 1–64 characters, start with a letter, and contain no path separators.',
    )
  }
}

export function resolveStarterOptions(options: StarterOptions): ResolvedStarterOptions {
  assertStarterProjectName(options.projectName)
  const template = options.template ?? 'interactive'
  if (!STARTER_TEMPLATES.includes(template))
    throw new TypeError(`Unknown starter template: ${template}`)
  const language = options.language ?? 'ts'
  if (language !== 'ts' && language !== 'js')
    throw new TypeError(`Unknown starter language: ${language}`)
  const dependencyVersion = options.dependencyVersion ?? '^1.3.1'
  if (!/^\^?\d+\.\d+\.\d+$/.test(dependencyVersion) && dependencyVersion !== 'workspace:*')
    throw new TypeError('Starter dependencyVersion must be a semver range or workspace:*.')
  return {
    projectName: options.projectName,
    template,
    language,
    tailwind: options.tailwind ?? false,
    dependencyVersion,
  }
}

function packageJson(options: ResolvedStarterOptions): string {
  const dependencies: Record<string, string> = {
    '@mohammedaydan/cli': options.dependencyVersion,
    '@mohammedaydan/core': options.dependencyVersion,
    '@mohammedaydan/css': options.dependencyVersion,
    '@mohammedaydan/jsx-runtime': options.dependencyVersion,
    '@mohammedaydan/media': options.dependencyVersion,
    '@mohammedaydan/reactivity': options.dependencyVersion,
    '@mohammedaydan/router': options.dependencyVersion,
    '@mohammedaydan/security': options.dependencyVersion,
    '@mohammedaydan/seo': options.dependencyVersion,
    '@mohammedaydan/state': options.dependencyVersion,
  }
  const devDependencies: Record<string, string> = {
    typescript: '^5.8.0',
    vite: '^7.3.6',
  }
  if (options.tailwind) {
    devDependencies.tailwindcss = '^4.1.0'
    devDependencies['@tailwindcss/vite'] = '^4.1.0'
  }
  return `${JSON.stringify(
    {
      name: options.projectName,
      private: true,
      type: 'module',
      packageManager: 'pnpm@10.15.0',
      scripts: {
        dev: 'nexis dev',
        build: 'nexis build',
        start: 'nexis start',
        typecheck: 'tsc --noEmit',
        check: 'nexis check --budget',
        analyze: 'nexis analyze',
      },
      dependencies,
      devDependencies,
      nexis: {
        routeExtension: options.language === 'ts' ? 'tsx' : 'jsx',
        source: options.dependencyVersion === 'workspace:*' ? 'workspace' : 'github-packages',
        registry: 'https://npm.pkg.github.com',
      },
      ...(options.dependencyVersion === 'workspace:*'
        ? {}
        : { pnpm: { onlyBuiltDependencies: ['esbuild', 'sharp'] } }),
    },
    null,
    2,
  )}\n`
}

function tsconfig(options: ResolvedStarterOptions): string {
  return `${JSON.stringify(
    {
      compilerOptions: {
        target: 'ES2022',
        lib: ['ES2022', 'DOM', 'DOM.Iterable'],
        module: 'ESNext',
        moduleResolution: 'Bundler',
        jsx: 'react-jsx',
        jsxImportSource: '@mohammedaydan/jsx-runtime',
        allowJs: options.language === 'js',
        strict: true,
        skipLibCheck: true,
        noEmit: true,
      },
      include: [`src/**/*.${options.language === 'ts' ? 'tsx' : 'jsx'}`],
    },
    null,
    2,
  )}\n`
}

const SHELL_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <!--nexis-head-outlet-->
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body>
    <div id="app"><!--nexis-app-outlet--></div>
    <!--nexis-scripts-outlet-->
  </body>
</html>
`

const BASE_CSS = `/* Nexis starter design system: restrained technical paper */
*{box-sizing:border-box}
body{margin:0;background:#f5f6f3;color:#13231d;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;line-height:1.6}
a{color:inherit}.shell{width:min(72rem,100% - 2rem);margin:auto;padding:clamp(2rem,6vw,6rem) 0}.eyebrow{font:700 .75rem/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.12em;color:#147a55}.hero{max-width:48rem}.hero h1{font-size:clamp(2.7rem,7vw,5.5rem);line-height:.96;letter-spacing:-.06em;margin:.7rem 0 1rem}.hero p{font-size:1.1rem;max-width:42rem}.panel{margin-top:2.5rem;padding:1.5rem;border:1px solid #c9d0c9;background:#fff;box-shadow:8px 8px 0 #dce7d7}.button{border:0;background:#147a55;color:#fff;padding:.75rem 1rem;font:inherit;font-weight:700;cursor:pointer}.button:focus-visible{outline:3px solid #d7a900;outline-offset:3px}.code{overflow:auto;padding:1rem;background:#13231d;color:#e8f5ed;font:500 .86rem/1.6 ui-monospace,SFMono-Regular,Menlo,monospace}
`

function routeSource(options: ResolvedStarterOptions): string {
  const typedEvent = options.language === 'ts' ? ': { element: HTMLElement }' : ''
  if (options.template === 'interactive') {
    return `import { component, state } from '@mohammedaydan/core'

export const seo = { title: '${options.projectName} — Nexis', description: 'An HTML-first Nexis starter with one resumable interaction boundary.' }

const count = state(0)

export default component(() => (
  <main className="shell">
    <p className="eyebrow">NEXIS · INTERACTIVE STARTER</p>
    <section className="hero"><h1>Ship HTML.<br />Wake only the button.</h1><p id="engine-stamp">Rendered via Nexis SSR Engine. This page is useful before JavaScript; the counter below is a focused resumable boundary.</p></section>
    <section className="panel"><p className="eyebrow">STATE BOUNDARY</p><p><button id="counter-btn" className="button" onClick$={({ element }${typedEvent}) => { const next = count() + 1; count.set(next); element.textContent = 'Count: ' + String(next); element.setAttribute('aria-label', 'Incremented counter') }}>Count: 0</button></p></section>
  </main>
))
`
  }
  const secureNote =
    options.template === 'secure-node'
      ? '<p>Security headers are configured explicitly in <code>nexis.config.ts</code>. Review CSP and trustProxy before deployment.</p>'
      : '<p>This project starts with useful server-rendered HTML and no client boundary.</p>'
  return `import { component } from '@mohammedaydan/core'

export const seo = { title: '${options.projectName} — Nexis', description: 'An HTML-first Nexis starter project.' }

export default component(() => (
  <main className="shell">
    <p className="eyebrow">NEXIS · ${options.template.toUpperCase()}</p>
    <section className="hero"><h1>Begin with the document.</h1>${secureNote}</section>
    <section className="panel"><p className="eyebrow">FIRST CHECK</p><pre className="code"><code>pnpm build\npnpm check\npnpm start</code></pre></section>
  </main>
))
`
}

function secureConfig(options: ResolvedStarterOptions): string | undefined {
  if (options.template !== 'secure-node') return undefined
  return `import { defineConfig } from '@mohammedaydan/serve'

export default defineConfig({
  server: {
    trustProxy: false,
    securityHeaders: {
      contentSecurityPolicy: "default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
    },
  },
})
`
}

function counterRouteSource(options: ResolvedStarterOptions): string | undefined {
  if (options.template !== 'interactive') return undefined
  return `import { component, state } from '@mohammedaydan/core'

export const seo = { title: 'Counter — ${options.projectName}', description: 'A focused resumable Nexis state boundary.' }

const count = state(0)

export default component(() => <main className="shell"><p className="eyebrow">NEXIS · COUNTER</p><section className="panel"><p><button className="button" onClick$={({ element }) => { const next = count() + 1; count.set(next); element.textContent = 'Count: ' + String(next) }}>Count: 0</button></p></section></main>)
`
}

export function createStarterFiles(options: StarterOptions): readonly StarterFile[] {
  const resolved = resolveStarterOptions(options)
  const extension = resolved.language === 'ts' ? 'tsx' : 'jsx'
  const files: StarterFile[] = [
    { path: 'package.json', content: packageJson(resolved) },
    { path: 'index.html', content: SHELL_HTML },
    { path: 'tsconfig.json', content: tsconfig(resolved) },
    { path: '.npmrc', content: '@mohammedaydan:registry=https://npm.pkg.github.com\n' },
    { path: 'public/styles.css', content: BASE_CSS },
    { path: `src/routes/index.${extension}`, content: routeSource(resolved) },
    {
      path: 'README.md',
      content: `# ${resolved.projectName}\n\nCreated with the Nexis ${resolved.template} template.\n\n## Run\n\n\`\`\`bash\npnpm install\npnpm dev\n\`\`\`\n\nBefore deployment, run \`pnpm typecheck\`, \`pnpm check\`, and \`pnpm build\`. Configure a GitHub Packages token with \`read:packages\` in your local or deployment environment; never commit it.\n`,
    },
  ]
  const counter = counterRouteSource(resolved)
  if (counter) files.push({ path: `src/routes/counter.${extension}`, content: counter })
  const config = secureConfig(resolved)
  if (config)
    files.push({
      path: `nexis.config.${resolved.language === 'ts' ? 'ts' : 'js'}`,
      content: config,
    })
  if (resolved.tailwind) {
    files.push(
      { path: 'src/styles.css', content: '@import "tailwindcss";\n' },
      {
        path: 'vite.config.ts',
        content: `import tailwindcss from '@tailwindcss/vite'\nimport { defineConfig } from 'vite'\n\nexport default defineConfig({ plugins: [tailwindcss()] })\n`,
      },
      {
        path: '.vscode/extensions.json',
        content: `${JSON.stringify({ recommendations: ['bradlc.vscode-tailwindcss'] }, null, 2)}\n`,
      },
      {
        path: '.vscode/settings.json',
        content: `${JSON.stringify(
          { 'tailwindCSS.experimental.classRegex': [['className="([^"]*)"', '[^\\s]+']] },
          null,
          2,
        )}\n`,
      },
    )
  }
  return files
}
