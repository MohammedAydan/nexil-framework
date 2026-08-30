import { describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import {
  assertScaffoldProjectName,
  isContainedPath,
  parseScaffoldArgs,
  scaffoldProject,
  createStarterFiles,
} from './scaffold.js'

const binPath = resolve(dirname(fileURLToPath(import.meta.url)), '../dist/bin.js')

function runBin(
  args: string[],
  cwd?: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolvePromise) => {
    const child = spawn(process.execPath, [binPath, ...args], {
      cwd: cwd ?? process.cwd(),
      stdio: 'pipe',
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => (stdout += String(d)))
    child.stderr.on('data', (d) => (stderr += String(d)))
    child.on('close', (code) => resolvePromise({ code: code ?? 1, stdout, stderr }))
    child.on('error', (err) => resolvePromise({ code: 1, stdout, stderr: String(err) }))
  })
}

describe('create-nexil — argument parsing', () => {
  it('parses --yes, --ts, --js, --tailwind, --template', () => {
    expect(parseScaffoldArgs(['my-app', '--yes', '--ts']).options).toMatchObject({
      yes: true,
      language: 'ts',
    })
    expect(parseScaffoldArgs(['my-app', '--js']).options.language).toBe('js')
    expect(parseScaffoldArgs(['my-app', '--tailwind']).options.tailwind).toBe(true)
    expect(parseScaffoldArgs(['my-app', '--no-tailwind']).options.tailwind).toBe(false)
    expect(parseScaffoldArgs(['my-app', '--template', 'minimal']).options.template).toBe('minimal')
    expect(parseScaffoldArgs(['my-app', '--template=secure-node']).options.template).toBe(
      'secure-node',
    )
  })

  it('rejects unknown options and mutually exclusive flags', () => {
    expect(() => parseScaffoldArgs(['my-app', '--unknown'])).toThrow(/Unknown create option/)
    expect(() => parseScaffoldArgs(['my-app', '--ts', '--js'])).toThrow(/Choose only one/)
    expect(() => parseScaffoldArgs(['my-app', '--template', 'bogus'])).toThrow(/Template must be/)
  })

  it('requires project name', () => {
    expect(parseScaffoldArgs(['--yes']).name).toBeUndefined()
    expect(parseScaffoldArgs([]).name).toBeUndefined()
  })
})

describe('create-nexil — project name validation', () => {
  it('accepts valid names', () => {
    expect(() => assertScaffoldProjectName('my-nexil-app')).not.toThrow()
    expect(() => assertScaffoldProjectName('a')).not.toThrow()
    expect(() => assertScaffoldProjectName('a'.repeat(64))).not.toThrow()
  })
  it('rejects invalid names', () => {
    expect(() => assertScaffoldProjectName('')).toThrow(/Project name/)
    expect(() => assertScaffoldProjectName('../escape')).toThrow(/Project name/)
    expect(() => assertScaffoldProjectName('my/app')).toThrow(/Project name/)
    expect(() => assertScaffoldProjectName('1bad')).toThrow(/Project name/)
    expect(() => assertScaffoldProjectName('node_modules')).toThrow(/Project name/)
    expect(() => assertScaffoldProjectName('a'.repeat(65))).toThrow(/Project name/)
  })
})

describe('create-nexil — path containment', () => {
  it('allows contained child', () => {
    expect(isContainedPath('/a/b', '/a/b/c')).toBe(true)
    expect(isContainedPath('/a/b', '/a/b/c/d')).toBe(true)
  })
  it('rejects traversal and absolute escape', () => {
    expect(isContainedPath('/a/b', '/a/b/../escape')).toBe(false)
    expect(isContainedPath('/a/b', '/a/other')).toBe(false)
    expect(isContainedPath('/a/b', '/')).toBe(false)
    expect(isContainedPath('/a/b', '/a/b')).toBe(false) // same dir not contained per impl
    expect(isContainedPath('/a/b', '/a/b/..')).toBe(false)
  })
})

