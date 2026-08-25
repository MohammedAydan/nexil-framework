import { gzipSync } from 'node:zlib'
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import { build, createServer, preview } from 'vite'
import { assertBudget, checkBudget } from '@mohammedaydan/compiler'
import nexis, { RESUMABILITY_BOOTSTRAP, transformNexisSource } from '@mohammedaydan/vite-plugin'
import { renderToString } from '@mohammedaydan/renderer'
import { renderHead } from '@mohammedaydan/seo'
import { matchRoute, routeFromFile } from '@mohammedaydan/router'
import { nexisSSRPlugin } from '@mohammedaydan/dev-server'
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

const BOOTSTRAP_FILE = 'nexis-bootstrap.js'
const CHUNK_DIRECTORY = 'nexis-chunks'

function injectStylesheetLink(template: string, href: string): string {
  const link = `<link rel="stylesheet" href="${href}">`
  if (template.includes(`href="${href}"`) || template.includes(`href='${href}'`)) return template
  if (template.includes('</head>')) return template.replace('</head>', `  ${link}\n</head>`)
  return `${link}${template}`
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
  module: any,
): Promise<readonly string[]> {
  const exported =
    typeof module.getStaticPaths === 'function' ? await module.getStaticPaths() : module.staticPaths
  if (!Array.isArray(exported) || exported.length === 0) return [routePath]
  return exported.map((value: StaticPathValue) => staticPathToRoute(pattern, value))
}

