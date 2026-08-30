#!/usr/bin/env node
import { basename, resolve } from 'node:path'
import { rm, readdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import {
  parseScaffoldArgs,
  scaffoldProject,
  isContainedPath,
  createStarterFiles,
  resolveStarterOptions,
} from './scaffold.js'
import type { ScaffoldTemplate, ScaffoldLanguage } from './scaffold.js'

const require = createRequire(import.meta.url)
const pkg = require('../package.json') as { version: string }
const VERSION = pkg.version

const invokedAs = basename(process.argv[1] ?? 'create-nexil')
const rawArgs = process.argv.slice(2)

function helpText(): string {
  return `Nexil initializer ${VERSION} — create a new Nexil application

Usage: ${invokedAs} <project-name> [options]
       npx @nexil/create-nexil@${VERSION} my-app --yes --ts
       pnpm dlx @nexil/create-nexil@${VERSION} my-app --yes --ts
       yarn dlx @nexil/create-nexil@${VERSION} my-app --yes --ts
       npm create @nexil/nexil@${VERSION} my-app -- --yes --ts
       pnpm create @nexil/nexil@${VERSION} my-app -- --yes --ts
       nexil create my-app --yes --ts

Arguments:
  <project-name>          1–64 chars, starts with letter, [a-zA-Z0-9_-] (no path separators)

Options:
  -y, --yes               Skip prompts, use defaults (interactive, ts, no tailwind)
      --dry-run           Show what would be created, do not write files
  -h, --help              Show this help
  -v, --version           Show version
      --ts                Use TypeScript (default)
      --js                Use JavaScript
      --tailwind          Include Tailwind CSS
      --no-tailwind       Do not include Tailwind (default)
      --template <name>   fullstack | blank | interactive (default) | minimal | secure-node
      --template=<name>   Same as above

Templates:
  fullstack     Fullstack Router, Layouts, Loaders, Actions, Tailwind
  blank         Minimal Vite + JSX entry setup
  interactive   SSR + one onClick$ boundary (default)
  minimal       Static HTML-first, no resumability boundary
  secure-node   Static + nexil.config.ts with securityHeaders + trustProxy:false

Examples:
  ${invokedAs} my-nexil-app --yes --ts
  ${invokedAs} portal --yes --ts --template fullstack
  ${invokedAs} my-app --dry-run --template blank --js

Exit codes:
  0 success, 1 user/system error
`
}

function isHelpArg(arg: string): boolean {
  return arg === '--help' || arg === '-h'
}
function isVersionArg(arg: string): boolean {
  return arg === '--version' || arg === '-v' || arg === '-V'
}
function isDryRunArg(arg: string): boolean {
  return arg === '--dry-run'
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    const msg = error.message.trim()
    if (msg) return msg
    return error.name
  }
  return String(error)
}

