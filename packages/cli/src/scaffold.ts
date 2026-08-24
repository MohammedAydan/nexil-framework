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
  const devDependencies: Record<string, string> = { typescript: '^5.8.0' }
  if (resolved.tailwind) devDependencies.tailwindcss = '^4.1.0'
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
        '@mohammedaydan/cli': dependency('cli', '^2.0.0'),
        '@mohammedaydan/core': dependency('core', '^2.0.0'),
        '@mohammedaydan/media': dependency('media', '^2.0.0'),
        '@mohammedaydan/reactivity': dependency('reactivity', '^2.0.0'),
        '@mohammedaydan/seo': dependency('seo', '^2.0.0'),
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
      jsxImportSource: '@mohammedaydan/core',
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

const LANDING_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="Build fast, resilient interfaces with Nexis." />
    <title>Nexis — HTML-first web apps</title>
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body>
    <div class="route-trace" aria-hidden="true"><span>route /</span><span>mode static</span><span>client 0b</span></div>
    <header class="site-header">
      <a class="wordmark" href="/" aria-label="Nexis home"><span class="wordmark-mark">N</span><span>Nexis</span></a>
      <nav aria-label="Main navigation"><a href="#principles">Principles</a><a href="#modes">Modes</a><a href="#start">Start building</a></nav>
      <a class="header-link" href="https://github.com/MohammedAydan/nexis-framework">GitHub ↗</a>
    </header>
    <main>
      <section class="hero shell">
        <div class="hero-copy">
          <p class="eyebrow"><span class="pulse"></span> Framework / v2.0</p>
          <h1>Ship the <em>page</em> before the script.</h1>
          <p class="hero-lede">Nexis is an HTML-first TypeScript framework for interfaces that arrive useful, stay fast, and wake up only where a person touches them.</p>
          <div class="hero-actions"><a class="button button-primary" href="#start">Build your first route <span>→</span></a><a class="text-link" href="https://github.com/MohammedAydan/nexis-framework">Read the source ↗</a></div>
          <div class="promise-row"><span>0 JS on static routes</span><span>≤15 KB interactive</span><span>&lt;1 KB bootstrap</span></div>
        </div>
        <div class="hero-console" aria-label="Nexis route output preview">
          <div class="console-bar"><span class="console-dot coral"></span><span class="console-dot blue"></span><span class="console-dot green"></span><span class="console-title">route-output</span><span class="console-status">verified</span></div>
          <div class="console-body"><div class="console-line muted">01 <span>export const render = { mode: 'static' }</span></div><div class="console-line">02 <span class="syntax-blue">&lt;main&gt;</span></div><div class="console-line indent">03 <span class="syntax-ice">&lt;h1&gt;</span>Useful HTML first<span class="syntax-ice">&lt;/h1&gt;</span></div><div class="console-line">04 <span class="syntax-blue">&lt;/main&gt;</span></div><div class="console-line gap">05</div><div class="console-line result">06 <strong>✓ emitted</strong> server/index.html</div><div class="console-line result">07 <strong>✓ omitted</strong> client JavaScript</div><div class="console-line result">08 <strong>✓ ready</strong> for progressive enhancement</div></div>
          <div class="console-footer"><span>render/static</span><span>cache: public, immutable</span></div>
        </div>
      </section>
      <section class="signal-band shell" aria-label="Nexis performance signals"><span class="signal-label">The signal</span><span class="signal-value">HTML at the edge</span><span class="signal-rule"></span><span class="signal-note">Useful before hydration. Interactive after intent.</span></section>
      <section class="principles shell" id="principles"><div class="section-intro"><p class="eyebrow">A different default</p><h2>Quiet HTML.<br /><span>Loud performance.</span></h2></div><div class="principle-grid"><article><span class="index-mark">A</span><h3>Server-shaped</h3><p>Routes render to real HTML. There is no client-side tree to reconcile before someone can read the page.</p></article><article><span class="index-mark">B</span><h3>Intent-loaded</h3><p>Mark an interaction with <code>onClick$</code>. Nexis extracts its handler and waits until the interaction is real.</p></article><article><span class="index-mark">C</span><h3>Edge-ready</h3><p>Request and response boundaries use Web Standard primitives, from Node to workerd and Deno.</p></article></div></section>
      <section class="modes shell" id="modes"><div class="mode-heading"><p class="eyebrow">One route, four tempos</p><h2>Choose the cache<br /><span>your content deserves.</span></h2></div><div class="mode-list"><div><span>01</span><strong>SSG</strong><p>Immutable HTML for content that does not need a request.</p><b>public, immutable</b></div><div><span>02</span><strong>ISR</strong><p>Freshness with a bounded regeneration window.</p><b>s-maxage / revalidate</b></div><div><span>03</span><strong>SSR</strong><p>Request-time output for private or personal data.</p><b>private, no-store</b></div><div><span>04</span><strong>PPR</strong><p>A public shell with partial output where it matters.</p><b>public, max-age=0</b></div></div></section>
      <section class="start shell" id="start"><div><p class="eyebrow">Start with the real thing</p><h2>A small route tree.<br /><span>A serious baseline.</span></h2><p>Scaffold a landing page, inspect the output, then add interaction one boundary at a time.</p></div><div class="install-card"><div class="install-label">terminal / first light</div><code><span class="prompt">$</span> pnpm dlx @mohammedaydan/create-nexis my-app --yes</code><code><span class="prompt">$</span> cd my-app && pnpm dev</code><a class="button button-primary" href="https://github.com/MohammedAydan/nexis-framework">Open Nexis on GitHub <span>↗</span></a></div></section>
    </main>
    <footer class="site-footer shell"><span>© Nexis framework</span><span>HTML-first by design.</span><span>Built for the next request.</span></footer>
    <script type="module" src="/nexis-bootstrap.js"></script>
  </body>
