import { gzipSync } from 'node:zlib'
import { existsSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, extname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build, createServer, transformWithEsbuild } from 'vite'
import type { Child } from '@mohammedaydan/core'
import { assertBudget } from '@mohammedaydan/compiler'
import nexis, {
  RESUMABILITY_BINDINGS,
  RESUMABILITY_BOOTSTRAP,
  RESUMABILITY_FORMS,
  transformNexisSource,
} from '@mohammedaydan/vite-plugin'
import { escapeHtml, renderToString } from '@mohammedaydan/renderer'
import { generateOgImage } from '@mohammedaydan/og-image'
import {
  buildRobots,
  buildSitemap,
  deriveBreadcrumbList,
  generateAtomFeed,
  generateFeed,
  renderHead,
  withCanonical,
} from '@mohammedaydan/seo'
import { matchRoute, routeFromFile } from '@mohammedaydan/router'
import { nexisSSRPlugin } from '@mohammedaydan/dev-server'
import { createServer as createProductionServer } from '@mohammedaydan/serve'
import type { NexisConfig, RedirectRule } from '@mohammedaydan/serve'
import type { SeoMetadata } from '@mohammedaydan/seo'
export { parseScaffoldArgs, scaffoldProject } from './scaffold.js'
import { parseScaffoldArgs, scaffoldProject } from './scaffold.js'

const FRAMEWORK_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

function workspaceAliases(): readonly { readonly find: string; readonly replacement: string }[] {
  if (!existsSync(join(FRAMEWORK_ROOT, 'pnpm-workspace.yaml'))) return []
  const packages = ['core', 'jsx-runtime', 'reactivity']
  return packages.flatMap((name) => {
    const source = join(FRAMEWORK_ROOT, 'packages', name, 'src', 'index.ts')
    if (!existsSync(source)) return []
    if (name === 'jsx-runtime') {
      return [
        {
          find: '@mohammedaydan/jsx-runtime/jsx-dev-runtime',
          replacement: join(FRAMEWORK_ROOT, 'packages/jsx-runtime/src/jsx-runtime.ts'),
        },
        {
          find: '@mohammedaydan/jsx-runtime/jsx-runtime',
          replacement: join(FRAMEWORK_ROOT, 'packages/jsx-runtime/src/jsx-runtime.ts'),
        },
        { find: '@mohammedaydan/jsx-runtime', replacement: source },
      ]
    }
    return [{ find: `@mohammedaydan/${name}`, replacement: source }]
  })
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
  readonly default?: Child | ((props: Readonly<Record<string, unknown>>) => Child | Promise<Child>)
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

export type NexisCommand =
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
  readonly command: NexisCommand | 'help'
  readonly args: readonly string[]
}

const commands = new Set<NexisCommand>([
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
  if (!commands.has(first as NexisCommand))
    throw new Error(`Unknown Nexis command: ${first}. Run nexis --help.`)
  return { command: first as NexisCommand, args }
}

export function helpText(): string {
  return [
    'Nexis — HTML-first TypeScript framework',
    '',
    'Usage: nexis <command>',
    '',
    'Commands:',
    '  create <name>  Create a zero-config Nexis application',
    '                 Flags: --yes --ts --js --tailwind',
    '  dev            Start the development server',
    '                 Env: NEXIS_HOST, NEXIS_PORT, NEXIS_ALLOW_ALL_HOSTS=1',
    '  build          Build SSG/ISR/SSR bundles',
    '  start          Start the route-aware production build',
    '  preview        Preview a production build (alias for start)',
    '  serve          Alias for start (kept for compatibility)',
    '  check          Run type, route, SEO, and boundary checks',
    '  analyze        Report route output and client budgets',
    '  routes         List discovered routes',
    '  generate route <name>       Scaffold a route',
    '  generate component <name>  Scaffold a component',
    '  add action <name>           Scaffold a server action',
    '  doctor         Diagnose common project configuration issues',
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
      `import { action } from '@mohammedaydan/actions'\n\nexport const ${normalized.split('/').at(-1)} = action({\n  validate: (input: unknown) => input,\n  async handle(_context, input) {\n    return { input }\n  },\n})\n`,
      'utf8',
    )
    return relative(root, file).split(sep).join('/')
  }
  throw new Error(`Unknown generator kind: ${kind}`)
}