async function main(): Promise<void> {
  // Handle --help / --version before parsing (parseScaffoldArgs would throw on them as unknown)
  for (const arg of rawArgs) {
    if (isHelpArg(arg)) {
      process.stdout.write(helpText())
      process.exit(0)
    }
    if (isVersionArg(arg)) {
      process.stdout.write(`${VERSION}\n`)
      process.exit(0)
    }
  }

  const hasDryRun = rawArgs.includes('--dry-run')
  const filteredArgs = rawArgs.filter((a) => !isDryRunArg(a))

  let name: string | undefined
  let options: Record<string, unknown> = {}
  try {
    const parsed = parseScaffoldArgs(filteredArgs)
    name = parsed.name
    options = parsed.options as Record<string, unknown>
  } catch (error) {
    console.error(`Error: ${formatError(error)}`)
    console.error(`Run '${invokedAs} --help' for usage.`)
    process.exit(1)
  }

  if (!name) {
    console.error(
      `Error: Missing <project-name>. Usage: ${invokedAs} <project-name> [--yes] [--ts|--js] [--tailwind] [--template minimal|interactive|secure-node]`,
    )
    console.error(`Run '${invokedAs} --help' for usage.`)
    process.exit(1)
  }

  // Dry-run: do not touch FS, just show what would be created
  if (hasDryRun) {
    try {
      // Replicate scaffoldProject's option resolution without prompting (dry-run implies --yes if not specified)
      const scaffoldOptions: any = {
        language: (options as { language?: ScaffoldLanguage }).language,
        tailwind: (options as { tailwind?: boolean }).tailwind,
        template: (options as { template?: ScaffoldTemplate }).template,
        yes: true,
      }
      // Use createStarterFiles directly (pure) — determine dependencyVersion same as scaffoldProject
      // If parent is inside framework checkout, scaffoldProject uses workspace:*, but for dry-run we show npm version
      const resolved = resolveStarterOptions({
        projectName: name,
        template: scaffoldOptions.template,
        language: scaffoldOptions.language,
        tailwind: scaffoldOptions.tailwind,
        dependencyVersion: '^0.1.0',
      } as any)
      const files = createStarterFiles({
        projectName: name,
        template: resolved.template,
        language: resolved.language,
        tailwind: resolved.tailwind,
        dependencyVersion: '^0.1.0',
      } as any)
      const target = resolve(process.cwd(), name)
      // Validate containment without FS
      if (!isContainedPath(resolve(process.cwd()), target)) {
        throw new TypeError('Project directory must be contained by the selected parent directory.')
      }
      process.stdout.write(`Dry run: would create ${files.length} files in ${target}\n`)
      for (const file of files) {
        process.stdout.write(`  ${file.path} (${Buffer.byteLength(file.content, 'utf8')} B)\n`)
      }
      process.exit(0)
    } catch (error) {
      console.error(`Error: ${formatError(error)}`)
      process.exit(1)
    }
  }

  // Normal scaffold with failure-safe rollback
  const parent = process.cwd()
  const target = resolve(parent, name)
  let createdDirectory = false
  // Check if directory existed before (for rollback decision)
  let existedBefore = false
  try {
    const entries = await readdir(target)
    existedBefore = true
    if (entries.length > 0) {
      // scaffoldProject will throw with clear message, but we give early concise error
      throw new Error(`Directory is not empty: ${target}`)
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code !== 'ENOENT') {
      if (existedBefore) {
        console.error(`Error: ${formatError(error)}`)
        process.exit(1)
      }
      // ENOENT means not exists — we will create it, remember for rollback
      existedBefore = false
    }
  }

  try {
    // scaffoldProject will do its own readdir check and mkdir, but we track creation
    const beforeExists = existedBefore
    const result = await scaffoldProject(name, parent, options as never)
    createdDirectory = !beforeExists

    // Attempt git init
    try {
      const { exec } = await import('node:child_process')
      const { promisify } = await import('node:util')
      const execAsync = promisify(exec)
      await execAsync('git init', { cwd: result.directory }).catch(() => {})
    } catch {}

    process.stdout.write(`\n✨ Success! Created ${name} at ${result.directory}\n\n`)
    process.stdout.write(`Next steps:\n`)
    process.stdout.write(`  cd ${name}\n`)
    process.stdout.write(`  pnpm install (or npm install / yarn / bun install)\n`)
    process.stdout.write(`  pnpm dev\n\n`)
    process.exit(0)
  } catch (error) {
    const msg = formatError(error)
    // Provide actionable hints for common system errors
    let hint = ''
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'EACCES' || code === 'EPERM')
      hint = ' (permission denied — check directory permissions)'
    else if (code === 'ENOSPC') hint = ' (no space left on device)'
    else if (code === 'EEXIST') hint = ' (file already exists — possible race, try again)'
    console.error(`Error: ${msg}${hint}`)

    // Rollback: if we created the directory (it didn't exist before and scaffold failed mid-way), remove it
    // Only attempt if target is contained and not the parent itself
    try {
      if (!existedBefore && isContainedPath(resolve(parent), target)) {
        // Check if directory now exists (partial)
        const entries = await readdir(target).catch(() => null)
        if (entries !== null) {
          // We created it and it now exists (maybe partially) — remove
          await rm(target, { recursive: true, force: true })
        }
      }
    } catch {
      // Rollback failure is non-fatal, just warn
      console.error(`Warning: failed to clean up partial directory ${target}`)
    }
    process.exit(1)
  }
}

main().catch((error) => {
  console.error(`Error: ${formatError(error)}`)
  process.exit(1)
})
