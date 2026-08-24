import { mkdir, readdir, writeFile } from 'node:fs/promises'
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

function packageJson(name: string, resolved: ResolvedScaffoldOptions): string {
  const extension = resolved.language === 'ts' ? 'tsx' : 'jsx'
  const devDependencies: Record<string, string> = { typescript: '^5.8.0' }
  if (resolved.tailwind) devDependencies.tailwindcss = '^4.1.0'
  return `${JSON.stringify(
    {
      name,
      private: true,
      type: 'module',
      scripts: {
        dev: 'nexis dev',
        build: 'nexis build',
        check: 'nexis check --budget',
        'check:budget': 'nexis check --budget',
        analyze: 'nexis analyze',
      },
      dependencies: {
        '@nexis/cli': '^0.1.0',
        '@nexis/core': '^0.1.0',
        '@nexis/media': '^0.1.0',
        '@nexis/seo': '^0.1.0',
      },
      devDependencies,
      nexis: { routeExtension: extension },
    },
    null,
    2,
  )}\n`
}

function tsconfig(resolved: ResolvedScaffoldOptions): string {
  const config = {
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'Bundler',
      jsx: 'react-jsx',
      jsxImportSource: '@nexis/core',
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

function routeFiles(resolved: ResolvedScaffoldOptions): Record<string, string> {
  const extension = resolved.language === 'ts' ? 'tsx' : 'jsx'
  return {
    [`src/routes/layout.${extension}`]:
      resolved.language === 'ts'
        ? `export default function Layout({ children }: { children?: unknown }) {\n  return <>{children}</>\n}\n`
        : `export default function Layout({ children }) {\n  return <>{children}</>\n}\n`,
    [`src/routes/index.${extension}`]: `export const seo = { title: 'Home | Nexis App', description: 'Blazing fast web app' }\n\nexport default function HomePage() {\n  return <main><h1>Hello Nexis</h1><p>Rendered server-side with zero client JavaScript.</p></main>\n}\n`,
    [`src/routes/counter.${extension}`]: `export default function Counter() {\n  return <button onClick$={() => undefined}>Clicks: 0</button>\n}\n`,
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
  const files: Record<string, string> = {
    'package.json': packageJson(name, resolved),
    'tsconfig.json': tsconfig(resolved),
    'README.md': `# ${name}\n\nCreated with Nexis. Run \`pnpm install\`, then \`pnpm dev\`.\n`,
    'public/favicon.ico': '',
    ...routeFiles(resolved),
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
