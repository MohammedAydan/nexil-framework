import { gzipSync } from 'node:zlib'
import { existsSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, extname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import * as esbuild from 'esbuild'
import { build, createServer, transformWithEsbuild } from 'vite'
import { createRequestContext, runWithScope, type Child, type ComponentContext } from '@nexil/core'
import { __clearAccessedStoreIds, __getStoresScriptTag } from '@nexil/core'
import { assertBudget } from '@nexil/vite-plugin'
import nexil, {
  externalizeScopeAttributes,
  RESUMABILITY_BINDINGS_EXTERNAL,
  RESUMABILITY_BOOTSTRAP_EXTERNAL,
  RESUMABILITY_FORMS,
  transformNexilSource,
} from '@nexil/vite-plugin'
import type { ExternalScopePayload } from '@nexil/vite-plugin'
import { escapeHtml, renderToString } from '@nexil/core/server'
import { generateOgImage } from '@nexil/core'
import { buildImageVariants, imageVariantFileBase } from '@nexil/core'
import {
  buildRobots,
  buildSitemap,
  deriveBreadcrumbList,
  generateAtomFeed,
  generateFeed,
  renderHead,
  withCanonical,
} from '@nexil/core'
import { matchRoute, NEXIL_NAVIGATION_RUNTIME, routeFromFile } from '@nexil/core/router'
import { nexilSSRPlugin } from './dev-server.js'
import { createServer as createProductionServer } from './serve.js'
import type { NexilConfig, RedirectRule } from './serve.js'
import type { SeoMetadata } from '@nexil/core'
import { parseScaffoldArgs, scaffoldProject } from './scaffold.js'
export { parseScaffoldArgs, scaffoldProject } from './scaffold.js'

const FRAMEWORK_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

function workspaceAliases(): readonly {
  readonly find: string | RegExp
  readonly replacement: string
}[] {
  if (!existsSync(join(FRAMEWORK_ROOT, 'pnpm-workspace.yaml'))) return []
  const nexilSrc = join(FRAMEWORK_ROOT, 'packages/nexil/src')
  const vitePluginSrc = join(FRAMEWORK_ROOT, 'packages/vite-plugin/src')
  return [
    // @nexil/core subpaths – use exact strings for subpaths (prefix match is fine here)
    {
      find: '@nexil/core/jsx-runtime/jsx-dev-runtime',
      replacement: join(nexilSrc, 'jsx-runtime/jsx-runtime.ts'),
    },
    {
      find: '@nexil/core/jsx-runtime/jsx-runtime',
      replacement: join(nexilSrc, 'jsx-runtime/jsx-runtime.ts'),
    },
    {
      find: '@nexil/core/jsx-dev-runtime',
      replacement: join(nexilSrc, 'jsx-runtime/jsx-runtime.ts'),
    },
    { find: '@nexil/core/jsx-runtime', replacement: join(nexilSrc, 'jsx-runtime/index.ts') },
    { find: '@nexil/core/client', replacement: join(nexilSrc, 'client/index.ts') },
    { find: '@nexil/core/server', replacement: join(nexilSrc, 'server/index.ts') },
    { find: '@nexil/core/router', replacement: join(nexilSrc, 'router/index.ts') },
    { find: /^@nexil\/core$/, replacement: join(nexilSrc, 'index.ts') },
    // Legacy @nexil/nexil aliases (kept for backward compat)
    {
      find: '@nexil/nexil/jsx-runtime/jsx-dev-runtime',
      replacement: join(nexilSrc, 'jsx-runtime/jsx-runtime.ts'),
    },
    {
      find: '@nexil/nexil/jsx-runtime/jsx-runtime',
      replacement: join(nexilSrc, 'jsx-runtime/jsx-runtime.ts'),
    },
    {
      find: '@nexil/nexil/jsx-dev-runtime',
      replacement: join(nexilSrc, 'jsx-runtime/jsx-runtime.ts'),
    },
    { find: '@nexil/nexil/jsx-runtime', replacement: join(nexilSrc, 'jsx-runtime/index.ts') },
    { find: '@nexil/nexil/client', replacement: join(nexilSrc, 'client/index.ts') },
    { find: '@nexil/nexil/server', replacement: join(nexilSrc, 'server/index.ts') },
    { find: '@nexil/nexil/router', replacement: join(nexilSrc, 'router/index.ts') },
    // Use RegExp for exact match on the bare package to avoid prefix mis-match
    { find: /^@nexil\/nexil$/, replacement: join(nexilSrc, 'index.ts') },
    // Legacy micro-package aliases consolidated into @nexil/core
    { find: '@nexil/state', replacement: join(nexilSrc, 'index.ts') },
    { find: '@nexil/reactivity', replacement: join(nexilSrc, 'core/reactivity.ts') },
    { find: '@nexil/client', replacement: join(nexilSrc, 'client/index.ts') },
    { find: '@nexil/server', replacement: join(nexilSrc, 'server/index.ts') },
    { find: '@nexil/router', replacement: join(nexilSrc, 'router/index.ts') },
    { find: '@nexil/actions', replacement: join(nexilSrc, 'server/actions.ts') },
    { find: /^@nexil\/state$/, replacement: join(nexilSrc, 'index.ts') },
    { find: /^@nexil\/reactivity$/, replacement: join(nexilSrc, 'core/reactivity.ts') },
    // Legacy nexil/* aliases (kept for backward compat with user source still importing 'nexil')
    {
      find: 'nexil/jsx-runtime/jsx-dev-runtime',
      replacement: join(nexilSrc, 'jsx-runtime/jsx-runtime.ts'),
    },
    {
      find: 'nexil/jsx-runtime/jsx-runtime',
      replacement: join(nexilSrc, 'jsx-runtime/jsx-runtime.ts'),
    },
    { find: 'nexil/jsx-dev-runtime', replacement: join(nexilSrc, 'jsx-runtime/jsx-runtime.ts') },
    { find: 'nexil/jsx-runtime', replacement: join(nexilSrc, 'jsx-runtime/index.ts') },
    { find: 'nexil/client', replacement: join(nexilSrc, 'client/index.ts') },
    { find: 'nexil/server', replacement: join(nexilSrc, 'server/index.ts') },
    { find: 'nexil/router', replacement: join(nexilSrc, 'router/index.ts') },
    { find: '@nexil/vite-plugin', replacement: join(vitePluginSrc, 'index.ts') },
    { find: /^nexil$/, replacement: join(nexilSrc, 'index.ts') },
  ]
}

const VITE_WORKSPACE_CONFIG = { resolve: { alias: workspaceAliases() } }

interface BuildOutputEntry {
  readonly type: 'asset' | 'chunk'
  readonly fileName: string
  readonly source?: string | Uint8Array
  readonly code?: string
  readonly isEntry?: boolean
}

interface RouteModule {
  readonly default?:
    | Child
    | ((
        props: Readonly<Record<string, unknown>>,
        context?: ComponentContext,
      ) => Child | Promise<Child>)
  readonly seo?: SeoMetadata | ((context: { readonly pathname: string }) => SeoMetadata)
  readonly metadata?: Partial<SeoMetadata>
  readonly render?: { readonly mode?: string }
  readonly getStaticPaths?: () => Promise<readonly StaticPathValue[]> | readonly StaticPathValue[]
  readonly staticPaths?: readonly StaticPathValue[]
}

function buildOutputEntries(value: unknown): readonly BuildOutputEntry[] {
  const outputs = Array.isArray(value) ? value : [value]
  return outputs.flatMap((output) => {
    if (!output || typeof output !== 'object') return []
    const rawEntries = (output as { readonly output?: unknown }).output
    if (!Array.isArray(rawEntries)) return []
    return rawEntries.flatMap((entry): readonly BuildOutputEntry[] => {
      if (!entry || typeof entry !== 'object') return []
      const record = entry as Record<string, unknown>
      if (
        (record.type !== 'asset' && record.type !== 'chunk') ||
        typeof record.fileName !== 'string'
      )
        return []
      return [
        {
          type: record.type,
          fileName: record.fileName,
          ...(typeof record.source === 'string' || record.source instanceof Uint8Array
            ? { source: record.source }
            : {}),
          ...(typeof record.code === 'string' ? { code: record.code } : {}),
          ...(typeof record.isEntry === 'boolean' ? { isEntry: record.isEntry } : {}),
        },
      ]
    })
  })
}

export type NexilCommand =
  | 'create'
  | 'dev'
  | 'build'
  | 'start'
  | 'preview'
  | 'serve'
  | 'check'
  | 'analyze'
  | 'routes'
  | 'generate'
  | 'add'
  | 'doctor'
  | 'upgrade'
  | 'test'

export interface ParsedCommand {
  readonly command: NexilCommand | 'help'
  readonly args: readonly string[]
}

export type DoctorLevel = 'ok' | 'warn' | 'error'

export interface DoctorCheck {
  readonly code: string
  readonly level: DoctorLevel
  readonly message: string
}

export interface DoctorReport {
  readonly version: 1
  readonly root: string
  readonly status: DoctorLevel
  readonly checks: readonly DoctorCheck[]
}

const commands = new Set<NexilCommand>([
  'create',
  'dev',
  'build',
  'start',
  'preview',
  'serve',
  'check',
  'analyze',
  'routes',
  'generate',
  'add',
  'doctor',
  'upgrade',
  'test',
])

export function parseCommand(argv: readonly string[]): ParsedCommand {
  const [first, ...args] = argv
  if (!first || first === '--help' || first === '-h') return { command: 'help', args }
  // Alias: `nexil g` → `nexil generate`
  if (first === 'g') return { command: 'generate' as NexilCommand, args }
  if (!commands.has(first as NexilCommand))
    throw new Error(`Unknown Nexil command: ${first}. Run nexil --help.`)
  return { command: first as NexilCommand, args }
}

export function helpText(): string {
  return [
    'Nexil — HTML-first TypeScript framework',
    '',
    'Usage: nexil <command>',
    '',
    'Commands:',
    '  create <name>  Create a zero-config Nexil application',
    '                 Flags: --yes --ts --js --tailwind --template minimal|interactive|secure-node',
    '  dev            Start the development server',
    '                 Env: NEXIL_HOST, NEXIL_PORT, NEXIL_ALLOW_ALL_HOSTS=1',
    '  build          Build SSG/ISR/SSR bundles',
    '  start          Start the route-aware production build',
    '  preview        Preview a production build (alias for start)',
    '  serve          Alias for start (kept for compatibility)',
    '  check          Run type, route, SEO, and boundary checks',
    '  analyze        Report route output and client budgets',
    '  routes         List discovered routes',
    '  generate route <name>       Scaffold a route',
    '  generate component <name>  Scaffold a component',
    '  generate store <name> [--split|--unified]  Scaffold a Nexil store',
    '                 Alias: g store <name> [--split|--unified]',
    '  add action <name>           Scaffold a server action',
    '  doctor         Diagnose common project configuration issues',
    '                 Flag: --json for a stable CI-readable report',
    '  upgrade        Report deprecated APIs and migration suggestions',
    '  test           Run the project test script',
  ].join('\n')
}

const execFileAsync = promisify(execFile)
const GENERATOR_PATH = /^[A-Za-z][A-Za-z0-9_/-]*$/

function assertGeneratorPath(name: string): void {
  if (
    !GENERATOR_PATH.test(name) ||
    name.includes('..') ||
    name.startsWith('/') ||
    name.endsWith('/')
  )
    throw new TypeError('Generator name must be a safe relative path.')
}

async function scaffoldCliArtifact(root: string, kind: string, name: string): Promise<string> {
  assertGeneratorPath(name)
  const extension = existsSync(join(root, 'tsconfig.json')) ? 'tsx' : 'jsx'
  const normalized = name.replace(/\\/g, '/')
  if (kind === 'route') {
    const file = join(root, 'src', 'routes', `${normalized}.${extension}`)
    await mkdir(dirname(file), { recursive: true })
    const componentName =
      normalized
        .split('/')
        .at(-1)!
        .replace(/[^A-Za-z0-9]/g, ' ')
        .split(' ')
        .filter(Boolean)
        .map((part) => part[0]!.toUpperCase() + part.slice(1))
        .join('') || 'GeneratedRoute'
    await writeFile(
      file,
      `export default function ${componentName}() {\n  return <main><h1>${componentName}</h1></main>\n}\n`,
      'utf8',
    )
    return relative(root, file).split(sep).join('/')
  }
  if (kind === 'component') {
    const file = join(root, 'src', 'components', `${normalized}.${extension}`)
    await mkdir(dirname(file), { recursive: true })
    await writeFile(
      file,
      `export interface ${normalized.split('/').at(-1)}Props {\n  children?: unknown\n}\n\nexport function ${normalized.split('/').at(-1)}() {\n  return <div />\n}\n`,
      'utf8',
    )
    return relative(root, file).split(sep).join('/')
  }
  if (kind === 'action') {
    const file = join(root, 'src', 'actions', `${normalized}.ts`)
    await mkdir(dirname(file), { recursive: true })
    await writeFile(
      file,
      `import { action } from '@nexil/core'\n\nexport const ${normalized.split('/').at(-1)} = action({\n  validate: (input: unknown) => input,\n  async handle(_context, input) {\n    return { input }\n  },\n})\n`,
      'utf8',
    )
    return relative(root, file).split(sep).join('/')
  }
  throw new Error(`Unknown generator kind: ${kind}`)
}

export async function scaffoldStore(
  root: string,
  name: string,
  variant: 'split' | 'unified' = 'unified',
): Promise<readonly string[]> {
  assertGeneratorPath(name)
  const normalized = name.replace(/\\/g, '/')
  const id = normalized
  const baseName = normalized.split('/').at(-1)!
  if (!/^[a-z][a-z0-9-]*$/.test(baseName))
    throw new TypeError(
      'Store name must start with a lowercase letter and contain only lowercase letters, numbers, and hyphens.',
    )
  const capName = baseName
    .split('-')
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join('')
  const created: string[] = []

  if (variant === 'split') {
    const dir = join(root, 'src', 'stores', normalized)
    // Check for existing collision with unified file
    const unifiedFile = join(root, 'src', 'stores', `${normalized}.ts`)
    if (existsSync(unifiedFile)) {
      throw new Error(
        `Cannot create split store "${normalized}": unified file ${relative(root, unifiedFile).split(sep).join('/')} already exists. Remove it or use a different name.`,
      )
    }
    if (
      existsSync(join(dir, 'store.ts')) ||
      existsSync(join(dir, 'types.ts')) ||
      existsSync(join(dir, 'actions.ts'))
    ) {
      throw new Error(
        `Split store "${normalized}" already exists at ${relative(root, dir).split(sep).join('/')}.`,
      )
    }
    await mkdir(dir, { recursive: true })

    const typesPath = join(dir, 'types.ts')
    const actionsPath = join(dir, 'actions.ts')
    const storePath = join(dir, 'store.ts')

    await writeFile(
      typesPath,
      `export interface ${capName}State {\n  // TODO: define your state shape\n  count: number\n}\n`,
      'utf8',
    )
    created.push(relative(root, typesPath).split(sep).join('/'))

    await writeFile(
      actionsPath,
      `import type { ${capName}State } from './types'\n\nexport const ${baseName}Actions = {\n  increment(state: ${capName}State): void {\n    state.count += 1\n  },\n\n  setCount(state: ${capName}State, count: number): void {\n    state.count = count\n  },\n}\n`,
      'utf8',
    )
    created.push(relative(root, actionsPath).split(sep).join('/'))

    await writeFile(
      storePath,
      `import { createStore } from '@nexil/core'\nimport type { ${capName}State } from './types'\nimport { ${baseName}Actions } from './actions'\n\nconst initialState: ${capName}State = {\n  count: 0,\n}\n\nexport const use${capName}Store = createStore({\n  id: '${id}',\n  state: () => initialState,\n  actions: ${baseName}Actions,\n})\n`,
      'utf8',
    )
    created.push(relative(root, storePath).split(sep).join('/'))
    return created
  }

  // unified
  const file = join(root, 'src', 'stores', `${normalized}.ts`)
  const dirForUnified = join(root, 'src', 'stores', normalized)
  if (existsSync(file)) {
    throw new Error(
      `Unified store "${normalized}" already exists at ${relative(root, file).split(sep).join('/')}.`,
    )
  }
  if (existsSync(join(dirForUnified, 'store.ts'))) {
    throw new Error(
      `Cannot create unified store "${normalized}": split store directory ${relative(root, dirForUnified).split(sep).join('/')} already exists. Remove it or use a different name.`,
    )
  }
  await mkdir(dirname(file), { recursive: true })
  await writeFile(
    file,
    `import { defineStore } from '@nexil/core'\n\nexport interface ${capName}State {\n  count: number\n}\n\nexport const use${capName}Store = defineStore('${id}', {\n  state: (): ${capName}State => ({\n    count: 0,\n  }),\n\n  getters: {\n    doubled: (state) => state.count * 2,\n  },\n\n  actions: {\n    increment(): void {\n      this.count += 1\n    },\n\n    setCount(count: number): void {\n      this.count = count\n    },\n  },\n})\n`,
    'utf8',
  )
  created.push(relative(root, file).split(sep).join('/'))
  return created
}

export async function diagnoseProject(root: string): Promise<DoctorReport> {
  const checks: DoctorCheck[] = []
  const add = (code: string, level: DoctorLevel, message: string): void => {
    checks.push({ code, level, message })
  }
  const routes = join(root, 'src', 'routes')
  const packageFile = join(root, 'package.json')
  if (!existsSync(packageFile)) add('package-json', 'error', 'Missing package.json.')
  else {
    try {
      const manifest = JSON.parse(await readFile(packageFile, 'utf8')) as {
        readonly scripts?: Record<string, unknown>
        readonly dependencies?: Record<string, unknown>
      }
      add('package-json', 'ok', 'package.json is readable.')
      if (manifest.scripts?.dev && manifest.scripts?.build && manifest.scripts?.start)
        add('lifecycle-scripts', 'ok', 'dev, build, and start scripts are present.')
      else
        add(
          'lifecycle-scripts',
          'warn',
          'Expected dev, build, and start scripts were not all found.',
        )
      if (typeof manifest.dependencies?.['@nexil/cli'] === 'string')
        add('nexil-cli', 'ok', 'A Nexil CLI dependency is configured.')
      else add('nexil-cli', 'warn', 'No @nexil/cli dependency was found.')
    } catch {
      add('package-json', 'error', 'package.json is not valid JSON.')
    }
  }
  add(
    'routes-directory',
    existsSync(routes) ? 'ok' : 'error',
    existsSync(routes) ? 'src/routes exists.' : 'Missing src/routes.',
  )
  add(
    'html-shell',
    existsSync(join(root, 'index.html')) ? 'ok' : 'warn',
    existsSync(join(root, 'index.html'))
      ? 'index.html exists.'
      : 'Missing index.html; the fallback template will be used.',
  )
  if (existsSync(join(root, 'index.html'))) {
    const shell = await readFile(join(root, 'index.html'), 'utf8')
    const hasOutlets =
      shell.includes('<!--nexil-app-outlet-->') && shell.includes('<!--nexil-head-outlet-->')
    add(
      'html-outlets',
      hasOutlets ? 'ok' : 'warn',
      hasOutlets
        ? 'The HTML shell includes Nexil application and head outlets.'
        : 'The HTML shell is missing one or more Nexil outlets.',
    )
  }
  try {
    const config = await readNexilConfig(root)
    add('nexil-config', 'ok', 'Nexil configuration is readable.')
    if (config.server?.trustProxy === true)
      add(
        'trusted-proxy',
        'warn',
        'trustProxy is enabled; use it only behind a proxy that overwrites forwarded headers.',
      )
    else
      add(
        'trusted-proxy',
        'ok',
        'Forwarded headers are ignored unless trustProxy is explicitly enabled.',
      )
    if (config.server?.securityHeaders)
      add('security-headers', 'ok', 'Production security headers are configured explicitly.')
    else
      add(
        'security-headers',
        'warn',
        'No production securityHeaders configuration was found; review createSecurityHeaders for Node deployments.',
      )
  } catch (error) {
    add(
      'nexil-config',
      'error',
      `Configuration error: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  const status = checks.some((check) => check.level === 'error')
    ? 'error'
    : checks.some((check) => check.level === 'warn')
      ? 'warn'
      : 'ok'
  return { version: 1, root, status, checks }
}

function formatDoctorReport(report: DoctorReport): string {
  return report.checks.map((check) => `${check.level} ${check.code}: ${check.message}`).join('\n')
}

async function migrationReport(root: string): Promise<string> {
  const files: string[] = []
  const visit = async (directory: string): Promise<void> => {
    if (!existsSync(directory)) return
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = join(directory, entry.name)
      if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== 'dist')
        await visit(file)
      else if (/\.(tsx|jsx|ts|js)$/.test(entry.name)) files.push(file)
    }
  }
  await visit(join(root, 'src'))
  const findings: string[] = []
  for (const file of files) {
    const source = await readFile(file, 'utf8')
    if (/\.get\(\)/.test(source) || /\.value/.test(source))
      findings.push(`${relative(root, file)}: prefer callable signal reads (sig())`)
    if (/serializeScopeRefs|data-nx-scope/.test(source))
      findings.push(`${relative(root, file)}: compiler-managed scope capture is available`)
    if (/renderHead\(/.test(source))
      findings.push(`${relative(root, file)}: export route metadata for inherited SEO`)
  }
  return findings.length === 0 ? 'No deprecated API patterns found.' : findings.join('\n')
}

interface BuildRouteRecord {
  readonly route: string
  readonly source: string
  readonly interactive: boolean
  readonly clientJsBytes: number
  readonly clientJsGzipBytes: number
  readonly bootstrapGzipBytes: number
  readonly navigationGzipBytes: number
  readonly cssBytes: number
}

type AssetCategory = 'image' | 'font' | 'script' | 'style' | 'other'

interface BuildAssetRecord {
  readonly path: string
  readonly bytes: number
  readonly category: AssetCategory
}

interface BuildAssetSummary {
  readonly count: number
  readonly totalBytes: number
  readonly imageBytes: number
  readonly largest: readonly BuildAssetRecord[]
}

interface BuildMediaImageRecord {
  readonly source: string
  readonly variants: readonly {
    readonly format: 'avif' | 'webp'
    readonly width: number
    readonly path: string
    readonly bytes: number
    readonly cacheHit: boolean
  }[]
}

interface BuildMediaSummary {
  readonly version: 1
  readonly images: readonly BuildMediaImageRecord[]
}

interface BuildManifest {
  readonly version: 1
  readonly routes: readonly BuildRouteRecord[]
  readonly assets?: BuildAssetSummary
  readonly media?: BuildMediaSummary
}

async function readNexilConfig(root: string): Promise<NexilConfig> {
  try {
    const parsed = JSON.parse(await readFile(join(root, 'nexil.config.json'), 'utf8')) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      throw new TypeError('Invalid nexil.config.json.')
    return parsed as NexilConfig
  } catch (error) {
    if (error instanceof SyntaxError) throw new TypeError('Invalid nexil.config.json.')
    if (error instanceof TypeError) throw error
    if ((error as { readonly code?: string }).code !== 'ENOENT') throw error
  }
  for (const fileName of ['nexil.config.mjs', 'nexil.config.js', 'nexil.config.ts']) {
    const file = join(root, fileName)
    if (!existsSync(file)) continue
    const source = await readFile(file, 'utf8')
    const code = fileName.endsWith('.ts')
      ? (await transformWithEsbuild(source, fileName, { loader: 'ts', format: 'esm' })).code
      : source
    const temporary = join(root, 'dist', `.nexil-config-${Date.now()}.mjs`)
    await mkdir(join(root, 'dist'), { recursive: true })
    await writeFile(temporary, code, 'utf8')
    const module = await import(`${pathToFileURL(temporary).href}?nexil-config=${Date.now()}`)
    const config = module.default ?? module.config ?? module
    if (!config || typeof config !== 'object' || Array.isArray(config))
      throw new TypeError(`Invalid ${fileName}.`)
    return config as NexilConfig
  }
  return {}
}

async function copyPublicDirectory(source: string, target: string): Promise<void> {
  if (!existsSync(source)) return
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const from = join(source, entry.name)
    const to = join(target, entry.name)
    if (entry.isDirectory()) {
      await mkdir(to, { recursive: true })
      await copyPublicDirectory(from, to)
      continue
    }
    if (!entry.isFile() || existsSync(to)) continue
    await mkdir(dirname(to), { recursive: true })
    await copyFile(from, to)
  }
}

const TRANSFORMABLE_IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.svg'])

async function discoverPublicImages(root: string): Promise<readonly string[]> {
  if (!existsSync(root)) return []
  const files: string[] = []
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = join(directory, entry.name)
      if (entry.isDirectory()) await visit(file)
      else if (entry.isFile() && TRANSFORMABLE_IMAGE_EXTENSIONS.has(extname(file).toLowerCase()))
        files.push(file)
    }
  }
  await visit(root)
  return files.sort()
}

function mediaWidths(widths: readonly number[] | undefined): readonly number[] {
  const values = widths ?? [320, 640, 960, 1280]
  const unique = [...new Set(values)]
  if (unique.length === 0 || unique.some((width) => !Number.isInteger(width) || width < 1))
    throw new TypeError('Nexil media image widths must be positive integers.')
  return unique.sort((left, right) => left - right)
}

async function buildConfiguredPublicImages(
  root: string,
  clientRoot: string,
  config: NexilConfig,
): Promise<BuildMediaSummary | undefined> {
  const imageConfig = config.media?.images
  if (!imageConfig?.transform) return undefined
  const publicRoot = join(root, 'public')
  const cacheDir = resolve(root, imageConfig.cacheDir ?? '.nexil/media-cache')
  if (relative(root, cacheDir).startsWith('..'))
    throw new TypeError('Nexil media cacheDir must remain inside the project root.')
  const widths = mediaWidths(imageConfig.widths)
  const images: BuildMediaImageRecord[] = []
  for (const sourcePath of await discoverPublicImages(publicRoot)) {
    const relativeSource = relative(publicRoot, sourcePath).split(sep).join('/')
    const publicPath = `/${relativeSource}`
    const relativeDirectory = dirname(relativeSource)
    const targetDir = join(clientRoot, relativeDirectory)
    const variants = await buildImageVariants({
      sourcePath,
      outputDir: targetDir,
      fileBase: imageVariantFileBase(publicPath),
      widths,
      cacheDir,
    })
    images.push({
      source: publicPath,
      variants: variants.map(
        (variant: {
          format: string
          width: number
          fileName: string
          bytes: number
          cacheHit: boolean
        }) => ({
          format: variant.format as 'avif' | 'webp',
          width: variant.width,
          path: `/${[relativeDirectory, variant.fileName].filter((part) => part !== '.').join('/')}`,
          bytes: variant.bytes,
          cacheHit: variant.cacheHit,
        }),
      ),
    })
  }
  return { version: 1, images }
}

function assetCategory(file: string): AssetCategory | undefined {
  switch (extname(file).toLowerCase()) {
    case '.html':
      return undefined
    case '.avif':
    case '.gif':
    case '.jpeg':
    case '.jpg':
    case '.png':
    case '.svg':
    case '.webp':
      return 'image'
    case '.woff':
    case '.woff2':
      return 'font'
    case '.js':
    case '.mjs':
      return 'script'
    case '.css':
      return 'style'
    default:
      return 'other'
  }
}

async function summarizeBuiltAssets(root: string): Promise<BuildAssetSummary> {
  const assets: BuildAssetRecord[] = []
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = join(directory, entry.name)
      if (entry.isDirectory()) {
        await visit(file)
        continue
      }
      if (!entry.isFile()) continue
      const category = assetCategory(file)
      if (!category) continue
      const details = await stat(file)
      assets.push({
        path: `/${relative(root, file).split(sep).join('/')}`,
        bytes: details.size,
        category,
      })
    }
  }
  await visit(root)
  const sorted = [...assets].sort((left, right) => right.bytes - left.bytes)
  return {
    count: assets.length,
    totalBytes: assets.reduce((total, asset) => total + asset.bytes, 0),
    imageBytes: assets
      .filter((asset) => asset.category === 'image')
      .reduce((total, asset) => total + asset.bytes, 0),
    largest: sorted.slice(0, 5),
  }
}

function formatAssetBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`
}

function assetAnalysisLines(summary: BuildAssetSummary | undefined): readonly string[] {
  if (!summary) return []
  const lines = [
    '',
    'Static asset delivery',
    `${summary.count} files  ${formatAssetBytes(summary.totalBytes)} total  ${formatAssetBytes(summary.imageBytes)} images`,
  ]
  if (summary.largest.length === 0) return lines
  lines.push('Largest assets:')
  for (const asset of summary.largest) {
    const warning =
      asset.category === 'image' && asset.bytes >= 256 * 1024
        ? '  warning: consider AVIF/WebP variants, `sizes`, and lazy loading when below the fold'
        : ''
    lines.push(`  ${asset.path}  ${formatAssetBytes(asset.bytes)}  ${asset.category}${warning}`)
  }
  return lines
}

function mediaAnalysisLines(summary: BuildMediaSummary | undefined): readonly string[] {
  if (!summary) return []
  const variantCount = summary.images.reduce((total, image) => total + image.variants.length, 0)
  const cacheHits = summary.images.reduce(
    (total, image) => total + image.variants.filter((variant) => variant.cacheHit).length,
    0,
  )
  return [
    '',
    'Generated image variants',
    `${summary.images.length} source images  ${variantCount} AVIF/WebP variants  ${cacheHits} cache hits`,
  ]
}

async function discoverRoutes(directory: string, root: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const routes: string[] = []
  for (const entry of entries) {
    const file = join(directory, entry.name)
    if (entry.isDirectory()) routes.push(...(await discoverRoutes(file, root)))
    else if (
      /\.(tsx|jsx|ts|js)$/.test(entry.name) &&
      !entry.name.startsWith('layout.') &&
      !entry.name.startsWith('_layout.')
    )
      routes.push(relative(root, file))
  }
  return routes.sort()
}

const BOOTSTRAP_FILE = 'nexil-bootstrap.js'
const STATE_FILE = 'nexil-state.js'
const CHUNK_DIRECTORY = 'nexil-chunks'

function injectStylesheetLink(template: string, href: string): string {
  const link = `<link rel="stylesheet" href="${href}">`
  if (template.includes(`href="${href}"`) || template.includes(`href='${href}'`)) return template
  if (template.includes('</head>')) return template.replace('</head>', `  ${link}\n</head>`)
  return `${link}${template}`
}

function dedupeStructuralMetaTags(html: string): string {
  const seen = new Set<string>()
  return html.replace(/<meta\s+[^>]*>/gi, (tag) => {
    const charset = /\bcharset\s*=\s*/i.test(tag)
    const viewport = /name=["']viewport["']/i.test(tag)
    if (!charset && !viewport) return tag
    const key = charset ? 'charset' : 'viewport'
    if (seen.has(key)) return ''
    seen.add(key)
    return tag
  })
}

type ScopeHtmlNode = {
  readonly tag: string
  readonly start: number
  readonly end: number
  readonly raw: string
  readonly parent: ScopeHtmlNode | undefined
}

function scopeAttributePayload(
  tag: string,
): Array<{ readonly raw: string; readonly value: Record<string, unknown> }> {
  const entries: Array<{ readonly raw: string; readonly value: Record<string, unknown> }> = []
  for (const match of tag.matchAll(/\sdata-nx-scope="([^"]*)"/g)) {
    try {
      const decoded = JSON.parse(
        match[1]!.replace(/&quot;/g, '"').replace(/&amp;/g, '&'),
      ) as unknown
      if (decoded && typeof decoded === 'object' && !Array.isArray(decoded))
        entries.push({ raw: match[0], value: decoded as Record<string, unknown> })
    } catch {
      // Invalid scope data is left untouched for the runtime to reject safely.
    }
  }
  return entries
}

function scopeKey(value: Record<string, unknown>): string {
  return JSON.stringify(value)
}

function liftRepeatedScopes(html: string): string {
  const root: ScopeHtmlNode = { tag: '#root', start: -1, end: -1, raw: '', parent: undefined }
  const stack: ScopeHtmlNode[] = [root]
  const nodes: ScopeHtmlNode[] = []
  for (const match of html.matchAll(/<\/?[A-Za-z][^>]*>/g)) {
    const raw = match[0]!
    const start = match.index ?? 0
    if (raw.startsWith('</')) {
      const name = /^<\/([A-Za-z][A-Za-z0-9:-]*)/i.exec(raw)?.[1]?.toLowerCase()
      if (name) {
        while (stack.length > 1 && stack.at(-1)!.tag !== name) stack.pop()
        if (stack.length > 1) stack.pop()
      }
      continue
    }
    const name = /^<([A-Za-z][A-Za-z0-9:-]*)/i.exec(raw)?.[1]?.toLowerCase()
    if (!name) continue
    const parent = stack.at(-1) && stack.at(-1) !== root ? stack.at(-1) : undefined
    const node: ScopeHtmlNode = {
      tag: name,
      start,
      end: start + raw.length,
      raw,
      parent,
    }
    nodes.push(node)
    if (
      !/\/>$/.test(raw) &&
      ![
        'area',
        'base',
        'br',
        'col',
        'embed',
        'hr',
        'img',
        'input',
        'link',
        'meta',
        'param',
        'source',
        'track',
        'wbr',
      ].includes(name)
    )
      stack.push(node)
  }

  const grouped = new Map<string, Array<{ node: ScopeHtmlNode; value: Record<string, unknown> }>>()
  for (const node of nodes) {
    for (const entry of scopeAttributePayload(node.raw)) {
      const key = scopeKey(entry.value)
      const group = grouped.get(key) ?? []
      group.push({ node, value: entry.value })
      grouped.set(key, group)
    }
  }

  const removals = new Map<ScopeHtmlNode, Set<string>>()
  const lifts = new Map<ScopeHtmlNode, Record<string, unknown>[]>()
  for (const [key, entries] of grouped) {
    if (entries.length < 2) continue
    const ancestorSets = entries.map(({ node }) => {
      const ancestors = new Set<ScopeHtmlNode>()
      let current: ScopeHtmlNode | undefined = node
      while (current) {
        ancestors.add(current)
        current = current.parent
      }
      return ancestors
    })
    let common = entries[0]!.node
    while (!ancestorSets.every((set) => set.has(common)) && common.parent) common = common.parent
    if (common === root) continue
    for (const { node } of entries) {
      if (node === common) continue
      const current = removals.get(node) ?? new Set<string>()
      current.add(key)
      removals.set(node, current)
    }
    const current = lifts.get(common) ?? []
    current.push(entries[0]!.value)
    lifts.set(common, current)
  }

  if (removals.size === 0 && lifts.size === 0) return html
  const edits: Array<{ start: number; end: number; value: string }> = []
  for (const node of nodes) {
    const nodeRemovals = removals.get(node)
    const nodeLifts = lifts.get(node)
    if (!nodeRemovals && !nodeLifts) continue
    const existing = scopeAttributePayload(node.raw)
    const merged: Record<string, unknown> = {}
    for (const entry of existing) {
      if (!nodeRemovals?.has(scopeKey(entry.value))) Object.assign(merged, entry.value)
    }
    for (const lifted of nodeLifts ?? []) Object.assign(merged, lifted)
    let replacement = node.raw
    for (const entry of existing) replacement = replacement.replace(entry.raw, '')
    if (Object.keys(merged).length > 0) {
      const attribute = ` data-nx-scope="${JSON.stringify(merged).replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`
      replacement = replacement.replace(/\s*\/?>(?=[^>]*$)/, `${attribute}$&`)
    }
    edits.push({ start: node.start, end: node.end, value: replacement })
  }
  for (const edit of edits.sort((left, right) => right.start - left.start))
    html = `${html.slice(0, edit.start)}${edit.value}${html.slice(edit.end)}`
  return html
}

function sanitizeDocument(html: string): string {
  return liftRepeatedScopes(dedupeStructuralMetaTags(html))
}

type StaticPathValue =
  | string
  | Readonly<Record<string, string | string[]>>
  | { readonly params: Readonly<Record<string, string | string[]>> }

function staticPathToRoute(pattern: string, value: StaticPathValue): string {
  if (typeof value === 'string') {
    if (value.startsWith('/')) return value
    const parent = pattern.split('/').slice(0, -1).join('/')
    return `${parent}/${value}`.replace(/\/+/g, '/')
  }
  const candidate: unknown = value
  const params: Readonly<Record<string, string | string[]>> =
    typeof candidate === 'object' &&
    candidate !== null &&
    !Array.isArray(candidate) &&
    'params' in candidate &&
    typeof candidate.params === 'object' &&
    candidate.params !== null
      ? (candidate.params as Readonly<Record<string, string | string[]>>)
      : (candidate as Readonly<Record<string, string | string[]>>)

  const segments = pattern
    .split('/')
    .filter(Boolean)
    .flatMap((segment) => {
      if (!segment.startsWith(':')) return [segment]
      const name = segment.slice(1).replace(/\*?\??$/, '')
      const param = params[name]
      if (param === undefined) return []
      return Array.isArray(param) ? param : [param]
    })
  return `/${segments.map((segment) => encodeURIComponent(segment)).join('/')}` || '/'
}

async function resolveStaticPaths(
  pattern: string,
  routePath: string,
  module: RouteModule,
): Promise<readonly string[]> {
  const exported =
    typeof module.getStaticPaths === 'function' ? await module.getStaticPaths() : module.staticPaths
  if (!Array.isArray(exported) || exported.length === 0) return [routePath]
  return exported.map((value: StaticPathValue) => staticPathToRoute(pattern, value))
}

const SOURCE_EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js'] as const

async function resolveSourceImport(
  fromFile: string,
  specifier: string,
): Promise<string | undefined> {
  if (!specifier.startsWith('.')) return undefined
  const base = resolve(dirname(fromFile), specifier)
  const candidates = [
    base,
    ...SOURCE_EXTENSIONS.map((extension) => `${base}${extension}`),
    ...SOURCE_EXTENSIONS.map((extension) => join(base, `index${extension}`)),
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  return undefined
}

async function collectSourceModules(entry: string): Promise<readonly string[]> {
  const visited = new Set<string>()
  const ordered: string[] = []
  const visit = async (file: string): Promise<void> => {
    const normalized = resolve(file)
    if (visited.has(normalized)) return
    visited.add(normalized)
    ordered.push(normalized)
    const source = await readFile(normalized, 'utf8')
    const imports = new Set<string>()
    const importPattern = /(?:import|export)\\s+(?:[\\s\\S]*?\\sfrom\\s+)?['\"](\\.[^'\"]+)['\"]/g
    for (const match of source.matchAll(importPattern)) {
      const specifier = match[1]
      if (specifier) imports.add(specifier)
    }
    for (const specifier of imports) {
      const imported = await resolveSourceImport(normalized, specifier)
      if (imported) await visit(imported)
    }
  }
  await visit(entry)
  return ordered
}

async function buildArtifacts(root: string): Promise<BuildManifest> {
  const routeRoot = join(root, 'src', 'routes')
  const routes = await discoverRoutes(routeRoot, routeRoot)
  if (routes.length === 0) throw new Error(`No routes found in ${routeRoot}.`)
  const outputRoot = join(root, 'dist')
  const config = await readNexilConfig(root)
  const siteOrigin = process.env.NEXIL_SITE_ORIGIN ?? config.app?.origin ?? 'http://localhost:4173'
  const resolveSeo = (seo: RouteModule['seo'], pathname: string): SeoMetadata | undefined => {
    if (!seo) return undefined
    const metadata = typeof seo === 'function' ? seo({ pathname }) : seo
    return withCanonical(metadata, pathname, siteOrigin)
  }
  await rm(outputRoot, { recursive: true, force: true })
  const serverRoot = join(outputRoot, 'server', 'routes')
  const serverModules = new Map<string, RouteModule>()
  const chunkRoot = join(outputRoot, CHUNK_DIRECTORY)
  const clientRoot = join(outputRoot, 'client')
  const assetRoot = join(clientRoot, 'assets')
  const ogRoot = join(clientRoot, 'og')
  await mkdir(serverRoot, { recursive: true })
  await mkdir(chunkRoot, { recursive: true })
  await mkdir(assetRoot, { recursive: true })
  await mkdir(ogRoot, { recursive: true })
  await mkdir(clientRoot, { recursive: true })

  let template: string
  try {
    template = await readFile(join(root, 'index.html'), 'utf8')
  } catch {
    template = `<!DOCTYPE html><html lang="en"><head><!--nexil-head-outlet--></head><body><div id="app"><!--nexil-app-outlet--></div><!--nexil-scripts-outlet--></body></html>`
  }

  try {
    await readFile(join(root, 'src', 'styles.css'), 'utf8')
    const clientBuild = await build({
      root,
      ...VITE_WORKSPACE_CONFIG,
      plugins: [nexil({ root })],
      build: {
        write: false,
        outDir: join(outputRoot, 'client'),
        cssCodeSplit: true,
        rollupOptions: { input: join(root, 'src', 'styles.css') },
      },
      logLevel: 'silent',
    })
    const outputs = buildOutputEntries(clientBuild)
    const stylesheet = outputs.find(
      (entry) => entry.type === 'asset' && entry.fileName.endsWith('.css'),
    )
    if (stylesheet?.source !== undefined) {
      await writeFile(join(assetRoot, 'styles.css'), String(stylesheet.source), 'utf8')
      template = template.replaceAll('/src/styles.css', '/assets/styles.css')
      template = injectStylesheetLink(template, '/assets/styles.css')
    }
  } catch {
    // Tailwind is opt-in; applications without src/styles.css need no CSS transform.
  }

  const loadServerModule = async (route: string): Promise<RouteModule> => {
    const cached = serverModules.get(route)
    if (cached) return cached
    const sourcePath = join(routeRoot, route)
    const result = await build({
      root,
      ...VITE_WORKSPACE_CONFIG,
      plugins: [nexil({ root })],
      build: {
        write: false,
        ssr: sourcePath,
        rollupOptions: { input: sourcePath },
      },
      logLevel: 'silent',
    })
    const outputs = buildOutputEntries(result)
    const entry = outputs.find((chunk) => chunk.type === 'chunk' && chunk.isEntry)
    if (!entry?.code) throw new Error(`Vite SSR build produced no entry for ${route}.`)
    const outputName = route.replace(/\\/g, '/').replace(/\.(tsx|jsx|ts|js)$/, '.js')
    const serverModulePath = join(serverRoot, outputName)
    await mkdir(join(serverModulePath, '..'), { recursive: true })
    await writeFile(serverModulePath, entry.code, 'utf8')
    const module = await import(`${pathToFileURL(serverModulePath).href}?nexil=${Date.now()}`)
    serverModules.set(route, module)
    return module
  }

  async function discoverLayouts(route: string): Promise<readonly string[]> {
    const routeParts = route.replace(/\\/g, '/').split('/')
    const directories = routeParts.slice(0, -1)
    const candidates: string[] = []
    for (let index = 0; index <= directories.length; index += 1) {
      const directory = directories.slice(0, index).join('/')
      for (const stem of ['_layout', 'layout']) {
        for (const extension of SOURCE_EXTENSIONS) {
          const relativePath = [directory, `${stem}${extension}`].filter(Boolean).join('/')
          if (existsSync(join(routeRoot, relativePath))) {
            candidates.push(relativePath)
            break
          }
        }
        if (candidates.at(-1)?.startsWith([directory, stem].filter(Boolean).join('/'))) break
      }
    }
    return candidates
  }

  async function applyLayouts(
    route: string,
    child: Child,
    props: Readonly<Record<string, unknown>> = {},
    context?: ComponentContext,
  ): Promise<Child> {
    let current = child
    const layouts = await discoverLayouts(route)
    for (let index = layouts.length - 1; index >= 0; index -= 1) {
      const layout = layouts[index]!
      const module = await loadServerModule(layout)
      const Layout = module.default
      if (typeof Layout === 'function')
        current = await Layout({ ...props, children: current }, context)
    }
    return current
  }

  async function resolveInheritedSeo(
    route: string,
    module: RouteModule,
    pathname: string,
  ): Promise<SeoMetadata | undefined> {
    const inherited: Partial<SeoMetadata> = {}
    let inheritedOpenGraph: SeoMetadata['openGraph'] | undefined
    for (const layout of await discoverLayouts(route)) {
      const layoutModule = await loadServerModule(layout)
      if (layoutModule.metadata) {
        Object.assign(inherited, layoutModule.metadata)
        inheritedOpenGraph = {
          ...inheritedOpenGraph,
          ...layoutModule.metadata.openGraph,
        }
      }
    }
    const legacy = resolveSeo(module.seo, pathname)
    const own = module.metadata ?? {}
    const merged: Partial<SeoMetadata> = {
      ...inherited,
      ...(legacy ?? {}),
      ...own,
      ...(inheritedOpenGraph || legacy?.openGraph || own.openGraph
        ? {
            openGraph: {
              ...inheritedOpenGraph,
              ...legacy?.openGraph,
              ...own.openGraph,
            },
          }
        : {}),
    }
    if (typeof merged.title !== 'string' || merged.title.trim().length === 0) return undefined
    return withCanonical(merged as SeoMetadata, pathname, siteOrigin)
  }

  function createBuildComponentContext(pathname: string): ComponentContext {
    const requestContext = createRequestContext(
      new Request(new URL(pathname, siteOrigin).href),
      `build:${pathname}`,
    )
    return { requestId: requestContext.id, scope: requestContext.scope }
  }

  const records: BuildRouteRecord[] = []
  const feedItems: Array<{ title: string; link: string; description?: string }> = []
  const cssAssets = new Set<string>()
  const emittedChunks = new Set<string>()
  const externalScopePayloads = new Map<string, ExternalScopePayload>()
  let hasInteractiveRoute = false
  let hasBindingRoute = false
  let hasFormRoute = false
  let hasNavigationRoute = false
  const minifiedBootstrap = (
    await transformWithEsbuild(RESUMABILITY_BOOTSTRAP_EXTERNAL, BOOTSTRAP_FILE, {
      loader: 'js',
      minify: true,
    })
  ).code
  const bootstrapGzipBytes = gzipSync(Buffer.from(minifiedBootstrap)).byteLength
  const minifiedNavigation = (
    await transformWithEsbuild(NEXIL_NAVIGATION_RUNTIME, 'nexil-navigation.js', {
      loader: 'js',
      minify: true,
    })
  ).code
  const navigationGzipBytes = gzipSync(Buffer.from(minifiedNavigation)).byteLength

  for (const route of routes) {
    const sourcePath = join(routeRoot, route)
    const sourceModules = [
      ...new Set([
        ...(await collectSourceModules(sourcePath)),
        ...(await discoverLayouts(route)).map((layout) => resolve(join(routeRoot, layout))),
      ]),
    ]
    const transformedModules = await Promise.all(
      sourceModules.map(async (modulePath) => ({
        modulePath,
        result: await transformNexilSource(await readFile(modulePath, 'utf8'), modulePath, {
          scopeSerialization: 'external',
        }),
      })),
    )
    const direct = transformedModules.find((entry) => entry.modulePath === resolve(sourcePath))
    if (!direct) throw new Error(`Nexil build could not transform route ${route}.`)
    const routeChunks = new Map<string, (typeof direct.result.chunks)[number]>()
    const routeCss = new Set<string>()
    const routeBindings = transformedModules.flatMap((entry) => entry.result.bindings)
    for (const entry of transformedModules) {
      for (const chunk of entry.result.chunks) routeChunks.set(chunk.fileName, chunk)
      for (const css of entry.result.css) routeCss.add(css)
      for (const payload of entry.result.externalScopePayloads ?? [])
        externalScopePayloads.set(payload.key, payload)
    }
    const transformed = {
      ...direct.result,
      chunks: [...routeChunks.values()],
      css: [...routeCss],
      bindings: routeBindings,
    }
    const outputName = route.replace(/\\/g, '/').replace(/\.(tsx|jsx|ts|js)$/, '.js')
    await mkdir(join(serverRoot, outputName, '..'), { recursive: true })
    await writeFile(join(serverRoot, outputName), transformed.code, 'utf8')
    let clientBytes = 0
    for (const chunk of transformed.chunks) {
      let chunkCode = ''
      try {
        const bundled = await esbuild.build({
          stdin: {
            contents: chunk.source,
            resolveDir: dirname(sourcePath),
            sourcefile: chunk.fileName,
            loader: 'js',
          },
          bundle: true,
          format: 'esm',
          platform: 'browser',
          target: 'es2022',
          minify: true,
          write: false,
          external: [
            'sharp',
            'node:*',
            'fs',
            'path',
            'crypto',
            'child_process',
            'util',
            'events',
            'os',
            'stream',
            'module',
          ],
          plugins: [
            {
              name: 'nexil-absolute-src-resolver',
              setup(build) {
                build.onResolve({ filter: /^\/src\// }, (args) => ({
                  path: join(root, args.path.slice(1)),
                }))
                // Resolve workspace aliases for @nexil/* inside store modules
                for (const alias of workspaceAliases()) {
                  const isString = typeof alias.find === 'string'
                  const pattern = isString
                    ? new RegExp(`^${alias.find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`)
                    : (alias.find as RegExp)
                  build.onResolve({ filter: pattern }, (args) => ({
                    path: alias.replacement,
                  }))
                }
              },
            },
          ],
        })
        chunkCode = bundled.outputFiles?.[0]?.text ?? ''
        if (!chunkCode) throw new Error('Empty bundle')
      } catch (error) {
        // Fallback to minify without bundling (keeps import as-is for dev-like serve)
        // Log bundling failure for diagnostics without breaking build
        if (process.env.DEBUG_NEXIL_BUILD) {
          console.warn(
            `[nexil] Chunk bundling failed for ${chunk.fileName}: ${error instanceof Error ? error.message : String(error)}`,
          )
        }
        const minified = await transformWithEsbuild(chunk.source, chunk.fileName, {
          loader: 'js',
          minify: true,
        })
        chunkCode = minified.code
      }
      if (!emittedChunks.has(chunk.fileName)) {
        emittedChunks.add(chunk.fileName)
        await writeFile(join(chunkRoot, chunk.fileName), chunkCode, 'utf8')
        const chunkClientPath = join(clientRoot, CHUNK_DIRECTORY, chunk.fileName)
        await mkdir(join(clientRoot, CHUNK_DIRECTORY), { recursive: true })
        await writeFile(chunkClientPath, chunkCode, 'utf8')
      }
      clientBytes += Buffer.byteLength(chunkCode)
    }
    for (const css of transformed.css) cssAssets.add(css)
    const routeTemplate =
      transformed.css.length > 0 ? injectStylesheetLink(template, '/assets/nexil.css') : template
    const routeName = route
      .replace(/\\/g, '/')
      .replace(/\.(tsx|jsx|ts|js)$/, '')
      .replace(/\/index$/, '')
    const routePath = routeName === 'index' ? '/' : `/${routeName}`
    const interactive = transformed.chunks.length > 0 || transformed.bindings.length > 0
    hasInteractiveRoute ||= interactive
    hasBindingRoute ||= transformed.bindings.length > 0

    let renderedHtml = ''
    let headHtml = '<title>Nexil App</title>'
    let scriptsHtml = interactive ? `<script type="module" src="/${BOOTSTRAP_FILE}"></script>` : ''
    if (transformed.bindings.length > 0)
      scriptsHtml += `<script type="module" src="/nexil-bindings.js"></script>`
    const buildRequestContext = createRequestContext(
      new Request(new URL(routePath, siteOrigin).href),
      `build:${routePath}`,
    )
    const buildContext = {
      requestId: buildRequestContext.id,
      scope: buildRequestContext.scope,
    } as ComponentContext
    // Fallback for state package when AsyncLocalStorage is not yet propagated (e.g., sync build path)
    ;(
      globalThis as unknown as { __nexil_buildRequestContext?: unknown }
    ).__nexil_buildRequestContext = buildRequestContext as unknown
    try {
      const mod = await loadServerModule(route)
      let routeSeo = await resolveInheritedSeo(route, mod, routePath)
      if (routeSeo) {
        if (routePath !== '/') {
          routeSeo = {
            ...routeSeo,
            jsonLd: routeSeo.jsonLd ?? deriveBreadcrumbList(routePath, siteOrigin),
          }
        }
        if (!routeSeo.image) {
          const og = await generateOgImage(
            {
              title: String(routeSeo.title),
              description: String(routeSeo.description ?? '') || 'Nexil application route.',
            },
            ogRoot,
          )
          routeSeo = { ...routeSeo, image: `/og/${og.fileName}` }
        }
        if (!routePath.includes('['))
          feedItems.push({
            title: String(routeSeo.title),
            link: `${siteOrigin.replace(/\/$/, '')}${routePath === '/' ? '/' : routePath}`,
            ...(routeSeo.description ? { description: String(routeSeo.description) } : {}),
          })
        try {
          headHtml = renderHead(routeSeo)
        } catch {
          headHtml = routeSeo?.title ? `<title>${escapeHtml(routeSeo.title)}</title>` : headHtml
        }
      }
      if (mod.render?.mode) {
        // Support render mode export for future use
      }
      const Component = mod.default
      // buildRequestContext / buildContext already created before outer try
      try {
        await runWithScope(buildRequestContext.scope, async () => {
          if (typeof Component === 'function') {
            const thunk = () =>
              (Component as (p: Record<string, string | string[]>, c?: unknown) => unknown)(
                {},
                buildContext,
              ) as unknown as Child
            let composed: Child
            try {
              composed = await applyLayouts(route, thunk as unknown as Child, {}, buildContext)
              renderedHtml = renderToString(composed)
            } catch (err) {
              if (err instanceof TypeError && /synchronously/.test((err as Error).message)) {
                const eager = await (
                  Component as (p: Record<string, string | string[]>, c?: unknown) => unknown
                )({}, buildContext)
                composed = await applyLayouts(route, eager as Child, {}, buildContext)
                renderedHtml = renderToString(composed)
              } else throw err
            }
          } else if (Component) {
            renderedHtml = renderToString(Component)
          } else {
            throw new TypeError(
              `Route ${routePath} does not export a renderable default component.`,
            )
          }
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        throw new Error(`SSR failed for ${routePath}: ${message}`, { cause: err })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw new Error(`SSR failed for ${routePath}: ${message}`, { cause: err })
    }

    const externalizedRenderedScopes = externalizeScopeAttributes(renderedHtml, sourcePath)
    renderedHtml = externalizedRenderedScopes.code
    for (const payload of externalizedRenderedScopes.payloads)
      externalScopePayloads.set(payload.key, payload)
    if (externalizedRenderedScopes.payloads.length > 0)
      scriptsHtml = `<script type="module" src="/${STATE_FILE}"></script>${scriptsHtml}`

    if (renderedHtml.includes('data-nx-link')) {
      hasNavigationRoute = true
      scriptsHtml = `<script type="module" src="/nexil-navigation.js"></script>${scriptsHtml}`
    }

    if (renderedHtml.includes('data-nx-form="progressive"')) {
      hasFormRoute = true
      scriptsHtml += `<script type="module" src="/nexil-forms.js"></script>`
    }

    // Save base scriptsHtml before store injection for use in staticPaths
    const scriptsHtmlBeforeStores = scriptsHtml
    // Inject Nexil Stores state if any stores were accessed during this request
    // The access log is per-request via AsyncLocalStorage, so this only contains this route's stores
    const storesScriptTag = await runWithScope(buildRequestContext.scope, () =>
      __getStoresScriptTag(),
    )
    if (storesScriptTag) {
      scriptsHtml = `${storesScriptTag}${scriptsHtml}`
    }
    // Clear per-request access log (scope will be GC'd, but clear global fallback)
    await runWithScope(buildRequestContext.scope, () => __clearAccessedStoreIds())
    const html = sanitizeDocument(
      routeTemplate
        .replace('<!--nexil-head-outlet-->', headHtml)
        .replace('<!--nexil-app-outlet-->', renderedHtml)
        .replace('<!--nexil-scripts-outlet-->', scriptsHtml),
    )

    const outDir = routePath === '/' ? clientRoot : join(clientRoot, routePath.slice(1))
    await mkdir(outDir, { recursive: true })
    await writeFile(join(outDir, 'index.html'), html, 'utf8')

    const routeRecord = routeFromFile(`src/routes/${route.replace(/\\/g, '/')}`)
    const routeMetrics = {
      source: route,
      interactive,
      clientJsBytes: clientBytes,
      clientJsGzipBytes:
        clientBytes === 0
          ? 0
          : gzipSync(Buffer.from([...transformed.chunks].map((chunk) => chunk.source).join('')))
              .byteLength,
      bootstrapGzipBytes: interactive ? bootstrapGzipBytes : 0,
      navigationGzipBytes: renderedHtml.includes('data-nx-link') ? navigationGzipBytes : 0,
      cssBytes: Buffer.byteLength([...transformed.css].join('')),
    }
    records.push({
      route: routePath === '/' ? '/' : routePath,
      ...routeMetrics,
    })

    if (routePath.includes('[')) {
      try {
        const staticModule = await loadServerModule(route)
        const staticPaths = await resolveStaticPaths(routeRecord.pattern, routePath, staticModule)
        if (staticPaths.some((generatedPath) => generatedPath !== routePath)) {
          await rm(join(clientRoot, routePath.slice(1)), { recursive: true, force: true })
          const placeholderIndex = records.findIndex((record) => record.route === routePath)
          if (placeholderIndex >= 0) records.splice(placeholderIndex, 1)
        }
        for (const generatedPath of staticPaths) {
          if (generatedPath === routePath) continue
          const generatedMatch = matchRoute(routeRecord, generatedPath)
          const GeneratedComponent = staticModule.default
          const generatedRequestContext = createRequestContext(
            new Request(new URL(generatedPath, siteOrigin).href),
            `build:${generatedPath}`,
          )
          const generatedContext = {
            requestId: generatedRequestContext.id,
            scope: generatedRequestContext.scope,
          } as ComponentContext
          ;(
            globalThis as unknown as { __nexil_buildRequestContext?: unknown }
          ).__nexil_buildRequestContext = generatedRequestContext as unknown
          const { generatedResult, generatedRenderedHtml: rawGeneratedHtml } = await runWithScope(
            generatedRequestContext.scope,
            async () => {
              const result =
                typeof GeneratedComponent === 'function'
                  ? await GeneratedComponent(generatedMatch?.params ?? {}, generatedContext)
                  : GeneratedComponent
              const html = renderToString(
                await applyLayouts(route, result, generatedMatch?.params ?? {}, generatedContext),
              )
              return { generatedResult: result, generatedRenderedHtml: html }
            },
          )
          let generatedRenderedHtml = rawGeneratedHtml
          let generatedSeo = await resolveInheritedSeo(route, staticModule, generatedPath)
          if (generatedSeo && !generatedSeo.image) {
            const og = await generateOgImage(
              {
                title: String(generatedSeo.title),
                description: String(generatedSeo.description ?? '') || 'Nexil application route.',
              },
              ogRoot,
            )
            generatedSeo = { ...generatedSeo, image: `/og/${og.fileName}` }
          }
          if (generatedSeo)
            feedItems.push({
              title: String(generatedSeo.title),
              link: `${siteOrigin.replace(/\/$/, '')}${generatedPath === '/' ? '/' : generatedPath}`,
              ...(generatedSeo.description
                ? { description: String(generatedSeo.description) }
                : {}),
            })
          const generatedHead = generatedSeo
            ? renderHead({
                ...generatedSeo,
                ...(generatedPath !== '/' && !generatedSeo.jsonLd
                  ? { jsonLd: deriveBreadcrumbList(generatedPath, siteOrigin) }
                  : {}),
              })
            : headHtml
          let generatedScriptsHtml = generatedRenderedHtml.includes('data-nx-form="progressive"')
            ? `${scriptsHtmlBeforeStores}<script type="module" src="/nexil-forms.js"></script>`
            : scriptsHtmlBeforeStores
          // Inject per-generated-path store state
          const generatedStoresTag = await runWithScope(generatedRequestContext.scope, () =>
            __getStoresScriptTag(),
          )
          if (generatedStoresTag) {
            generatedScriptsHtml = `${generatedStoresTag}${generatedScriptsHtml}`
          }
          await runWithScope(generatedRequestContext.scope, () => __clearAccessedStoreIds())
          if (generatedRenderedHtml.includes('data-nx-form="progressive"')) hasFormRoute = true
          const generatedHtml = sanitizeDocument(
            routeTemplate
              .replace('<!--nexil-head-outlet-->', generatedHead)
              .replace('<!--nexil-app-outlet-->', generatedRenderedHtml)
              .replace('<!--nexil-scripts-outlet-->', generatedScriptsHtml),
          )
          const generatedDirectory = join(clientRoot, generatedPath.slice(1))
          await mkdir(generatedDirectory, { recursive: true })
          await writeFile(join(generatedDirectory, 'index.html'), generatedHtml, 'utf8')
          records.push({ route: generatedPath, ...routeMetrics })
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        throw new Error(`Static path generation failed for ${routePath}: ${message}`, {
          cause: error,
        })
      }
    }
  }

  if (cssAssets.size > 0) {
    const cssContent = [...cssAssets].join('')
    await writeFile(join(assetRoot, 'nexil.css'), cssContent, 'utf8')
  }
  if (hasInteractiveRoute) {
    await writeFile(join(outputRoot, BOOTSTRAP_FILE), minifiedBootstrap, 'utf8')
    await writeFile(join(clientRoot, BOOTSTRAP_FILE), minifiedBootstrap, 'utf8')
  }
  if (hasFormRoute) {
    const minifiedForms = (
      await transformWithEsbuild(RESUMABILITY_FORMS, 'nexil-forms.js', {
        loader: 'js',
        minify: true,
      })
    ).code
    await writeFile(join(outputRoot, 'nexil-forms.js'), minifiedForms, 'utf8')
    await writeFile(join(clientRoot, 'nexil-forms.js'), minifiedForms, 'utf8')
  }
  if (hasNavigationRoute) {
    await writeFile(join(outputRoot, 'nexil-navigation.js'), minifiedNavigation, 'utf8')
    await writeFile(join(clientRoot, 'nexil-navigation.js'), minifiedNavigation, 'utf8')
  }
  if (hasBindingRoute) {
    const minifiedBindings = (
      await transformWithEsbuild(RESUMABILITY_BINDINGS_EXTERNAL, 'nexil-bindings.js', {
        loader: 'js',
        minify: true,
      })
    ).code
    await writeFile(join(outputRoot, 'nexil-bindings.js'), minifiedBindings, 'utf8')
    await writeFile(join(clientRoot, 'nexil-bindings.js'), minifiedBindings, 'utf8')
  }
  if (externalScopePayloads.size > 0) {
    const payload = Object.fromEntries(
      [...externalScopePayloads].map(([key, entry]) => [key, entry.payload]),
    )
    const stateSource = `globalThis.__nexilScopeSeeds=Object.assign(globalThis.__nexilScopeSeeds||{},${JSON.stringify(payload)});\n`
    const minifiedState = (
      await transformWithEsbuild(stateSource, STATE_FILE, {
        loader: 'js',
        minify: true,
      })
    ).code
    await writeFile(join(outputRoot, STATE_FILE), minifiedState, 'utf8')
    await writeFile(join(clientRoot, STATE_FILE), minifiedState, 'utf8')
  }
  const sitemap = buildSitemap(
    records.map((record) => ({
      url: `${siteOrigin.replace(/\/$/, '')}${record.route === '/' ? '/' : record.route}`,
      changeFrequency: 'weekly' as const,
    })),
  )
  await writeFile(join(clientRoot, 'sitemap.xml'), sitemap, 'utf8')
  const feed = generateFeed(feedItems, {
    title: config.feed?.title ?? 'Nexil Updates',
    link: `${siteOrigin.replace(/\/$/, '')}/`,
    description: config.feed?.description ?? 'Nexil application routes and updates.',
    ...(config.feed?.language ? { language: config.feed.language } : {}),
    feedUrl: `${siteOrigin.replace(/\/$/, '')}/feed.xml`,
  })
  await writeFile(join(clientRoot, 'feed.xml'), feed, 'utf8')
  const atom = generateAtomFeed(feedItems, {
    title: config.feed?.title ?? 'Nexil Updates',
    link: `${siteOrigin.replace(/\/$/, '')}/`,
    description: config.feed?.description ?? 'Nexil application routes and updates.',
    ...(config.feed?.language ? { language: config.feed.language } : {}),
    feedUrl: `${siteOrigin.replace(/\/$/, '')}/atom.xml`,
  })
  await writeFile(join(clientRoot, 'atom.xml'), atom, 'utf8')
  await writeFile(
    join(outputRoot, 'nexil-redirects.json'),
    `${JSON.stringify(config.redirects ?? [], null, 2)}\n`,
    'utf8',
  )
  await writeFile(
    join(clientRoot, 'robots.txt'),
    buildRobots(`${siteOrigin.replace(/\/$/, '')}/sitemap.xml`),
    'utf8',
  )
  await copyPublicDirectory(join(root, 'public'), clientRoot)
  const media = await buildConfiguredPublicImages(root, clientRoot, config)
  const manifest: BuildManifest = {
    version: 1,
    routes: records,
    assets: await summarizeBuiltAssets(clientRoot),
    ...(media ? { media } : {}),
  }
  await writeFile(
    join(outputRoot, 'nexil-manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  )
  await writeFile(
    join(clientRoot, 'nexil-manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  )
  if (media) {
    await writeFile(
      join(outputRoot, 'nexil-media.json'),
      `${JSON.stringify(media, null, 2)}\n`,
      'utf8',
    )
    await writeFile(
      join(clientRoot, 'nexil-media.json'),
      `${JSON.stringify(media, null, 2)}\n`,
      'utf8',
    )
  }
  return manifest
}

async function readManifest(root: string): Promise<BuildManifest> {
  const manifest = JSON.parse(
    await readFile(join(root, 'dist', 'nexil-manifest.json'), 'utf8'),
  ) as BuildManifest
  if (manifest.version !== 1 || !Array.isArray(manifest.routes))
    throw new Error('Invalid Nexil build manifest.')
  return manifest
}

function configuredPort(config: NexilConfig): number {
  const environmentPort = process.env.NEXIL_PORT?.trim()
  const raw = environmentPort || config.server?.port
  if (raw === undefined) return 4173
  const port = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isInteger(port) || port < 0 || port > 65535)
    throw new RangeError('NEXIL_PORT must be an integer between 0 and 65535.')
  return port
}

async function startProduction(root: string): Promise<string> {
  const clientDir = join(root, 'dist', 'client')
  if (!existsSync(join(clientDir, 'index.html')))
    throw new Error('No production build found. Run `pnpm build` before `pnpm start`.')
  const config = await readNexilConfig(root)
  const serverConfig = config.server ?? {}
  const host = process.env.NEXIL_HOST ?? serverConfig.host ?? '0.0.0.0'
  const port = configuredPort(config)
  const environmentOrigins = process.env.NEXIL_ACTION_ORIGINS
  const actionOrigins = environmentOrigins
    ? environmentOrigins
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
    : serverConfig.actionOrigins
  const production = createProductionServer(clientDir, {
    ...serverConfig,
    ...(config.redirects ? { redirects: config.redirects } : {}),
    host,
    port,
    serverDir: serverConfig.serverDir ?? join(root, 'dist', 'server', 'routes'),
    ...(actionOrigins ? { actionOrigins } : {}),
  })
  await production.listen()
  return `Nexil production server running at http://localhost:${port}/`
}

export async function runCli(argv: readonly string[], cwd = process.cwd()): Promise<string> {
  const parsed = parseCommand(argv)
  if (parsed.command === 'help') return helpText()
  if (parsed.command === 'create') {
    const { name, options } = parseScaffoldArgs(parsed.args)
    if (!name)
      throw new Error(
        'Usage: nexil create <name> [--yes] [--ts|--js] [--tailwind] [--template fullstack|blank|interactive|minimal|secure-node]',
      )
    return `Created ${(await scaffoldProject(name, cwd, options)).directory}`
  }

  const root = resolve(cwd)
  if (parsed.command === 'routes') {
    const routes = await discoverRoutes(join(root, 'src', 'routes'), join(root, 'src', 'routes'))
    return routes.join('\n')
  }
  if (parsed.command === 'analyze') {
    const manifest = await readManifest(root)
    return [
      'Route                         JS gzip   CSS bytes   Mode',
      ...manifest.routes.map(
        (route) =>
          `${route.route.padEnd(29)} ${String(route.clientJsGzipBytes).padStart(8)} ${String(route.cssBytes).padStart(10)}   ${route.interactive ? 'interactive' : 'static'}`,
      ),
      ...assetAnalysisLines(manifest.assets),
      ...mediaAnalysisLines(manifest.media),
    ].join('\n')
  }
  if (parsed.command === 'build') {
    await buildArtifacts(root)
    return 'Nexil build completed.'
  }
  if (parsed.command === 'check') {
    const manifest = await buildArtifacts(root)
    for (const route of manifest.routes) {
      assertBudget({
        route: route.route,
        interactive: route.interactive,
        clientJsGzipBytes: route.clientJsGzipBytes,
        bootstrapGzipBytes: route.bootstrapGzipBytes,
        navigationGzipBytes: route.navigationGzipBytes,
      })
    }
    return 'Nexil checks passed.'
  }
  if (parsed.command === 'dev') {
    const hostEnv = process.env.NEXIL_HOST
    const portEnv = process.env.NEXIL_PORT
    const server = await createServer({
      root,
      server: {
        ...(hostEnv ? { host: hostEnv } : {}),
        ...(portEnv ? { port: Number(portEnv) } : {}),
        ...(process.env.NEXIL_ALLOW_ALL_HOSTS === '1' ? { allowedHosts: true } : {}),
      },
      ...VITE_WORKSPACE_CONFIG,
      plugins: [nexil({ root }), nexilSSRPlugin(root)],
    })
    await server.listen()
    return `Nexil dev server running at ${server.resolvedUrls?.local?.[0] ?? 'local URL'}`
  }
  if (parsed.command === 'start' || parsed.command === 'preview' || parsed.command === 'serve')
    return startProduction(root)
  if (parsed.command === 'generate') {
    const [kind, name, ...rest] = parsed.args
    if (!kind || !name)
      throw new Error('Usage: nexil generate <route|component|store> <name> [--split|--unified]')
    if (['route', 'component'].includes(kind)) {
      if (rest.length > 0) throw new Error(`Unknown flag for generate ${kind}: ${rest.join(' ')}`)
      return `Created ${await scaffoldCliArtifact(root, kind, name)}`
    }
    if (kind === 'store') {
      const flags = rest
      const hasSplit = flags.includes('--split')
      const hasUnified = flags.includes('--unified')
      if (hasSplit && hasUnified)
        throw new Error('Cannot use both --split and --unified for store generation.')
      const variant = hasSplit ? 'split' : hasUnified ? 'unified' : 'unified'
      const unknownFlags = flags.filter((f) => f !== '--split' && f !== '--unified')
      if (unknownFlags.length > 0)
        throw new Error(`Unknown flag for generate store: ${unknownFlags.join(' ')}`)
      const files = await scaffoldStore(root, name, variant as 'split' | 'unified')
      return `Created ${files.join(', ')}`
    }
    throw new Error('Usage: nexil generate <route|component|store> <name> [--split|--unified]')
  }
  if (parsed.command === 'add') {
    const [kind, name] = parsed.args
    if (kind !== 'action' || !name) throw new Error('Usage: nexil add action <name>')
    return `Created ${await scaffoldCliArtifact(root, kind, name)}`
  }
  if (parsed.command === 'doctor') {
    if (parsed.args.some((argument) => argument !== '--json'))
      throw new Error('Usage: nexil doctor [--json]')
    const report = await diagnoseProject(root)
    return parsed.args.includes('--json')
      ? `${JSON.stringify(report, null, 2)}\n`
      : formatDoctorReport(report)
  }
  if (parsed.command === 'upgrade') return migrationReport(root)
  if (parsed.command === 'test') {
    const result = await execFileAsync('pnpm', ['test', ...parsed.args], { cwd: root })
    return result.stdout.trim() || result.stderr.trim() || 'Nexil tests passed.'
  }
  // Keep the command exhaustive if a new command is added to NexilCommand.
  const unreachable: never = parsed.command
  return unreachable
}

export async function createProject(name: string, parent = process.cwd()): Promise<string> {
  return (await scaffoldProject(name, parent, { yes: true })).directory
}
