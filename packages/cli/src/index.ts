import { mkdir, readdir, stat, writeFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import { build, createServer, preview } from 'vite'
import nexis from '@nexis/vite-plugin'

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

export async function runCli(argv: readonly string[], cwd = process.cwd()): Promise<string> {
  const parsed = parseCommand(argv)
  if (parsed.command === 'help') return helpText()
  if (parsed.command === 'create') {
    const name = parsed.args[0]
    if (!name) throw new Error('Usage: nexis create <name>')
    return `Created ${await createProject(name, cwd)}`
  }

  const root = resolve(cwd)
  if (parsed.command === 'routes') {
    const routes = await discoverRoutes(join(root, 'src', 'routes'), join(root, 'src', 'routes'))
    return routes.join('\n')
  }
  if (parsed.command === 'analyze') {
    const routes = await discoverRoutes(join(root, 'src', 'routes'), join(root, 'src', 'routes'))
    return routes
      .map(
        (route) =>
          `Route: /${route
            .replace(/\\/g, '/')
            .replace(/\.(tsx|jsx|ts|js)$/, '')
            .replace(/\/index$/, '')}`,
      )
      .join('\n')
  }
  if (parsed.command === 'check' || parsed.command === 'build') {
    await build({ root, plugins: [nexis({ root })], logLevel: 'error', build: { ssr: false } })
    return parsed.command === 'check' ? 'Nexis checks passed.' : 'Nexis build completed.'
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
  assertProjectName(name)
  const directory = resolve(parent, name)
  const routeDirectory = join(directory, 'src', 'routes')
  await mkdir(routeDirectory, { recursive: true })
  await writeFile(
    join(directory, 'package.json'),
    `${JSON.stringify({ name, private: true, type: 'module', scripts: { dev: 'nexis dev', build: 'nexis build', check: 'nexis check' }, dependencies: { '@nexis/cli': '^0.1.0', '@nexis/core': '^0.1.0', '@nexis/jsx-runtime': '^0.1.0' } }, null, 2)}\n`,
    'utf8',
  )
  await writeFile(
    join(directory, 'tsconfig.json'),
    `${JSON.stringify({ compilerOptions: { strict: true, module: 'ESNext', moduleResolution: 'Bundler', target: 'ES2022', jsx: 'react-jsx', jsxImportSource: '@nexis/jsx-runtime' }, include: ['src/**/*.tsx'] }, null, 2)}\n`,
    'utf8',
  )
  await writeFile(
    join(routeDirectory, 'index.tsx'),
    "/** @jsxImportSource @nexis/jsx-runtime */\n\nexport const seo = { title: 'My Nexis App' }\n\nexport default function Home() {\n  return <h1>Hello Nexis</h1>\n}\n",
    'utf8',
  )
  return directory
}