async function diagnoseProject(root: string): Promise<string> {
  const checks: string[] = []
  const routes = join(root, 'src', 'routes')
  checks.push(
    existsSync(join(root, 'package.json')) ? 'ok package.json' : 'error missing package.json',
  )
  checks.push(existsSync(routes) ? 'ok src/routes' : 'error missing src/routes')
  checks.push(
    existsSync(join(root, 'index.html'))
      ? 'ok index.html'
      : 'warn missing index.html (fallback template will be used)',
  )
  try {
    await readNexisConfig(root)
    checks.push('ok Nexis configuration')
  } catch (error) {
    checks.push(`error configuration: ${error instanceof Error ? error.message : String(error)}`)
  }
  return checks.join('\\n')
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

interface BuildManifest {
  readonly version: 1
  readonly routes: readonly BuildRouteRecord[]
  readonly assets?: BuildAssetSummary
}

async function readNexisConfig(root: string): Promise<NexisConfig> {
  try {
    const parsed = JSON.parse(await readFile(join(root, 'nexis.config.json'), 'utf8')) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      throw new TypeError('Invalid nexis.config.json.')
    return parsed as NexisConfig
  } catch (error) {
    if (error instanceof SyntaxError) throw new TypeError('Invalid nexis.config.json.')
    if (error instanceof TypeError) throw error
    if ((error as { readonly code?: string }).code !== 'ENOENT') throw error
  }
  for (const fileName of ['nexis.config.mjs', 'nexis.config.js', 'nexis.config.ts']) {
    const file = join(root, fileName)
    if (!existsSync(file)) continue
    const source = await readFile(file, 'utf8')
    const code = fileName.endsWith('.ts')
      ? (await transformWithEsbuild(source, fileName, { loader: 'ts', format: 'esm' })).code
      : source
    const temporary = join(root, 'dist', `.nexis-config-${Date.now()}.mjs`)
    await mkdir(join(root, 'dist'), { recursive: true })
    await writeFile(temporary, code, 'utf8')
    const module = await import(`${pathToFileURL(temporary).href}?nexis-config=${Date.now()}`)
    const config = module.default ?? module.config ?? module
    if (!config || typeof config !== 'object' || Array.isArray(config))
      throw new TypeError(`Invalid ${fileName}.`)
    return config as NexisConfig
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

const BOOTSTRAP_FILE = 'nexis-bootstrap.js'
const CHUNK_DIRECTORY = 'nexis-chunks'

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
  const config = await readNexisConfig(root)
  const siteOrigin = process.env.NEXIS_SITE_ORIGIN ?? config.app?.origin ?? 'http://localhost:4173'
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
    template = `<!DOCTYPE html><html lang="en"><head><!--nexis-head-outlet--></head><body><div id="app"><!--nexis-app-outlet--></div><!--nexis-scripts-outlet--></body></html>`
  }

  try {
    await readFile(join(root, 'src', 'styles.css'), 'utf8')
    const clientBuild = await build({
      root,
      ...VITE_WORKSPACE_CONFIG,
      plugins: [nexis({ root })],
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
      plugins: [nexis({ root })],
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
    const module = await import(`${pathToFileURL(serverModulePath).href}?nexis=${Date.now()}`)
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
  ): Promise<Child> {
    let current = child
    const layouts = await discoverLayouts(route)
    for (const layout of layouts) {
      const module = await loadServerModule(layout)
      const Layout = module.default
      if (typeof Layout === 'function') current = await Layout({ ...props, children: current })
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

  const records: BuildRouteRecord[] = []
  const feedItems: Array<{ title: string; link: string; description?: string }> = []
  const cssAssets = new Set<string>()
  const emittedChunks = new Set<string>()
  let hasInteractiveRoute = false
  let hasBindingRoute = false
  let hasFormRoute = false
  const minifiedBootstrap = (
    await transformWithEsbuild(RESUMABILITY_BOOTSTRAP, BOOTSTRAP_FILE, {
      loader: 'js',
      minify: true,
    })
  ).code
  const bootstrapGzipBytes = gzipSync(Buffer.from(minifiedBootstrap)).byteLength

  for (const route of routes) {
    const sourcePath = join(routeRoot, route)
    const sourceModules = await collectSourceModules(sourcePath)
    const transformedModules = await Promise.all(
      sourceModules.map(async (modulePath) => ({
        modulePath,
        result: await transformNexisSource(await readFile(modulePath, 'utf8'), modulePath),
      })),
    )
    const direct = transformedModules.find((entry) => entry.modulePath === resolve(sourcePath))
    if (!direct) throw new Error(`Nexis build could not transform route ${route}.`)
    const routeChunks = new Map<string, (typeof direct.result.chunks)[number]>()
    const routeCss = new Set<string>()
    const routeBindings = transformedModules.flatMap((entry) => entry.result.bindings)
    for (const entry of transformedModules) {
      for (const chunk of entry.result.chunks) routeChunks.set(chunk.fileName, chunk)
      for (const css of entry.result.css) routeCss.add(css)
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
      const minified = await transformWithEsbuild(chunk.source, chunk.fileName, {
        loader: 'js',
        minify: true,
      })
      if (!emittedChunks.has(chunk.fileName)) {
        emittedChunks.add(chunk.fileName)
        await writeFile(join(chunkRoot, chunk.fileName), minified.code, 'utf8')
        const chunkClientPath = join(clientRoot, CHUNK_DIRECTORY, chunk.fileName)
        await mkdir(join(clientRoot, CHUNK_DIRECTORY), { recursive: true })
        await writeFile(chunkClientPath, minified.code, 'utf8')
      }
      clientBytes += Buffer.byteLength(minified.code)
    }
    for (const css of transformed.css) cssAssets.add(css)
    const routeTemplate =
      transformed.css.length > 0 ? injectStylesheetLink(template, '/assets/nexis.css') : template
    const routeName = route
      .replace(/\\/g, '/')
      .replace(/\.(tsx|jsx|ts|js)$/, '')
      .replace(/\/index$/, '')
    const routePath = routeName === 'index' ? '/' : `/${routeName}`
    const interactive = transformed.chunks.length > 0 || transformed.bindings.length > 0
    hasInteractiveRoute ||= interactive
    hasBindingRoute ||= transformed.bindings.length > 0

    let renderedHtml = ''
    let headHtml = '<title>Nexis App</title>'
    let scriptsHtml = interactive ? `<script type="module" src="/${BOOTSTRAP_FILE}"></script>` : ''
    if (transformed.bindings.length > 0)
      scriptsHtml += `<script type="module" src="/nexis-bindings.js"></script>`
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
              description: String(routeSeo.description ?? '') || 'Nexis application route.',
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
      if (typeof Component === 'function') {
        const result = await Component({})
        renderedHtml = renderToString(await applyLayouts(route, result))
      } else if (Component) {
        renderedHtml = renderToString(Component)
      } else {
        throw new TypeError(`Route ${routePath} does not export a renderable default component.`)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw new Error(`SSR failed for ${routePath}: ${message}`, { cause: err })
    }

    if (renderedHtml.includes('data-nx-form="progressive"')) {
      hasFormRoute = true
      scriptsHtml += `<script type="module" src="/nexis-forms.js"></script>`
    }
    const html = sanitizeDocument(
      routeTemplate
        .replace('<!--nexis-head-outlet-->', headHtml)
        .replace('<!--nexis-app-outlet-->', renderedHtml)
        .replace('<!--nexis-scripts-outlet-->', scriptsHtml),
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
          const generatedResult =
            typeof GeneratedComponent === 'function'
              ? await GeneratedComponent(generatedMatch?.params ?? {})
              : GeneratedComponent
          const generatedRenderedHtml = renderToString(
            await applyLayouts(route, generatedResult, generatedMatch?.params ?? {}),
          )
          let generatedSeo = await resolveInheritedSeo(route, staticModule, generatedPath)
          if (generatedSeo && !generatedSeo.image) {
            const og = await generateOgImage(
              {
                title: String(generatedSeo.title),
                description: String(generatedSeo.description ?? '') || 'Nexis application route.',
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
          const generatedScriptsHtml = generatedRenderedHtml.includes('data-nx-form="progressive"')
            ? `${scriptsHtml}<script type="module" src="/nexis-forms.js"></script>`
            : scriptsHtml
          if (generatedRenderedHtml.includes('data-nx-form="progressive"')) hasFormRoute = true
          const generatedHtml = sanitizeDocument(
            routeTemplate
              .replace('<!--nexis-head-outlet-->', generatedHead)
              .replace('<!--nexis-app-outlet-->', generatedRenderedHtml)
              .replace('<!--nexis-scripts-outlet-->', generatedScriptsHtml),
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
    await writeFile(join(assetRoot, 'nexis.css'), cssContent, 'utf8')
  }
  if (hasInteractiveRoute) {
    await writeFile(join(outputRoot, BOOTSTRAP_FILE), minifiedBootstrap, 'utf8')
    await writeFile(join(clientRoot, BOOTSTRAP_FILE), minifiedBootstrap, 'utf8')
  }
  if (hasFormRoute) {
    const minifiedForms = (
      await transformWithEsbuild(RESUMABILITY_FORMS, 'nexis-forms.js', {
        loader: 'js',
        minify: true,
      })
    ).code
    await writeFile(join(outputRoot, 'nexis-forms.js'), minifiedForms, 'utf8')
    await writeFile(join(clientRoot, 'nexis-forms.js'), minifiedForms, 'utf8')
  }
  if (hasBindingRoute) {
    const minifiedBindings = (
      await transformWithEsbuild(RESUMABILITY_BINDINGS, 'nexis-bindings.js', {
        loader: 'js',
        minify: true,
      })
    ).code
    await writeFile(join(outputRoot, 'nexis-bindings.js'), minifiedBindings, 'utf8')
    await writeFile(join(clientRoot, 'nexis-bindings.js'), minifiedBindings, 'utf8')
  }
  const sitemap = buildSitemap(
    records.map((record) => ({
      url: `${siteOrigin.replace(/\/$/, '')}${record.route === '/' ? '/' : record.route}`,
      changeFrequency: 'weekly' as const,
    })),
  )
  await writeFile(join(clientRoot, 'sitemap.xml'), sitemap, 'utf8')
  const feed = generateFeed(feedItems, {
    title: config.feed?.title ?? 'Nexis Updates',
    link: `${siteOrigin.replace(/\/$/, '')}/`,
    description: config.feed?.description ?? 'Nexis application routes and updates.',
    ...(config.feed?.language ? { language: config.feed.language } : {}),
    feedUrl: `${siteOrigin.replace(/\/$/, '')}/feed.xml`,
  })
  await writeFile(join(clientRoot, 'feed.xml'), feed, 'utf8')
  const atom = generateAtomFeed(feedItems, {
    title: config.feed?.title ?? 'Nexis Updates',
    link: `${siteOrigin.replace(/\/$/, '')}/`,
    description: config.feed?.description ?? 'Nexis application routes and updates.',
    ...(config.feed?.language ? { language: config.feed.language } : {}),
    feedUrl: `${siteOrigin.replace(/\/$/, '')}/atom.xml`,
  })
  await writeFile(join(clientRoot, 'atom.xml'), atom, 'utf8')
  await writeFile(
    join(outputRoot, 'nexis-redirects.json'),
    `${JSON.stringify(config.redirects ?? [], null, 2)}\n`,
    'utf8',
  )
  await writeFile(
    join(clientRoot, 'robots.txt'),
    buildRobots(`${siteOrigin.replace(/\/$/, '')}/sitemap.xml`),
    'utf8',
  )
  await copyPublicDirectory(join(root, 'public'), clientRoot)
  const manifest: BuildManifest = {
    version: 1,
    routes: records,
    assets: await summarizeBuiltAssets(clientRoot),
  }
  await writeFile(
    join(outputRoot, 'nexis-manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  )
  await writeFile(
    join(clientRoot, 'nexis-manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  )
  return manifest
}

async function readManifest(root: string): Promise<BuildManifest> {
  const manifest = JSON.parse(
    await readFile(join(root, 'dist', 'nexis-manifest.json'), 'utf8'),
  ) as BuildManifest
  if (manifest.version !== 1 || !Array.isArray(manifest.routes))
    throw new Error('Invalid Nexis build manifest.')
  return manifest
}

function configuredPort(config: NexisConfig): number {
  const environmentPort = process.env.NEXIS_PORT?.trim()
  const raw = environmentPort || config.server?.port
  if (raw === undefined) return 4173
  const port = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isInteger(port) || port < 0 || port > 65535)
    throw new RangeError('NEXIS_PORT must be an integer between 0 and 65535.')
  return port
}

async function startProduction(root: string): Promise<string> {
  const clientDir = join(root, 'dist', 'client')
  if (!existsSync(join(clientDir, 'index.html')))
    throw new Error('No production build found. Run `pnpm build` before `pnpm start`.')
  const config = await readNexisConfig(root)
  const serverConfig = config.server ?? {}
  const host = process.env.NEXIS_HOST ?? serverConfig.host ?? '0.0.0.0'
  const port = configuredPort(config)
  const environmentOrigins = process.env.NEXIS_ACTION_ORIGINS
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
  return `Nexis production server running at http://localhost:${port}/`
}

export async function runCli(argv: readonly string[], cwd = process.cwd()): Promise<string> {
  const parsed = parseCommand(argv)
  if (parsed.command === 'help') return helpText()
  if (parsed.command === 'create') {
    const { name, options } = parseScaffoldArgs(parsed.args)
    if (!name) throw new Error('Usage: nexis create <name> [--yes] [--ts|--js] [--tailwind]')
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
    ].join('\n')
  }
  if (parsed.command === 'build') {
    await buildArtifacts(root)
    return 'Nexis build completed.'
  }
  if (parsed.command === 'check') {
    const manifest = await buildArtifacts(root)
    for (const route of manifest.routes) {
      assertBudget({
        route: route.route,
        interactive: route.interactive,
        clientJsGzipBytes: route.clientJsGzipBytes,
        bootstrapGzipBytes: route.bootstrapGzipBytes,
      })
    }
    return 'Nexis checks passed.'
  }
  if (parsed.command === 'dev') {
    const server = await createServer({
      root,
      server: {
        ...(process.env.NEXIS_HOST ? { host: process.env.NEXIS_HOST } : {}),
        ...(process.env.NEXIS_PORT ? { port: Number(process.env.NEXIS_PORT) } : {}),
        ...(process.env.NEXIS_ALLOW_ALL_HOSTS === '1' ? { allowedHosts: true } : {}),
      },
      ...VITE_WORKSPACE_CONFIG,
      plugins: [nexis({ root }), nexisSSRPlugin(root)],
    })
    await server.listen()
    return `Nexis dev server running at ${server.resolvedUrls?.local?.[0] ?? 'local URL'}`
  }
  if (parsed.command === 'start' || parsed.command === 'preview' || parsed.command === 'serve')
    return startProduction(root)
  if (parsed.command === 'generate') {
    const [kind, name] = parsed.args
    if (!kind || !name || !['route', 'component'].includes(kind))
      throw new Error('Usage: nexis generate <route|component> <name>')
    return `Created ${await scaffoldCliArtifact(root, kind, name)}`
  }
  if (parsed.command === 'add') {
    const [kind, name] = parsed.args
    if (kind !== 'action' || !name) throw new Error('Usage: nexis add action <name>')
    return `Created ${await scaffoldCliArtifact(root, kind, name)}`
  }
  if (parsed.command === 'doctor') return diagnoseProject(root)
  if (parsed.command === 'upgrade') return migrationReport(root)
  if (parsed.command === 'test') {
    const result = await execFileAsync('pnpm', ['test', ...parsed.args], { cwd: root })
    return result.stdout.trim() || result.stderr.trim() || 'Nexis tests passed.'
  }
  // Keep the command exhaustive if a new command is added to NexisCommand.
  const unreachable: never = parsed.command
  return unreachable
}

export async function createProject(name: string, parent = process.cwd()): Promise<string> {
  return (await scaffoldProject(name, parent, { yes: true })).directory
}
