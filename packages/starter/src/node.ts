import { access, mkdir, readdir, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { stdin as input, stdout as output } from 'node:process'
import { createInterface } from 'node:readline/promises'
import {
  assertStarterProjectName,
  createStarterFiles,
  type StarterLanguage,
  type StarterTemplate,
} from './index.js'

export type ScaffoldLanguage = StarterLanguage
export type ScaffoldTemplate = StarterTemplate

export interface ScaffoldOptions {
  readonly language?: ScaffoldLanguage
  readonly tailwind?: boolean
  readonly template?: ScaffoldTemplate
  readonly yes?: boolean
}

export interface ResolvedScaffoldOptions {
  readonly language: ScaffoldLanguage
  readonly tailwind: boolean
  readonly template: ScaffoldTemplate
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

export function assertScaffoldProjectName(name: string): void {
  assertStarterProjectName(name)
}

export function parseScaffoldArgs(args: readonly string[]): {
  readonly name?: string
  readonly options: ScaffoldOptions
} {
  let name: string | undefined
  let language: ScaffoldLanguage | undefined
  let tailwind: boolean | undefined
  let template: ScaffoldTemplate | undefined
  let yes = false
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!
    if (arg === '--yes' || arg === '-y') yes = true
    else if (arg === '--ts') {
      if (language === 'js') throw new Error('Choose only one of --ts or --js.')
      language = 'ts'
    } else if (arg === '--js') {
      if (language === 'ts') throw new Error('Choose only one of --ts or --js.')
      language = 'js'
    } else if (arg === '--tailwind') tailwind = true
    else if (arg === '--no-tailwind') tailwind = false
    else if (arg === '--template' || arg.startsWith('--template=')) {
      const value = arg === '--template' ? args[++index] : arg.slice('--template='.length)
      if (value !== 'minimal' && value !== 'interactive' && value !== 'secure-node')
        throw new Error('Template must be minimal, interactive, or secure-node.')
      template = value
    } else if (arg.startsWith('-')) throw new Error(`Unknown create option: ${arg}`)
    else if (name) throw new Error(`Unexpected argument: ${arg}`)
    else name = arg
  }
  return {
    ...(name === undefined ? {} : { name }),
    options: {
      yes,
      ...(language === undefined ? {} : { language }),
      ...(tailwind === undefined ? {} : { tailwind }),
      ...(template === undefined ? {} : { template }),
    },
  }
}

async function promptOptions(options: ScaffoldOptions): Promise<ResolvedScaffoldOptions> {
  if (options.yes)
    return {
      language: options.language ?? 'ts',
      tailwind: options.tailwind ?? false,
      template: options.template ?? 'interactive',
    }
  const readline = createInterface({ input, output })
  try {
    const language =
      options.language ??
      ((await readline.question('Use TypeScript? [Y/n] ')).trim().toLowerCase() === 'n'
        ? 'js'
        : 'ts')
    const template =
      options.template ??
      ((await readline.question('Template: interactive, minimal, or secure-node? [interactive] '))
        .trim()
        .toLowerCase() ||
        'interactive')
    if (template !== 'minimal' && template !== 'interactive' && template !== 'secure-node')
      throw new Error('Template must be minimal, interactive, or secure-node.')
    const tailwindAnswer =
      options.tailwind === undefined
        ? await readline.question('Include Tailwind CSS? [y/N] ')
        : options.tailwind
          ? 'y'
          : 'n'
    return {
      language,
      tailwind: tailwindAnswer.trim().toLowerCase() === 'y',
      template,
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
      await access(join(current, 'packages', 'starter', 'package.json'))
      return current
    } catch {
      const parent = dirname(current)
      if (parent === current) return undefined
      current = parent
    }
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
  const files = createStarterFiles({
    projectName: name,
    language: resolved.language,
    tailwind: resolved.tailwind,
    template: resolved.template,
    dependencyVersion: frameworkRoot ? 'workspace:*' : '^1.2.0',
  })
  await mkdir(directory, { recursive: true })
  for (const file of files) {
    if (frameworkRoot && file.path === '.npmrc') continue
    const destination = resolve(directory, file.path)
    if (!isContainedPath(directory, destination))
      throw new TypeError(`Refusing to write outside scaffold directory: ${file.path}`)
    await mkdir(dirname(destination), { recursive: true })
    await writeFile(destination, file.content, { encoding: 'utf8', flag: 'wx' })
  }
  if (frameworkRoot) {
    const packagesDirectory = relative(directory, join(frameworkRoot, 'packages')).replace(
      /\\/g,
      '/',
    )
    await writeFile(
      join(directory, 'pnpm-workspace.yaml'),
      `packages:\n  - "."\n  - "${packagesDirectory}/*"\ndisableSelfInstall: true\nstrictPeerDependencies: true\nonlyBuiltDependencies:\n  - esbuild\n  - sharp\nallowBuilds:\n  esbuild: true\n  sharp: true\n`,
      { encoding: 'utf8', flag: 'wx' },
    )
  }
  return { directory, options: resolved }
}
