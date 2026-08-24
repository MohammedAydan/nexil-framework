import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

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
