import { gzipSync } from 'node:zlib'
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import { build, createServer, preview } from 'vite'
import { assertBudget, checkBudget } from '@nexis/compiler'
import nexis, { transformNexisSource } from '@nexis/vite-plugin'
export { parseScaffoldArgs, scaffoldProject } from './scaffold.js'
import { parseScaffoldArgs, scaffoldProject } from './scaffold.js'

export type NexisCommand = 'create' | 'dev' | 'build' | 'start' | 'check' | 'analyze' | 'routes'

export interface ParsedCommand {
  readonly command: NexisCommand | 'help'
  readonly args: readonly string[]
}

const commands = new Set<NexisCommand>([
  'create',
  'dev',
  'build',
  'start',
  'check',
  'analyze',
  'routes',
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
    '  build          Build SSG/ISR/SSR bundles',
    '  start          Start a production build',
    '  check          Run type, route, SEO, and boundary checks',
    '  analyze        Report route output and client budgets',
    '  routes         List discovered routes',
  ].join('\n')
}

function assertProjectName(name: string): void {
  if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(name) || name === 'node_modules') {
    throw new TypeError(
      'Project name must be 1–64 characters, start with a letter, and contain no path separators.',
    )
  }
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

interface BuildManifest {
  readonly version: 1
  readonly routes: readonly BuildRouteRecord[]
}

const RESUMABILITY_BOOTSTRAP = `const elements = document.querySelectorAll('[data-nx-on-click]');
for (const element of elements) {
  const reference = element.dataset.nxOnClick;
  if (!reference) continue;
  const separator = reference.indexOf('#');
  if (separator < 1) continue;
  const chunk = reference.slice(0, separator);
  const exportName = reference.slice(separator + 1);
  element.addEventListener('click', async () => {
    const module = await import('./chunks/' + chunk);
    const handler = module[exportName];
    if (typeof handler !== 'function') throw new TypeError('Missing resumable handler export: ' + exportName);
    await handler({ element });
  });
}
`

async function discoverRoutes(directory: string, root: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const routes: string[] = []
  for (const entry of entries) {
    const file = join(directory, entry.name)
    if (entry.isDirectory()) routes.push(...(await discoverRoutes(file, root)))
    else if (/\.(tsx|jsx|ts|js)$/.test(entry.name) && !entry.name.startsWith('layout.'))
      routes.push(relative(root, file))
  }
  return routes.sort()
}

async function buildArtifacts(root: string): Promise<BuildManifest> {
  const routeRoot = join(root, 'src', 'routes')
  const routes = await discoverRoutes(routeRoot, routeRoot)
  if (routes.length === 0) throw new Error(`No routes found in ${routeRoot}.`)
  const outputRoot = join(root, 'dist')
  await rm(outputRoot, { recursive: true, force: true })
  const serverRoot = join(outputRoot, 'server', 'routes')
  const chunkRoot = join(outputRoot, 'client', 'chunks')
  const assetRoot = join(outputRoot, 'client', 'assets')
  await mkdir(serverRoot, { recursive: true })
  await mkdir(chunkRoot, { recursive: true })
  await mkdir(assetRoot, { recursive: true })
  const records: BuildRouteRecord[] = []
  const cssAssets = new Set<string>()
  const bootstrapGzipBytes = gzipSync(Buffer.from(RESUMABILITY_BOOTSTRAP)).byteLength
  let hasInteractiveRoute = false
  for (const route of routes) {
    const sourcePath = join(routeRoot, route)
    const source = await readFile(sourcePath, 'utf8')
    const transformed = transformNexisSource(source, sourcePath)
    const outputName = route.replace(/\\/g, '/').replace(/\.(tsx|jsx|ts|js)$/, '.js')
    await mkdir(join(serverRoot, outputName, '..'), { recursive: true })
    await writeFile(join(serverRoot, outputName), transformed.code, 'utf8')
    let clientBytes = 0
    for (const chunk of transformed.chunks) {
      await writeFile(join(chunkRoot, chunk.fileName), chunk.source, 'utf8')
      clientBytes += Buffer.byteLength(chunk.source)
    }
    for (const css of transformed.css) cssAssets.add(css)
    const routeName = route
      .replace(/\\/g, '/')
      .replace(/\.(tsx|jsx|ts|js)$/, '')
      .replace(/\/index$/, '')
    const routePath = routeName === 'index' ? '/' : `/${routeName}`
    const interactive = transformed.chunks.length > 0
    hasInteractiveRoute ||= interactive
    records.push({
      route: routePath === '/' ? '/' : routePath,
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
    })
  }
  if (cssAssets.size > 0)
    await writeFile(join(assetRoot, 'nexis.css'), [...cssAssets].join(''), 'utf8')
  if (hasInteractiveRoute)
    await writeFile(join(outputRoot, 'client', 'bootstrap.js'), RESUMABILITY_BOOTSTRAP, 'utf8')
  const manifest: BuildManifest = { version: 1, routes: records }
  await writeFile(
    join(outputRoot, 'nexis-manifest.json'),
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
    const server = await createServer({ root, plugins: [nexis({ root })] })
    await server.listen()
    return `Nexis dev server running at ${server.resolvedUrls?.local?.[0] ?? 'local URL'}`
  }
  if (parsed.command === 'start') {
    const server = await preview({ root })
    return `Nexis production server running at ${server.resolvedUrls?.local?.[0] ?? 'local URL'}`
  }
  // Keep the command exhaustive if a new command is added to NexisCommand.
  const unreachable: never = parsed.command
  return unreachable
}

export async function createProject(name: string, parent = process.cwd()): Promise<string> {
  return (await scaffoldProject(name, parent, { yes: true })).directory
}