</html>
`

const LANDING_CSS = `:root{--ink:#0b1020;--ink-soft:#536078;--paper:#f5f7fb;--blue:#5d7cff;--blue-deep:#293fb7;--coral:#ff806d;--line:#dbe1ed;--white:#fff;--mono:"SFMono-Regular",Consolas,"Liberation Mono",monospace;--sans:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--sans);font-size:16px;line-height:1.5}.shell{width:min(1180px,calc(100% - 48px));margin-inline:auto}.route-trace{display:flex;gap:24px;padding:10px 24px;background:var(--ink);color:#a8b5d4;font:11px var(--mono);letter-spacing:.08em;text-transform:uppercase}.site-header{width:min(1180px,calc(100% - 48px));margin:auto;display:flex;align-items:center;justify-content:space-between;height:84px}.wordmark{display:flex;align-items:center;gap:10px;color:var(--ink);font-size:21px;font-weight:800;letter-spacing:-.05em;text-decoration:none}.wordmark-mark{display:grid;place-items:center;width:28px;height:28px;background:var(--blue);color:var(--white);font:800 17px var(--mono);transform:rotate(-8deg)}nav{display:flex;gap:30px}nav a,.header-link,.text-link{color:var(--ink-soft);font-size:13px;text-decoration:none}nav a:hover,.header-link:hover,.text-link:hover{color:var(--blue-deep)}.header-link{font-weight:700;color:var(--ink)}.hero{display:grid;grid-template-columns:1.02fr .98fr;gap:82px;align-items:center;padding:92px 0 110px}.eyebrow{display:flex;align-items:center;gap:9px;margin:0 0 21px;color:var(--blue-deep);font:700 11px var(--mono);letter-spacing:.15em;text-transform:uppercase}.pulse{width:7px;height:7px;background:var(--coral);box-shadow:0 0 0 5px #ff806d2b;border-radius:50%}.hero h1{max-width:620px;margin:0;font-size:clamp(56px,7vw,94px);font-weight:800;letter-spacing:-.09em;line-height:.94}.hero h1 em{color:var(--blue);font-style:normal}.hero-lede{max-width:500px;margin:28px 0 32px;color:var(--ink-soft);font-size:19px;line-height:1.55}.hero-actions{display:flex;align-items:center;gap:24px}.button{display:inline-flex;align-items:center;gap:26px;padding:14px 18px;border:1px solid transparent;font-size:13px;font-weight:800;text-decoration:none}.button-primary{background:var(--ink);color:var(--white);box-shadow:5px 5px 0 var(--blue)}.button-primary:hover{background:var(--blue-deep);transform:translate(-1px,-1px)}.promise-row{display:flex;flex-wrap:wrap;gap:12px 23px;margin-top:44px;color:var(--ink-soft);font:11px var(--mono)}.promise-row span{position:relative}.promise-row span:not(:last-child)::after{content:"/";position:absolute;right:-15px;color:#a8b1c3}.hero-console{position:relative;background:var(--ink);color:#dfe7ff;box-shadow:18px 18px 0 #dce3f0}.hero-console::before{content:"";position:absolute;inset:-18px 18px 18px -18px;border:1px solid var(--blue);z-index:-1}.console-bar,.console-footer{display:flex;align-items:center;gap:7px;padding:15px 18px;border-bottom:1px solid #2b3550;color:#8794b6;font:10px var(--mono)}.console-dot{width:7px;height:7px;border-radius:50%}.coral{background:var(--coral)}.blue{background:#6d8cff}.green{background:#6ee7a1}.console-title{margin-left:8px}.console-status{margin-left:auto;color:#6ee7a1}.console-body{padding:25px 22px 31px;font:13px/2 var(--mono)}.console-line{white-space:nowrap}.console-line::first-letter{color:#687695}.console-line span{color:#c8d2ee}.console-line.muted,.console-line.muted span{color:#7783a3}.console-line.indent{padding-left:26px}.console-line.gap{height:18px}.syntax-blue{color:#80a0ff!important}.syntax-ice{color:#b9e1ff!important}.result strong{color:#6ee7a1;font-weight:500}.console-footer{justify-content:space-between;border-top:1px solid #2b3550;border-bottom:0;padding-block:12px}.signal-band{display:flex;align-items:center;gap:22px;padding:22px 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line);font:12px var(--mono)}.signal-label{color:var(--blue-deep);font-weight:800;text-transform:uppercase;letter-spacing:.12em}.signal-value{font-weight:800}.signal-rule{height:1px;flex:1;background:var(--line)}.signal-note{color:var(--ink-soft)}.principles{display:grid;grid-template-columns:.75fr 1.25fr;gap:70px;padding:150px 0}.section-intro h2,.mode-heading h2,.start h2{margin:0;font-size:clamp(40px,5vw,66px);letter-spacing:-.075em;line-height:.98}.section-intro h2 span,.mode-heading h2 span,.start h2 span{color:var(--blue)}.principle-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:30px;padding-top:45px}.principle-grid article{border-top:2px solid var(--ink);padding-top:18px}.index-mark{display:block;margin-bottom:54px;color:var(--coral);font:700 12px var(--mono)}h3{margin:0 0 12px;font-size:18px;letter-spacing:-.03em}.principle-grid p,.start>div>p:last-child{margin:0;color:var(--ink-soft);font-size:14px}.principle-grid code{color:var(--blue-deep);font:12px var(--mono)}.modes{padding:0 0 150px}.mode-heading{display:flex;justify-content:space-between;align-items:end;border-bottom:1px solid var(--line);padding-bottom:55px}.mode-list{display:grid;grid-template-columns:repeat(4,1fr)}.mode-list>div{min-height:235px;padding:24px 22px 20px;border-right:1px solid var(--line)}.mode-list>div:first-child{border-left:1px solid var(--line)}.mode-list span{display:block;color:var(--coral);font:11px var(--mono)}.mode-list strong{display:block;margin:38px 0 11px;font-size:22px}.mode-list p{min-height:65px;margin:0;color:var(--ink-soft);font-size:13px}.mode-list b{display:block;color:var(--blue-deep);font:10px var(--mono);font-weight:500}.start{display:grid;grid-template-columns:1fr 1fr;gap:70px;align-items:end;padding:85px 0;border-top:1px solid var(--line)}.start>div>p:last-child{max-width:400px;margin-top:24px}.install-card{padding:25px;background:var(--ink);color:var(--white);box-shadow:12px 12px 0 var(--coral)}.install-label{margin-bottom:25px;color:#9ba8c5;font:10px var(--mono);letter-spacing:.12em;text-transform:uppercase}.install-card code{display:block;margin:10px 0;color:#d9e4ff;font:13px var(--mono)}.prompt{color:#6ee7a1}.install-card .button{margin-top:25px}.site-footer{display:flex;justify-content:space-between;padding:28px 0;color:var(--ink-soft);font:10px var(--mono);text-transform:uppercase;letter-spacing:.08em}@media (max-width:850px){nav{display:none}.hero,.principles,.start{grid-template-columns:1fr;gap:55px}.hero{padding-top:65px}.hero-console{max-width:650px}.principles{padding:95px 0}.mode-heading{display:block;padding-bottom:35px}.mode-list{grid-template-columns:repeat(2,1fr)}.mode-list>div:nth-child(3){border-left:1px solid var(--line);border-top:1px solid var(--line)}.mode-list>div:nth-child(4){border-top:1px solid var(--line)}.site-footer{gap:12px;flex-wrap:wrap}.signal-band{flex-wrap:wrap}.signal-rule{display:none}}@media (max-width:520px){.shell,.site-header{width:calc(100% - 32px)}.route-trace{padding-inline:16px;gap:12px;font-size:9px}.route-trace span:last-child{display:none}.hero h1{font-size:54px}.hero-actions{align-items:flex-start;flex-direction:column}.promise-row{line-height:1.8}.hero-console{box-shadow:9px 9px 0 #dce3f0}.hero-console::before{inset:-9px 9px 9px -9px}.console-body{padding-inline:13px;font-size:10px}.console-line{white-space:normal}.principle-grid{grid-template-columns:1fr;gap:35px}.index-mark{margin-bottom:20px}.mode-list{grid-template-columns:1fr}.mode-list>div{border-left:1px solid var(--line)!important;border-top:1px solid var(--line)}.mode-list>div:first-child{border-top:0}.site-footer{font-size:9px}}
`

function routeFiles(resolved: ResolvedScaffoldOptions): Record<string, string> {
  const extension = resolved.language === 'ts' ? 'tsx' : 'jsx'
  const typedHandler = `({ element }: { element: HTMLElement }) => {
        const next = Number(element.textContent || '0') + 1
        element.textContent = String(next)
        element.dataset.nxState = String(next)
      }`
  const untypedHandler = `({ element }) => {
        const next = Number(element.textContent || '0') + 1
        element.textContent = String(next)
        element.dataset.nxState = String(next)
      }`
  const counterHandler = resolved.language === 'ts' ? typedHandler : untypedHandler
  return {
    [`src/routes/layout.${extension}`]:
      resolved.language === 'ts'
        ? `export default function Layout({ children }: { children?: unknown }) {\n  return <>{children}</>\n}\n`
        : `export default function Layout({ children }) {\n  return <>{children}</>\n}\n`,
    [`src/routes/index.${extension}`]: `export const seo = { title: 'Nexis — HTML-first web apps', description: 'Build fast, resilient interfaces with Nexis.' }\n\nexport default async function HomePage() {\n  return <main><p>Framework / v2.0</p><h1>Ship the page before the script.</h1><p>Nexis is an HTML-first TypeScript framework for interfaces that arrive useful, stay fast, and wake up only where a person touches them.</p><a href="/counter">Try the resumable counter →</a></main>\n}\n`,
    [`src/routes/counter.${extension}`]:
      resolved.language === 'ts'
        ? `// Interactive route: the onClick$ expression is extracted into a lazily\n// loaded chunk. The page ships zero application JavaScript until first click.\nexport default function CounterPage() {\n  return (\n    <main>\n      <h1>Resumable counter</h1>\n      <button data-nx-state="0" onClick$={${counterHandler}}>\n        0\n      </button>\n    </main>\n  )\n}\n`
        : `// Interactive route: the onClick$ expression is extracted into a lazily\n// loaded chunk. The page ships zero application JavaScript until first click.\nexport default function CounterPage() {\n  return (\n    <main>\n      <h1>Resumable counter</h1>\n      <button data-nx-state="0" onClick$={${counterHandler}}>\n        0\n      </button>\n    </main>\n  )\n}\n`,
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
  const files: Record<string, string> = {
    'package.json': packageJson(name, resolved, directory, frameworkRoot),
    'index.html': LANDING_HTML,
    'tsconfig.json': tsconfig(resolved),
    'README.md': frameworkRoot
      ? `# ${name}\n\nCreated from a local Nexis workspace. Run \`pnpm install\`, then \`pnpm dev\`.\n`
      : `# ${name}\n\nCreated with Nexis from GitHub Packages. Configure a GitHub token with \`read:packages\`, then run \`pnpm install\` and \`pnpm dev\`.\n`,
    'public/favicon.ico': '',
    'public/styles.css': LANDING_CSS,
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
    files['src/styles.css'] = '@import "tailwindcss";\n'
    files['tailwind.config.js'] = 'export default { content: ["./src/**/*.{ts,tsx,js,jsx}"] }\n'
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