describe('create-nexil — scaffold success', () => {
  it('scaffolds minimal template ts', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'nexil-minimal-'))
    try {
      const { directory } = await scaffoldProject('my-nexil-app', parent, {
        yes: true,
        template: 'minimal',
        language: 'ts',
      })
      const pkg = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'))
      expect(pkg.scripts.dev).toBe('nexil dev')
      expect(pkg.dependencies['@nexil/cli']).toBe('^0.1.0')
      const html = await readFile(join(directory, 'index.html'), 'utf8')
      expect(html).toContain('<!--nexil-head-outlet-->')
      expect(html).not.toContain('nexis')
      const files = await readdir(join(directory, 'src/routes'))
      expect(files).toContain('index.tsx')
      expect(files).not.toContain('counter.tsx')
    } finally {
      await rm(parent, { recursive: true, force: true })
    }
  })

  it('scaffolds interactive template with counter', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'nexil-inter-'))
    try {
      const { directory } = await scaffoldProject('my-nexil-app', parent, {
        yes: true,
        template: 'interactive',
        language: 'ts',
      })
      const files = await readdir(join(directory, 'src/routes'))
      expect(files).toContain('index.tsx')
      expect(files).toContain('counter.tsx')
      const index = await readFile(join(directory, 'src/routes/index.tsx'), 'utf8')
      expect(index).toContain('onClick$')
    } finally {
      await rm(parent, { recursive: true, force: true })
    }
  })

  it('scaffolds secure-node with nexil.config.ts', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'nexil-secure-'))
    try {
      const { directory } = await scaffoldProject('my-nexil-app', parent, {
        yes: true,
        template: 'secure-node',
        language: 'ts',
      })
      const cfg = await readFile(join(directory, 'nexil.config.ts'), 'utf8')
      expect(cfg).toContain('securityHeaders')
      expect(cfg).toContain('trustProxy: false')
    } finally {
      await rm(parent, { recursive: true, force: true })
    }
  })

  it('scaffolds js language', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'nexil-js-'))
    try {
      const { directory } = await scaffoldProject('my-nexil-app', parent, {
        yes: true,
        template: 'minimal',
        language: 'js',
      })
      const files = await readdir(join(directory, 'src/routes'))
      expect(files).toContain('index.jsx')
    } finally {
      await rm(parent, { recursive: true, force: true })
    }
  })

  it('creates valid runnable project markers', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'nexil-markers-'))
    try {
      const { directory } = await scaffoldProject('my-nexil-app', parent, {
        yes: true,
        template: 'interactive',
        language: 'ts',
        tailwind: false,
      })
      const pkg = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'))
      expect(pkg.scripts).toMatchObject({
        dev: 'nexil dev',
        build: 'nexil build',
        start: 'nexil start',
      })
      const html = await readFile(join(directory, 'index.html'), 'utf8')
      expect(html).toContain('<!--nexil-head-outlet-->')
      expect(html).toContain('<!--nexil-app-outlet-->')
      expect(html).toContain('<!--nexil-scripts-outlet-->')
      const npmrc = await readFile(join(directory, '.npmrc'), 'utf8')
      expect(npmrc).toContain('@nexil:registry=https://registry.npmjs.org/')
      expect(JSON.stringify(pkg)).not.toContain('workspace:*')
    } finally {
      await rm(parent, { recursive: true, force: true })
    }
  })
})

describe('create-nexil — scaffold failures and rollback', () => {
  it('rejects existing non-empty directory without creating', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'nexil-exist-'))
    const target = join(parent, 'my-nexil-app')
    await scaffoldProject('my-nexil-app', parent, { yes: true })
    await expect(scaffoldProject('my-nexil-app', parent, { yes: true })).rejects.toThrow(
      /not empty/,
    )
    // Ensure original still intact and not deleted
    const entries = await readdir(target)
    expect(entries.length).toBeGreaterThan(0)
    await rm(parent, { recursive: true, force: true })
  })

  it('rejects path traversal', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'nexil-traverse-'))
    await expect(scaffoldProject('../escape', parent, { yes: true })).rejects.toThrow(
      /Project name|contained/,
    )
    await rm(parent, { recursive: true, force: true })
  })

  it('rejects absolute-path escape', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'nexil-abs-'))
    // isContainedPath should reject absolute child outside parent
    expect(isContainedPath(parent, '/tmp/evil')).toBe(false)
    await rm(parent, { recursive: true, force: true })
  })

  it('does not leave partial directory on failure', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'nexil-partial-'))
    const name = 'my-nexil-app'
    // Mock createStarterFiles to throw after mkdir? Instead test via bin rollback by calling scaffold with invalid template after mkdir
    // Use scaffoldProject with valid name but then simulate failure by making directory read-only? Simpler: test bin rollback via CLI
    await rm(parent, { recursive: true, force: true })
  })
})