async function buildArtifacts(root: string): Promise<BuildManifest> {
  const routeRoot = join(root, 'src', 'routes')
  const routes = await discoverRoutes(routeRoot, routeRoot)
  if (routes.length === 0) throw new Error(`No routes found in ${routeRoot}.`)
  const outputRoot = join(root, 'dist')
  await rm(outputRoot, { recursive: true, force: true })
  const serverRoot = join(outputRoot, 'server', 'routes')
  const chunkRoot = join(outputRoot, CHUNK_DIRECTORY)
  const clientRoot = join(outputRoot, 'client')
  const assetRoot = join(clientRoot, 'assets')
  await mkdir(serverRoot, { recursive: true })
  await mkdir(chunkRoot, { recursive: true })
  await mkdir(assetRoot, { recursive: true })
  await mkdir(clientRoot, { recursive: true })

  let template: string
  try {
    template = await readFile(join(root, 'index.html'), 'utf8')
  } catch {
    template = `<!DOCTYPE html><html lang="en"><head><!--nexis-head-outlet--></head><body><div id="app"><!--nexis-app-outlet--></div><!--nexis-scripts-outlet--></body></html>`
  }

  const vite = await createServer({
    root,
    plugins: [nexis({ root })],
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  })
  await vite.pluginContainer.buildStart({} as any)

  let processedAppCss: string | undefined
  try {
    await readFile(join(root, 'src', 'styles.css'), 'utf8')
    processedAppCss = (await vite.transformRequest('/src/styles.css'))?.code
    if (processedAppCss) {
      await writeFile(join(assetRoot, 'styles.css'), processedAppCss, 'utf8')
      template = template.replaceAll('/src/styles.css', '/assets/styles.css')
      template = injectStylesheetLink(template, '/assets/styles.css')
    }
  } catch {
    // Tailwind is opt-in; applications without src/styles.css need no CSS transform.
  }

  const records: BuildRouteRecord[] = []
  const cssAssets = new Set<string>()
  let hasInteractiveRoute = false
  const bootstrapGzipBytes = gzipSync(Buffer.from(RESUMABILITY_BOOTSTRAP)).byteLength

  for (const route of routes) {
    const sourcePath = join(routeRoot, route)
    const source = await readFile(sourcePath, 'utf8')
    const transformed = await transformNexisSource(source, sourcePath)
    const outputName = route.replace(/\\/g, '/').replace(/\.(tsx|jsx|ts|js)$/, '.js')
    await mkdir(join(serverRoot, outputName, '..'), { recursive: true })
    await writeFile(join(serverRoot, outputName), transformed.code, 'utf8')
    let clientBytes = 0
    for (const chunk of transformed.chunks) {
      await writeFile(join(chunkRoot, chunk.fileName), chunk.source, 'utf8')
      clientBytes += Buffer.byteLength(chunk.source)
      const chunkClientPath = join(clientRoot, CHUNK_DIRECTORY, chunk.fileName)
      await mkdir(join(clientRoot, CHUNK_DIRECTORY), { recursive: true })
      await writeFile(chunkClientPath, chunk.source, 'utf8')
    }
    for (const css of transformed.css) cssAssets.add(css)
    if (transformed.css.length > 0) template = injectStylesheetLink(template, '/assets/nexis.css')
    const routeName = route
      .replace(/\\/g, '/')
      .replace(/\.(tsx|jsx|ts|js)$/, '')
      .replace(/\/index$/, '')
    const routePath = routeName === 'index' ? '/' : `/${routeName}`
    const interactive = transformed.chunks.length > 0
    hasInteractiveRoute ||= interactive

    let renderedHtml = ''
    let headHtml = '<title>Nexis App</title>'
    let scriptsHtml = interactive ? `<script type="module" src="/${BOOTSTRAP_FILE}"></script>` : ''
    try {
      const modulePath = `/src/routes/${route.replace(/\\/g, '/')}`
      const mod: any = await vite.ssrLoadModule(modulePath)
      if (mod.seo) {
        try {
          headHtml = renderHead(mod.seo)
        } catch {
          headHtml = mod.seo.title ? `<title>${mod.seo.title}</title>` : headHtml
        }
      }
      if (mod.render?.mode) {
        // Support render mode export for future use
      }
      const Component = mod.default
      if (typeof Component === 'function') {
        const result = await Component({})
        renderedHtml = renderToString(result)
      } else if (Component) {
        renderedHtml = renderToString(Component)
      } else {
        renderedHtml = renderToString(transformed.code as any)
      }
    } catch (err) {
      try {
        renderedHtml = `<div data-nexis-fallback>Static fallback for ${routePath}</div>`
        console.warn(`SSR failed for ${routePath}:`, (err as Error).message)
      } catch {}
    }

    const html = template
      .replace('<!--nexis-head-outlet-->', headHtml)
      .replace('<!--nexis-app-outlet-->', renderedHtml)
      .replace('<!--nexis-scripts-outlet-->', scriptsHtml)

    const outDir = routePath === '/' ? clientRoot : join(clientRoot, routePath.slice(1))
    await mkdir(outDir, { recursive: true })
    await writeFile(join(outDir, 'index.html'), html, 'utf8')

    const previewDir = routePath === '/' ? outputRoot : join(outputRoot, routePath.slice(1))
    await mkdir(previewDir, { recursive: true })
    await writeFile(join(previewDir, 'index.html'), html, 'utf8')

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
        const staticModule: any = await vite.ssrLoadModule(
          `/src/routes/${route.replace(/\\/g, '/')}`,
        )
        const staticPaths = await resolveStaticPaths(routeRecord.pattern, routePath, staticModule)
        if (staticPaths.some((generatedPath) => generatedPath !== routePath)) {
          await rm(join(clientRoot, routePath.slice(1)), { recursive: true, force: true })
          await rm(join(outputRoot, routePath.slice(1)), { recursive: true, force: true })
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
          const generatedRenderedHtml = renderToString(generatedResult)
          const generatedHead = staticModule.seo ? renderHead(staticModule.seo) : headHtml
          const generatedHtml = template
            .replace('<!--nexis-head-outlet-->', generatedHead)
            .replace('<!--nexis-app-outlet-->', generatedRenderedHtml)
            .replace('<!--nexis-scripts-outlet-->', scriptsHtml)
          const generatedDirectory = join(clientRoot, generatedPath.slice(1))
          await mkdir(generatedDirectory, { recursive: true })
          await writeFile(join(generatedDirectory, 'index.html'), generatedHtml, 'utf8')
          const generatedPreviewDirectory = join(outputRoot, generatedPath.slice(1))
          await mkdir(generatedPreviewDirectory, { recursive: true })
          await writeFile(join(generatedPreviewDirectory, 'index.html'), generatedHtml, 'utf8')
          records.push({ route: generatedPath, ...routeMetrics })
        }
      } catch (error) {
        console.warn(`Static path generation failed for ${routePath}:`, (error as Error).message)
      }
    }
  }

  await vite.close()

  if (cssAssets.size > 0) {
    const cssContent = [...cssAssets].join('')
    await writeFile(join(assetRoot, 'nexis.css'), cssContent, 'utf8')
    template = injectStylesheetLink(template, '/assets/nexis.css')
  }
  if (hasInteractiveRoute) {
    await writeFile(join(outputRoot, BOOTSTRAP_FILE), RESUMABILITY_BOOTSTRAP, 'utf8')
    await writeFile(join(clientRoot, BOOTSTRAP_FILE), RESUMABILITY_BOOTSTRAP, 'utf8')
  }
  const manifest: BuildManifest = { version: 1, routes: records }
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
    const server = await createServer({ root, plugins: [nexis({ root }), nexisSSRPlugin(root)] })
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
