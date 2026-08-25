import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, win32 } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createProject, helpText, parseCommand, runCli } from './index'
import { isContainedPath, parseScaffoldArgs, scaffoldProject } from './scaffold'

describe('Nexis CLI', () => {
  it('parses supported commands and help', () => {
    expect(parseCommand(['build'])).toEqual({ command: 'build', args: [] })
    expect(parseCommand(['--help']).command).toBe('help')
    expect(helpText()).toContain('create <name>')
    expect(() => parseCommand(['unknown'])).toThrow(/Unknown/)
  })

  it('creates a one-route project safely', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'nexis-cli-'))
    const directory = await createProject('demo-app', parent)
    expect(await readFile(join(directory, 'src/routes/index.tsx'), 'utf8')).toContain(
      'Rendered via Nexis SSR Engine',
    )
    expect(await readFile(join(directory, 'index.html'), 'utf8')).toContain(
      '<!--nexis-app-outlet-->',
    )
    await expect(createProject('../escape', parent)).rejects.toThrow(/Project name/)
    await expect(runCli(['routes'], directory)).resolves.toContain('index.tsx')
    await expect(runCli(['build'], directory)).resolves.toContain('build completed')
    await expect(runCli(['analyze'], directory)).resolves.toMatch(/\/\s+\d+\s+\d+\s+interactive/)
  })

  it('uses local workspace dependencies when scaffolded inside the repository', async () => {
    const parent = await mkdtemp(join(process.cwd(), '.nexis-scaffold-test-'))
    try {
      const result = await scaffoldProject('workspace-app', parent, { yes: true, language: 'ts' })
      const packageJson = JSON.parse(
        await readFile(join(result.directory, 'package.json'), 'utf8'),
      ) as {
        dependencies: { '@mohammedaydan/cli': string }
      }
      expect(packageJson.dependencies['@mohammedaydan/cli']).toBe('workspace:*')
      expect(await readFile(join(result.directory, 'pnpm-workspace.yaml'), 'utf8')).toContain(
        'onlyBuiltDependencies:',
      )
      expect(await readFile(join(result.directory, 'index.html'), 'utf8')).toContain(
        '<!--nexis-app-outlet-->',
      )
    } finally {
      await rm(parent, { recursive: true, force: true })
    }
  })

  it('configures published scaffolds for GitHub Packages', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'nexis-github-scaffold-'))
    try {
      const result = await scaffoldProject('github-app', parent, { yes: true, language: 'ts' })
      const packageJson = JSON.parse(
        await readFile(join(result.directory, 'package.json'), 'utf8'),
      ) as {
        dependencies: { '@mohammedaydan/cli': string }
        nexis: { source: string; registry: string }
      }
      expect(packageJson.dependencies['@mohammedaydan/cli']).toBe('^2.1.0')
      expect(packageJson.nexis).toEqual({
        routeExtension: 'tsx',
        source: 'github-packages',
        registry: 'https://npm.pkg.github.com',
      })
      expect(await readFile(join(result.directory, '.npmrc'), 'utf8')).toBe(
        '@mohammedaydan:registry=https://npm.pkg.github.com\n',
      )
    } finally {
      await rm(parent, { recursive: true, force: true })
    }
  })

  it('handles Windows-style path containment without POSIX separators', () => {
    const parent = 'D:\\Projects\\Test\\nexis-framework'
    expect(
      isContainedPath(
        parent,
        `${parent}\\my-nexis-app`,
        { relative: win32.relative, isAbsolute: win32.isAbsolute },
        '\\',
      ),
    ).toBe(true)
    expect(
      isContainedPath(
        parent,
        'D:\\Projects\\Test\\other-app',
        { relative: win32.relative, isAbsolute: win32.isAbsolute },
        '\\',
      ),
    ).toBe(false)
    expect(
      isContainedPath(
        parent,
        'D:\\Projects\\Test\\nexis-framework\\..\\escape',
        { relative: win32.relative, isAbsolute: win32.isAbsolute },
        '\\',
      ),
    ).toBe(false)
  })

  it('supports deterministic TSX and JSX scaffold variants', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'nexis-cli-scaffold-'))
    expect(parseScaffoldArgs(['app', '--yes', '--js', '--tailwind'])).toEqual({
      name: 'app',
      options: { yes: true, language: 'js', tailwind: true },
    })
    expect(() => parseScaffoldArgs(['app', '--ts', '--js'])).toThrow(/only one/)

    const result = await scaffoldProject('js-app', parent, {
      yes: true,
      language: 'js',
      tailwind: true,
    })
    expect(await readFile(join(result.directory, 'src/routes/index.jsx'), 'utf8')).toContain(
      'Rendered via Nexis SSR Engine',
    )
    expect(await readFile(join(result.directory, 'src/routes/counter.jsx'), 'utf8')).toContain(
      'onClick$',
    )
    expect(await readFile(join(result.directory, 'tsconfig.json'), 'utf8')).toContain(
      '"jsxImportSource": "@mohammedaydan/core"',
    )
    expect(await readFile(join(result.directory, 'tsconfig.json'), 'utf8')).toContain(
      '"allowJs": true',
    )
    expect(await readFile(join(result.directory, 'src/styles.css'), 'utf8')).toContain(
      'tailwindcss',
    )
    await expect(scaffoldProject('js-app', parent, { yes: true })).rejects.toThrow(/not empty/)
  })

  it('emits and measures bootstrap for an interactive route', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'nexis-cli-interactive-'))
    const directory = await createProject('interactive-app', parent)
    await writeFile(
      join(directory, 'src/routes/index.tsx'),
      `export default function Home() {\n  return <button onClick$={(event) => event.currentTarget}>Increment</button>\n}\n`,
      'utf8',
    )

    await expect(runCli(['check', '--budget'], directory)).resolves.toContain('checks passed')
    const manifest = JSON.parse(
      await readFile(join(directory, 'dist/nexis-manifest.json'), 'utf8'),
    ) as { routes: Array<{ interactive: boolean; bootstrapGzipBytes: number }> }
    expect(manifest.routes[0]?.interactive).toBe(true)
    expect(manifest.routes[0]?.bootstrapGzipBytes).toBeGreaterThan(0)
    expect(await readFile(join(directory, 'dist/nexis-bootstrap.js'), 'utf8')).toContain(
      'querySelectorAll',
    )
  })
})
