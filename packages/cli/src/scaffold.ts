import { access, mkdir, readdir, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'

export type ScaffoldLanguage = 'ts' | 'js'

export interface ScaffoldOptions {
  readonly language?: ScaffoldLanguage
  readonly tailwind?: boolean
  readonly yes?: boolean
}

export interface ResolvedScaffoldOptions {
  readonly language: ScaffoldLanguage
  readonly tailwind: boolean
}

export interface PathOperations {
  readonly relative: (from: string, to: string) => string
  readonly isAbsolute: (path: string) => boolean
}

export function isContainedPath(
  parent: string,
  child: string,
  pathOperations: PathOperations = { relative, isAbsolute },
  separator = sep,
): boolean {
  const relation = pathOperations.relative(parent, child)
  return (
    relation !== '' &&
    relation !== '..' &&
    !relation.startsWith(`..${separator}`) &&
    !pathOperations.isAbsolute(relation)
  )
}

const PROJECT_NAME = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/

export function assertScaffoldProjectName(name: string): void {
  if (!PROJECT_NAME.test(name) || name === 'node_modules') {
    throw new TypeError(
      'Project name must be 1–64 characters, start with a letter, and contain no path separators.',
    )
  }
}

export function parseScaffoldArgs(args: readonly string[]): {
  readonly name?: string
  readonly options: ScaffoldOptions
} {
  let name: string | undefined
  let language: ScaffoldLanguage | undefined
  let tailwind: boolean | undefined
  let yes = false
  for (const arg of args) {
    if (arg === '--yes' || arg === '-y') yes = true
    else if (arg === '--ts') {
      if (language === 'js') throw new Error('Choose only one of --ts or --js.')
      language = 'ts'
    } else if (arg === '--js') {
      if (language === 'ts') throw new Error('Choose only one of --ts or --js.')
      language = 'js'
    } else if (arg === '--tailwind') tailwind = true
    else if (arg === '--no-tailwind') tailwind = false
    else if (arg.startsWith('-')) throw new Error(`Unknown create option: ${arg}`)
    else if (name) throw new Error(`Unexpected argument: ${arg}`)
    else name = arg
  }
  const options: ScaffoldOptions = {
    yes,
    ...(language === undefined ? {} : { language }),
    ...(tailwind === undefined ? {} : { tailwind }),
  }
  return name === undefined ? { options } : { name, options }
}

async function promptOptions(options: ScaffoldOptions): Promise<ResolvedScaffoldOptions> {
  if (options.yes)
    return { language: options.language ?? 'ts', tailwind: options.tailwind ?? false }
  const readline = createInterface({ input, output })
  try {
    const language =
      options.language ??
      ((await readline.question('Use TypeScript? [Y/n] ')).trim().toLowerCase() === 'n'
        ? 'js'
        : 'ts')
    const tailwindAnswer =
      options.tailwind === undefined
        ? await readline.question('Include Tailwind CSS? [y/N] ')
        : options.tailwind
          ? 'y'
          : 'n'
    return {
      language,
      tailwind: tailwindAnswer.trim().toLowerCase() === 'y',
    }
  } finally {
    readline.close()
  }
}

async function findFrameworkRoot(start: string): Promise<string | undefined> {
  let current = resolve(start)
  while (true) {
    try {
      await access(join(current, 'pnpm-workspace.yaml'))
      await access(join(current, 'packages', 'cli', 'package.json'))
      await access(join(current, 'packages', 'core', 'package.json'))
      return current
    } catch {
      const parent = dirname(current)
      if (parent === current) return undefined
      current = parent
    }
  }
}

function packageJson(
  name: string,
  resolved: ResolvedScaffoldOptions,
  directory: string,
  frameworkRoot?: string,
): string {
  const extension = resolved.language === 'ts' ? 'tsx' : 'jsx'
  const devDependencies: Record<string, string> = { typescript: '^5.8.0', vite: '^7.3.6' }
  if (resolved.tailwind) {
    devDependencies.tailwindcss = '^4.1.0'
    devDependencies['@tailwindcss/vite'] = '^4.1.0'
  }
  const dependency = (packageDirectory: string, publishedVersion: string): string =>
    frameworkRoot ? 'workspace:*' : publishedVersion
  return `${JSON.stringify(
    {
      name,
      private: true,
      type: 'module',
      packageManager: 'pnpm@10.15.0',
      scripts: {
        dev: 'nexis dev',
        build: 'nexis build',
        start: 'nexis start',
        check: 'nexis check --budget',
        'check:budget': 'nexis check --budget',
        analyze: 'nexis analyze',
      },
      dependencies: {
        '@mohammedaydan/cli': dependency('cli', '^1.0.0'),
        '@mohammedaydan/core': dependency('core', '^1.0.0'),
        '@mohammedaydan/css': dependency('css', '^1.0.0'),
        '@mohammedaydan/jsx-runtime': dependency('jsx-runtime', '^1.0.0'),
        '@mohammedaydan/media': dependency('media', '^1.0.0'),
        '@mohammedaydan/reactivity': dependency('reactivity', '^1.0.0'),
        '@mohammedaydan/security': dependency('security', '^1.0.0'),
        '@mohammedaydan/seo': dependency('seo', '^1.0.0'),
        '@mohammedaydan/state': dependency('state', '^1.0.0'),
      },
      devDependencies,
      nexis: {
        routeExtension: extension,
        source: frameworkRoot ? 'workspace' : 'github-packages',
        registry: 'https://npm.pkg.github.com',
      },
      ...(frameworkRoot
        ? {}
        : {
            pnpm: {
              onlyBuiltDependencies: ['esbuild', 'sharp'],
            },
          }),
    },
    null,
    2,
  )}\n`
}

function tsconfig(resolved: ResolvedScaffoldOptions): string {
  const config = {
    compilerOptions: {
      target: 'ES2022',
      lib: ['ES2022', 'DOM', 'DOM.Iterable'],
      module: 'ESNext',
      moduleResolution: 'Bundler',
      jsx: 'react-jsx',
      jsxImportSource: '@mohammedaydan/jsx-runtime',
      allowJs: resolved.language === 'js',
      strict: true,
      skipLibCheck: true,
      noEmit: false,
      outDir: 'dist/types',
      rootDir: 'src',
    },
    include: [`src/**/*.${resolved.language === 'ts' ? 'tsx' : 'jsx'}`],
  }
  return `${JSON.stringify(config, null, 2)}\n`
}

const LANDING_HTML = `<!DOCTYPE html>
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

// Aurora-glass design system shipped with every new project. Pure CSS so the
// starter is beautiful with zero extra dependencies; Tailwind stacks on top of
// it when requested instead of replacing it.
const DESIGN_CSS = `/* Nexis starter design system — aurora glass */
*,*::before,*::after{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;min-height:100vh;background:#070b14;color:#e2e8f0;font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;line-height:1.6;-webkit-font-smoothing:antialiased}
body::before,body::after{content:"";position:fixed;inset:auto;z-index:-1;border-radius:50%;filter:blur(120px);pointer-events:none}
body::before{top:-240px;left:50%;transform:translateX(-50%);width:900px;height:520px;background:radial-gradient(closest-side,rgba(34,211,238,.16),rgba(129,140,248,.12),transparent)}
body::after{bottom:-320px;right:-180px;width:760px;height:560px;background:radial-gradient(closest-side,rgba(192,132,252,.12),rgba(99,102,241,.10),transparent)}
a{color:inherit}
.nx-shell{min-height:100vh;display:flex;flex-direction:column}
.nx-nav{position:sticky;top:0;z-index:50;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px clamp(20px,5vw,48px);border-bottom:1px solid rgba(148,163,184,.14);background:rgba(7,11,20,.72);backdrop-filter:blur(14px)}
.nx-brand{display:inline-flex;align-items:center;gap:10px;font-weight:800;font-size:19px;letter-spacing:-.02em;text-decoration:none}
.nx-mark{display:grid;place-items:center;width:32px;height:32px;border-radius:10px;font-size:16px;color:#06121a;background:linear-gradient(135deg,#22d3ee,#818cf8 55%,#c084fc);box-shadow:0 6px 18px rgba(34,211,238,.28)}
.nx-links{display:flex;gap:6px}
.nx-links a{padding:8px 14px;border-radius:10px;font-size:14px;font-weight:600;color:#cbd5e1;text-decoration:none;transition:background .18s,color .18s}
.nx-links a:hover{color:#fff;background:rgba(148,163,184,.12)}
.nx-main{flex:1;width:min(1120px,100% - clamp(32px,8vw,96px));margin-inline:auto}
.nx-footer{display:flex;flex-wrap:wrap;gap:8px 24px;justify-content:space-between;padding:26px clamp(20px,5vw,48px);border-top:1px solid rgba(148,163,184,.14);color:#7d8aa0;font-size:13px}
.nx-pill{display:inline-flex;align-items:center;gap:9px;margin:0 0 22px;padding:7px 15px;border-radius:999px;border:1px solid rgba(34,211,238,.35);background:rgba(34,211,238,.08);color:#67e8f9;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;letter-spacing:.04em}
.nx-pill::before{content:"";width:7px;height:7px;border-radius:50%;background:#34e6b0;box-shadow:0 0 0 5px rgba(52,230,176,.14);animation:nx-pulse 2.2s ease-in-out infinite}
@keyframes nx-pulse{0%,100%{opacity:1}50%{opacity:.45}}
.nx-hero{padding:clamp(56px,9vh,110px) 0 clamp(40px,7vh,72px);max-width:820px}
.nx-hero h1{margin:0 0 20px;font-size:clamp(42px,6.4vw,76px);font-weight:800;letter-spacing:-.045em;line-height:1.03}
.nx-grad{background:linear-gradient(92deg,#22d3ee,#818cf8 55%,#c084fc);-webkit-background-clip:text;background-clip:text;color:transparent}
.nx-lede{margin:0 0 34px;max-width:620px;font-size:clamp(16px,2vw,19px);color:#9fb0c6}
.nx-cta{display:flex;flex-wrap:wrap;gap:14px}
.nx-btn{display:inline-flex;align-items:center;gap:10px;padding:13px 22px;border-radius:12px;font-size:14.5px;font-weight:700;text-decoration:none;transition:transform .16s,box-shadow .16s,filter .16s}
.nx-btn-primary{color:#04101c;background:linear-gradient(92deg,#22d3ee,#818cf8);box-shadow:0 10px 30px rgba(56,189,248,.25)}
.nx-btn-primary:hover{transform:translateY(-2px);box-shadow:0 16px 40px rgba(56,189,248,.34)}
.nx-btn-ghost{color:#dbe4ef;border:1px solid rgba(148,163,184,.28);background:rgba(148,163,184,.06)}
.nx-btn-ghost:hover{border-color:rgba(148,163,184,.5);background:rgba(148,163,184,.12)}
.nx-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin:26px 0 0}
.nx-stat{padding:18px 20px;border-radius:16px;border:1px solid rgba(148,163,184,.14);background:rgba(15,23,42,.55);backdrop-filter:blur(10px)}
.nx-stat b{display:block;font-size:26px;font-weight:800;letter-spacing:-.02em;color:#7dd3fc}
.nx-stat span{font-size:12.5px;color:#8fa1b8}
.nx-section{padding:clamp(44px,7vh,84px) 0}
.nx-section > h2{margin:0 0 10px;font-size:clamp(27px,3.6vw,40px);font-weight:800;letter-spacing:-.03em}
.nx-section > p.nx-sub{margin:0 0 34px;color:#9fb0c6;max-width:640px}
.nx-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:18px}
.nx-card{padding:26px;border-radius:18px;border:1px solid rgba(148,163,184,.14);background:linear-gradient(180deg,rgba(15,23,42,.66),rgba(15,23,42,.38));backdrop-filter:blur(10px)}
.nx-card h3{margin:14px 0 8px;font-size:17.5px;letter-spacing:-.01em}
.nx-card p{margin:0;font-size:14.5px;color:#9fb0c6}
.nx-icon{display:grid;place-items:center;width:42px;height:42px;border-radius:12px;font-size:20px;background:rgba(34,211,238,.1);border:1px solid rgba(34,211,238,.25)}
.nx-code{margin:18px 0 0;padding:16px 18px;border-radius:12px;border:1px solid rgba(148,163,184,.14);background:#0a101d;color:#a5f3fc;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12.75px;line-height:1.7;overflow-x:auto;white-space:pre}
.nx-demo{display:grid;grid-template-columns:1.05fr .95fr;gap:26px;align-items:center;padding:clamp(24px,4vw,40px);border-radius:22px;border:1px solid rgba(148,163,184,.16);background:linear-gradient(160deg,rgba(30,41,59,.62),rgba(15,23,42,.5));backdrop-filter:blur(12px);box-shadow:0 30px 70px rgba(2,6,23,.5)}
.nx-demo h3{margin:0 0 10px;font-size:22px;letter-spacing:-.02em}
.nx-demo p{margin:0 0 14px;color:#9fb0c6;font-size:15px}
.nx-demo-panel{display:flex;flex-direction:column;align-items:center;gap:16px;padding:30px 24px;border-radius:18px;background:rgba(2,6,23,.55);border:1px solid rgba(148,163,184,.12)}
.nx-count{font-size:64px;font-weight:800;font-variant-numeric:tabular-nums;letter-spacing:-.03em;background:linear-gradient(92deg,#67e8f9,#a5b4fc);-webkit-background-clip:text;background-clip:text;color:transparent;line-height:1}
.nx-hint{margin:0;font-size:12.5px;color:#7d8aa0;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
#counter-btn,#pg-inc,#pg-dec,#pg-reset{cursor:pointer;border:0;font:inherit}
#counter-btn{padding:13px 30px;border-radius:12px;font-size:15.5px;font-weight:700;color:#04101c;background:linear-gradient(92deg,#34e0d0,#818cf8);box-shadow:0 10px 28px rgba(52,211,238,.28);transition:transform .15s,filter .15s}
#counter-btn:hover{transform:translateY(-2px);filter:brightness(1.06)}
#counter-btn:active{transform:scale(.97)}
.nx-play{display:flex;flex-direction:column;gap:22px;padding:clamp(24px,4vw,38px);border-radius:22px;border:1px solid rgba(148,163,184,.16);background:rgba(15,23,42,.55);backdrop-filter:blur(10px)}
.nx-play-row{display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:center}
.nx-play-row button{padding:12px 22px;border-radius:11px;font-size:14.5px;font-weight:700;color:#dbe4ef;border:1px solid rgba(148,163,184,.24);background:rgba(148,163,184,.07);transition:transform .15s,background .15s}
.nx-play-row button:hover{transform:translateY(-2px);background:rgba(148,163,184,.14)}
#playground-value{font-size:58px;font-weight:800;font-variant-numeric:tabular-nums;letter-spacing:-.03em;text-align:center;background:linear-gradient(92deg,#c084fc,#818cf8 60%,#22d3ee);-webkit-background-clip:text;background-clip:text;color:transparent;line-height:1.1}
.nx-note{margin:0;text-align:center;font-size:13px;color:#7d8aa0}
.nx-pagehead{padding:clamp(46px,7vh,84px) 0 clamp(18px,3vh,30px);max-width:780px}
.nx-pagehead h1{margin:0 0 14px;font-size:clamp(34px,4.6vw,54px);font-weight:800;letter-spacing:-.04em;line-height:1.08}
.nx-pagehead p{margin:0;font-size:17px;color:#9fb0c6}
@media(max-width:860px){.nx-stats{grid-template-columns:repeat(2,1fr)}.nx-demo{grid-template-columns:1fr}}
@media(max-width:560px){.nx-links a{padding:7px 10px;font-size:13px}.nx-stats{grid-template-columns:1fr 1fr}.nx-count{font-size:52px}#playground-value{font-size:46px}}
`

function routeFiles(resolved: ResolvedScaffoldOptions): Record<string, string> {
  const extension = resolved.language === 'ts' ? 'tsx' : 'jsx'

  const homeHandlerTyped = `({ element }: { element: HTMLElement }) => {
        const next = Number(element.dataset.nxState || '0') + 1
        element.textContent = 'Count: ' + String(next)
        element.dataset.nxState = String(next)
      }`
  const homeHandlerUntyped = `({ element }) => {
        const next = Number(element.dataset.nxState || '0') + 1
        element.textContent = 'Count: ' + String(next)
        element.dataset.nxState = String(next)
      }`
  const homeHandler = resolved.language === 'ts' ? homeHandlerTyped : homeHandlerUntyped

  const playHandlerTyped = `({ element }: { element: HTMLElement }) => {
        const card = element.closest('[data-nx-counter]') as HTMLElement
        const display = card.querySelector('#playground-value') as HTMLElement
        const scope = JSON.parse(card.dataset.nxState || '{"count":0}') as { count: number }
        if (element.dataset.action === 'reset') scope.count = 0
        else scope.count += Number(element.dataset.action)
        card.dataset.nxState = JSON.stringify(scope)
        display.textContent = String(scope.count)
      }`
  const playHandlerUntyped = `({ element }) => {
        const card = element.closest('[data-nx-counter]')
        const display = card.querySelector('#playground-value')
        const scope = JSON.parse(card.dataset.nxState || '{"count":0}')
        if (element.dataset.action === 'reset') scope.count = 0
        else scope.count += Number(element.dataset.action)
        card.dataset.nxState = JSON.stringify(scope)
        display.textContent = String(scope.count)
      }`
  const playHandler = resolved.language === 'ts' ? playHandlerTyped : playHandlerUntyped

  const layoutContent =
    resolved.language === 'ts'
      ? `import type { Child } from '@mohammedaydan/core'\n\nexport interface LayoutProps {\n  children?: Child\n}\n\nexport function Layout({ children }: LayoutProps) {\n  return (\n    <div className="nx-shell">\n      <header className="nx-nav">\n        <a href="/" className="nx-brand">\n          <span className="nx-mark">N</span>\n          <span>Nexis</span>\n        </a>\n        <nav className="nx-links">\n          <a href="/">Home</a>\n          <a href="/counter">Playground</a>\n          <a href="/about">About</a>\n        </nav>\n      </header>\n      <main className="nx-main">{children}</main>\n      <footer className="nx-footer">\n        <span>Built with Nexis — HTML-first, resumable by default.</span>\n        <span>v1.0.0</span>\n      </footer>\n    </div>\n  )\n}\n`
      : `export function Layout({ children }) {\n  return (\n    <div className="nx-shell">\n      <header className="nx-nav">\n        <a href="/" className="nx-brand">\n          <span className="nx-mark">N</span>\n          <span>Nexis</span>\n        </a>\n        <nav className="nx-links">\n          <a href="/">Home</a>\n          <a href="/counter">Playground</a>\n          <a href="/about">About</a>\n        </nav>\n      </header>\n      <main className="nx-main">{children}</main>\n      <footer className="nx-footer">\n        <span>Built with Nexis — HTML-first, resumable by default.</span>\n        <span>v1.0.0</span>\n      </footer>\n    </div>\n  )\n}\n`

  const indexContent =
    resolved.language === 'ts'
      ? `import { component, useState } from '@mohammedaydan/core'\nimport { Layout } from './layout'\n\nexport const seo = {\n  title: 'Nexis — HTML-first, resumable apps',\n  description: 'A beautiful starter rendered entirely on the server, waking up only where you interact.',\n}\n\nexport default component(() => {\n  const [count] = useState(0)\n\n  return (\n    <Layout>\n      <section className="nx-hero">\n        <p id="engine-stamp" className="nx-pill">Rendered via Nexis SSR Engine</p>\n        <h1>\n          Ship the <span className="nx-grad">page</span> before the script.\n        </h1>\n        <p className="nx-lede">\n          This entire page was rendered on the server through the Nexis engine. It ships zero\n          application JavaScript — interactive boundaries wake up lazily, on your first click.\n        </p>\n        <div className="nx-cta">\n          <a className="nx-btn nx-btn-primary" href="/counter">\n            Open the playground →\n          </a>\n          <a className="nx-btn nx-btn-ghost" href="/about">\n            Why Nexis?\n          </a>\n        </div>\n      </section>\n\n      <section className="nx-stats" aria-label="Framework guarantees">\n        <div className="nx-stat"><b>0 B</b><span>Static route JavaScript</span></div>\n        <div className="nx-stat"><b>&lt; 1 KB</b><span>Resumability bootstrap</span></div>\n        <div className="nx-stat"><b>≤ 15 KB</b><span>Interactive route budget</span></div>\n        <div className="nx-stat"><b>SSG · ISR · SSR</b><span>Render modes built in</span></div>\n      </section>\n\n      <section className="nx-section">\n        <h2>A different default</h2>\n        <p className="nx-sub">Useful HTML arrives first. Fine-grained interactivity is declared, extracted, and downloaded only when someone acts on it.</p>\n        <div className="nx-grid">\n          <article className="nx-card">\n            <span className="nx-icon">⚡</span>\n            <h3>Intent-loaded events</h3>\n            <p>Mark any prop with a trailing $ — the compiler extracts it into a hashed lazy chunk wired to this exact element.</p>\n          </article>\n          <article className="nx-card">\n            <span className="nx-icon">🧩</span>\n            <h3>Signals without hydration</h3>\n            <p>Fine-grained state primitives power both server rendering and resumed handlers. No virtual DOM, no reconciliation.</p>\n          </article>\n          <article className="nx-card">\n            <span className="nx-icon">🌐</span>\n            <h3>Edge-ready contracts</h3>\n            <p>Request and response boundaries are web standards, so the same code runs on Node.js, workerd, and Deno.</p>\n          </article>\n        </div>\n      </section>\n\n      <section className="nx-section">\n        <div className="nx-demo" data-nx-state='{"count":0}'>\n          <div className="nx-demo-copy">\n            <h3>Live resumable counter</h3>\n            <p>\n              Open your network tab: nothing has loaded yet. Click once — exactly one tiny chunk\n              streams in and takes over this button.\n            </p>\n            <div className="nx-code">{'onClick$={({ element }) => { /* ships on demand */ }}'}</div>\n          </div>\n          <div className="nx-demo-panel">\n            <output id="counter-value" className="nx-count">{count()}</output>\n            <button id="counter-btn" data-nx-state="0" onClick$={${homeHandler}}>\n              Count: {count()}\n            </button>\n            <p className="nx-hint">bootstrap &lt; 1 KB gzipped · chunk loads on first click</p>\n          </div>\n        </div>\n      </section>\n    </Layout>\n  )\n})\n`
      : `import { component, useState } from '@mohammedaydan/core'\nimport { Layout } from './layout'\n\nexport const seo = {\n  title: 'Nexis — HTML-first, resumable apps',\n  description: 'A beautiful starter rendered entirely on the server, waking up only where you interact.',\n}\n\nexport default component(() => {\n  const [count] = useState(0)\n\n  return (\n    <Layout>\n      <section className="nx-hero">\n        <p id="engine-stamp" className="nx-pill">Rendered via Nexis SSR Engine</p>\n        <h1>\n          Ship the <span className="nx-grad">page</span> before the script.\n        </h1>\n        <p className="nx-lede">\n          This entire page was rendered on the server through the Nexis engine. It ships zero\n          application JavaScript — interactive boundaries wake up lazily, on your first click.\n        </p>\n        <div className="nx-cta">\n          <a className="nx-btn nx-btn-primary" href="/counter">\n            Open the playground →\n          </a>\n          <a className="nx-btn nx-btn-ghost" href="/about">\n            Why Nexis?\n          </a>\n        </div>\n      </section>\n\n      <section className="nx-stats" aria-label="Framework guarantees">\n        <div className="nx-stat"><b>0 B</b><span>Static route JavaScript</span></div>\n        <div className="nx-stat"><b>&lt; 1 KB</b><span>Resumability bootstrap</span></div>\n        <div className="nx-stat"><b>≤ 15 KB</b><span>Interactive route budget</span></div>\n        <div className="nx-stat"><b>SSG · ISR · SSR</b><span>Render modes built in</span></div>\n      </section>\n\n      <section className="nx-section">\n        <h2>A different default</h2>\n        <p className="nx-sub">Useful HTML arrives first. Fine-grained interactivity is declared, extracted, and downloaded only when someone acts on it.</p>\n        <div className="nx-grid">\n          <article className="nx-card">\n            <span className="nx-icon">⚡</span>\n            <h3>Intent-loaded events</h3>\n            <p>Mark any prop with a trailing $ — the compiler extracts it into a hashed lazy chunk wired to this exact element.</p>\n          </article>\n          <article className="nx-card">\n            <span className="nx-icon">🧩</span>\n            <h3>Signals without hydration</h3>\n            <p>Fine-grained state primitives power both server rendering and resumed handlers. No virtual DOM, no reconciliation.</p>\n          </article>\n          <article className="nx-card">\n            <span className="nx-icon">🌐</span>\n            <h3>Edge-ready contracts</h3>\n            <p>Request and response boundaries are web standards, so the same code runs on Node.js, workerd, and Deno.</p>\n          </article>\n        </div>\n      </section>\n\n      <section className="nx-section">\n        <div className="nx-demo" data-nx-state='{"count":0}'>\n          <div className="nx-demo-copy">\n            <h3>Live resumable counter</h3>\n            <p>\n              Open your network tab: nothing has loaded yet. Click once — exactly one tiny chunk\n              streams in and takes over this button.\n            </p>\n            <div className="nx-code">{'onClick$={({ element }) => { /* ships on demand */ }}'}</div>\n          </div>\n          <div className="nx-demo-panel">\n            <output id="counter-value" className="nx-count">{count()}</output>\n            <button id="counter-btn" data-nx-state="0" onClick$={${homeHandler}}>\n              Count: {count()}\n            </button>\n            <p className="nx-hint">bootstrap &lt; 1 KB gzipped · chunk loads on first click</p>\n          </div>\n        </div>\n      </section>\n    </Layout>\n  )\n})\n`

  const counterContent =
    resolved.language === 'ts'
      ? `import { component, computed } from '@mohammedaydan/core'\nimport { Layout } from './layout'\n\nexport const seo = {\n  title: 'Playground — Nexis',\n  description: 'Three buttons, one shared scope, zero hydration.',\n}\n\nconst start = 12\nconst greeting = computed(() => 'Shared scope starts at ' + start)\n\nexport default component(() => {\n  return (\n    <Layout>\n      <div className="nx-pagehead">\n        <h1>Scope playground</h1>\n        <p>{greeting.value}. Every button below reads and writes the SAME serialized scope — no store, no hydration, no duplication.</p>\n      </div>\n      <div className="nx-play" data-nx-counter data-nx-state='{"count":12}'>\n        <output id="playground-value">12</output>\n        <div className="nx-play-row">\n          <button id="pg-dec" data-action="-1" onClick$={${playHandler}}>-1 Subtract</button>\n          <button id="pg-inc" data-action="1" onClick$={${playHandler}}>+1 Add</button>\n          <button id="pg-reset" data-action="reset" onClick$={${playHandler}}>Reset</button>\n        </div>\n        <p className="nx-note">State lives in data-nx-state on this card — inspect it after clicking.</p>\n      </div>\n    </Layout>\n  )\n})\n`
      : `import { component, computed } from '@mohammedaydan/core'\nimport { Layout } from './layout'\n\nexport const seo = {\n  title: 'Playground — Nexis',\n  description: 'Three buttons, one shared scope, zero hydration.',\n}\n\nconst start = 12\nconst greeting = computed(() => 'Shared scope starts at ' + start)\n\nexport default component(() => {\n  return (\n    <Layout>\n      <div className="nx-pagehead">\n        <h1>Scope playground</h1>\n        <p>{greeting.value}. Every button below reads and writes the SAME serialized scope — no store, no hydration, no duplication.</p>\n      </div>\n      <div className="nx-play" data-nx-counter data-nx-state='{"count":12}'>\n        <output id="playground-value">12</output>\n        <div className="nx-play-row">\n          <button id="pg-dec" data-action="-1" onClick$={${playHandler}}>-1 Subtract</button>\n          <button id="pg-inc" data-action="1" onClick$={${playHandler}}>+1 Add</button>\n          <button id="pg-reset" data-action="reset" onClick$={${playHandler}}>Reset</button>\n        </div>\n        <p className="nx-note">State lives in data-nx-state on this card — inspect it after clicking.</p>\n      </div>\n    </Layout>\n  )\n})\n`

  const aboutContent =
    resolved.language === 'ts'
      ? `import { component } from '@mohammedaydan/core'\nimport { Layout } from './layout'\n\nexport const seo = {\n  title: 'About — Nexis',\n  description: 'Why HTML-first resumability beats shipping a runtime.',\n}\n\nexport default component(() => {\n  return (\n    <Layout>\n      <div className="nx-pagehead">\n        <h1>Why Nexis?</h1>\n        <p>This page ships 0 bytes of application JavaScript. Run \`nexis analyze\` to verify it yourself.</p>\n      </div>\n      <section className="nx-section" style="padding-top:8px">\n        <div className="nx-grid">\n          <article className="nx-card">\n            <span className="nx-icon">📄</span>\n            <h3>HTML is the program</h3>\n            <p>The server executes your component once and streams finished markup. There is no client tree to reconstruct before a page becomes readable.</p>\n          </article>\n          <article className="nx-card">\n            <span className="nx-icon">🔗</span>\n            <h3>Serialized, not hydrated</h3>\n            <p>Interactive boundaries serialize their state into data attributes. The browser resumes exactly where the server left off — per element, on demand.</p>\n          </article>\n          <article className="nx-card">\n            <span className="nx-icon">🚀</span>\n            <h3>Budgets, not vibes</h3>\n            <p>0 bytes for static routes, under 15 KB gzipped for interactive ones, and a sub-kilobyte bootstrap — enforced by \`nexis check --budget\` on every build.</p>\n          </article>\n        </div>\n      </section>\n    </Layout>\n  )\n})\n`
      : `import { component } from '@mohammedaydan/core'\nimport { Layout } from './layout'\n\nexport const seo = {\n  title: 'About — Nexis',\n  description: 'Why HTML-first resumability beats shipping a runtime.',\n}\n\nexport default component(() => {\n  return (\n    <Layout>\n      <div className="nx-pagehead">\n        <h1>Why Nexis?</h1>\n        <p>This page ships 0 bytes of application JavaScript. Run \`nexis analyze\` to verify it yourself.</p>\n      </div>\n      <section className="nx-section" style="padding-top:8px">\n        <div className="nx-grid">\n          <article className="nx-card">\n            <span className="nx-icon">📄</span>\n            <h3>HTML is the program</h3>\n            <p>The server executes your component once and streams finished markup. There is no client tree to reconstruct before a page becomes readable.</p>\n          </article>\n          <article className="nx-card">\n            <span className="nx-icon">🔗</span>\n            <h3>Serialized, not hydrated</h3>\n            <p>Interactive boundaries serialize their state into data attributes. The browser resumes exactly where the server left off — per element, on demand.</p>\n          </article>\n          <article className="nx-card">\n            <span className="nx-icon">🚀</span>\n            <h3>Budgets, not vibes</h3>\n            <p>0 bytes for static routes, under 15 KB gzipped for interactive ones, and a sub-kilobyte bootstrap — enforced by \`nexis check --budget\` on every build.</p>\n          </article>\n        </div>\n      </section>\n    </Layout>\n  )\n})\n`

  return {
    [`src/routes/layout.${extension}`]: layoutContent,
    [`src/routes/index.${extension}`]: indexContent,
    [`src/routes/counter.${extension}`]: counterContent,
    [`src/routes/about.${extension}`]: aboutContent,
    'src/shared/types.ts': `export interface AppMetadata {\n  readonly title: string\n  readonly description?: string\n}\n`,
  }
}

export async function scaffoldProject(
  name: string,
  parent: string,
  options: ScaffoldOptions = {},
): Promise<{ readonly directory: string; readonly options: ResolvedScaffoldOptions }> {
  assertScaffoldProjectName(name)
  const directory = resolve(parent, name)
  const parentDirectory = resolve(parent)
  if (!isContainedPath(parentDirectory, directory))
    throw new TypeError('Project directory must be contained by the selected parent directory.')

  let entries: string[] = []
  try {
    entries = await readdir(directory)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  if (entries.length > 0) throw new Error(`Directory is not empty: ${directory}`)

  const resolved = await promptOptions(options)
  const frameworkRoot = await findFrameworkRoot(parent)
  const shellHtml = resolved.tailwind
    ? LANDING_HTML.replace(
        '<link rel="stylesheet" href="/styles.css" />',
        '<link rel="stylesheet" href="/styles.css" />\n    <link rel="stylesheet" href="/src/styles.css" />',
      )
    : LANDING_HTML
  const files: Record<string, string> = {
    'package.json': packageJson(name, resolved, directory, frameworkRoot),
    'index.html': shellHtml,
    'tsconfig.json': tsconfig(resolved),
    'README.md': frameworkRoot
      ? `# ${name}\n\nCreated from a local Nexis workspace. Run \`pnpm install\`, then \`pnpm dev\`.\n`
      : `# ${name}\n\nCreated with Nexis from GitHub Packages. Configure a GitHub token with \`read:packages\`, then run \`pnpm install\` and \`pnpm dev\`.\n`,
    'public/favicon.ico': '',
    'public/styles.css': DESIGN_CSS,
    ...routeFiles(resolved),
  }
  if (!frameworkRoot) {
    files['.npmrc'] = '@mohammedaydan:registry=https://npm.pkg.github.com\n'
  }
  if (frameworkRoot) {
    const packagesDirectory = relative(directory, join(frameworkRoot, 'packages')).replace(
      /\\/g,
      '/',
    )
    files['pnpm-workspace.yaml'] =
      `packages:\n  - "."\n  - "${packagesDirectory}/*"\ndisableSelfInstall: true\nstrictPeerDependencies: true\nonlyBuiltDependencies:\n  - esbuild\n  - sharp\nallowBuilds:\n  esbuild: true\n  sharp: true\n`
  }
  if (resolved.tailwind) {
    files['src/styles.css'] =
      '@import "tailwindcss";\n\n@theme {\n  --font-sans: Inter, ui-sans-serif, system-ui, sans-serif;\n}\n'
    files['vite.config.ts'] =
      `import tailwindcss from '@tailwindcss/vite'\nimport { defineConfig } from 'vite'\n\nexport default defineConfig({\n  plugins: [tailwindcss()],\n})\n`
    files['.vscode/extensions.json'] =
      `${JSON.stringify({ recommendations: ['bradlc.vscode-tailwindcss'] }, null, 2)}\n`
    files['.vscode/settings.json'] = `${JSON.stringify(
      {
        'tailwindCSS.experimental.classRegex': [
          ['\\b(?:cx|cn)\\(([^)]*)\\)', '(?:\'|\\\"|`)([^\'\\\"`]*)(?:\'|\\\"|`)'],
        ],
        'tailwindCSS.includeLanguages': { typescriptreact: 'html', javascriptreact: 'html' },
      },
      null,
      2,
    )}\n`
  }
  await mkdir(directory, { recursive: true })
  for (const [file, content] of Object.entries(files)) {
    const destination = resolve(directory, file)
    if (!isContainedPath(directory, destination))
      throw new TypeError(`Refusing to write outside scaffold directory: ${file}`)
    await mkdir(dirname(destination), { recursive: true })
    await writeFile(destination, content, { encoding: 'utf8', flag: 'wx' })
  }
  return { directory: join(directory), options: resolved }
}