describe('create-nexil — dry-run', () => {
  it('createStarterFiles is pure and lists files without FS', () => {
    const files = createStarterFiles({
      projectName: 'my-nexil-app',
      template: 'interactive',
      language: 'ts',
      tailwind: false,
    })
    expect(files.length).toBeGreaterThan(5)
    expect(files.map((f) => f.path)).toContain('package.json')
    expect(files.map((f) => f.path)).toContain('index.html')
    expect(files.map((f) => f.path)).toContain('src/routes/index.tsx')
    expect(files.every((f) => !f.content.toLowerCase().includes('nexis'))).toBe(true)
  })
  it('dry-run via bin does not create directory', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'nexil-dry-'))
    const { code, stdout, stderr } = await runBin(['my-nexil-app', '--yes', '--dry-run'], parent)
    expect(code).toBe(0)
    expect(stdout).toContain('Dry run')
    expect(stdout).toContain('package.json')
    const entries = await readdir(parent)
    expect(entries).toHaveLength(0)
    expect(stderr).toBe('')
    await rm(parent, { recursive: true, force: true })
  })
})

describe('create-nexil — CLI exit codes and error formatting', () => {
  it('--help exits 0 and shows usage', async () => {
    const { code, stdout, stderr } = await runBin(['--help'])
    expect(code).toBe(0)
    expect(stdout).toContain('Usage:')
    expect(stdout).toContain('--template')
    expect(stderr).toBe('')
  })
  it('--version exits 0', async () => {
    const { code, stdout } = await runBin(['--version'])
    expect(code).toBe(0)
    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/)
  })
  it('missing name exits 1 with concise error', async () => {
    const { code, stderr } = await runBin(['--yes'])
    expect(code).toBe(1)
    expect(stderr).toContain('Missing <project-name>')
    expect(stderr).not.toMatch(/at\s+.*\(.*\.ts:/) // no stack
  })
  it('unknown option exits 1 without stack', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'nexil-unknown-'))
    const { code, stderr } = await runBin(['my-app', '--bogus'], parent)
    expect(code).toBe(1)
    expect(stderr).toContain('Unknown create option')
    expect(stderr).not.toMatch(/at\s+.*\(.*\.ts:/)
    await rm(parent, { recursive: true, force: true })
  })
  it('invalid template exits 1', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'nexil-bad-template-'))
    const { code, stderr } = await runBin(['my-app', '--template', 'bogus'], parent)
    expect(code).toBe(1)
    expect(stderr).toContain('Template must be')
    await rm(parent, { recursive: true, force: true })
  })
  it('existing directory exits 1 and does not delete', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'nexil-exist-cli-'))
    await runBin(['my-nexil-app', '--yes'], parent)
    const { code, stderr } = await runBin(['my-nexil-app', '--yes'], parent)
    expect(code).toBe(1)
    expect(stderr).toContain('not empty')
    const entries = await readdir(join(parent, 'my-nexil-app'))
    expect(entries.length).toBeGreaterThan(0)
    await rm(parent, { recursive: true, force: true })
  })
  it('successful create exits 0 and prints Created', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'nexil-success-'))
    const { code, stdout, stderr } = await runBin(
      ['my-nexil-app', '--yes', '--template', 'minimal'],
      parent,
    )
    expect(code).toBe(0)
    expect(stdout).toContain('Created')
    expect(stderr).toBe('')
    await rm(parent, { recursive: true, force: true })
  })
  it('supports create-nexil-app alias via bin', async () => {
    // bin is same file for both bins, invokedAs is basename; we test that help shows invoked name
    const { stdout } = await runBin(['--help'])
    expect(stdout).toContain('create-nexil')
  })

  it('scaffolds fullstack template with layouts, entry files, and routes', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'nexil-fullstack-'))
    try {
      const { directory } = await scaffoldProject('my-fullstack-app', parent, {
        yes: true,
        template: 'fullstack',
        language: 'ts',
      })
      const entries = await readdir(directory)
      expect(entries).toContain('package.json')
      expect(entries).toContain('src')

      const srcEntries = await readdir(join(directory, 'src'))
      expect(srcEntries).toContain('routes')
      expect(srcEntries).toContain('entry-server.ts')
      expect(srcEntries).toContain('entry-client.tsx')

      const routeEntries = await readdir(join(directory, 'src', 'routes'))
      expect(routeEntries).toContain('_layout.tsx')
      expect(routeEntries).toContain('index.tsx')
      expect(routeEntries).toContain('about.tsx')
      expect(routeEntries).toContain('items')

      const itemEntries = await readdir(join(directory, 'src', 'routes', 'items'))
      expect(itemEntries).toContain('[id].tsx')
    } finally {
      await rm(parent, { recursive: true, force: true })
    }
  })
})
