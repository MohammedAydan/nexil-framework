import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createProject, helpText, parseCommand, runCli } from './index'

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
    expect(await readFile(join(directory, 'src/routes/index.tsx'), 'utf8')).toContain('Hello Nexis')
    await expect(createProject('../escape', parent)).rejects.toThrow(/Project name/)
    await expect(runCli(['routes'], directory)).resolves.toContain('index.tsx')
    await expect(runCli(['build'], directory)).resolves.toContain('build completed')
    await expect(runCli(['analyze'], directory)).resolves.toMatch(/\/\s+\d+\s+\d+\s+static/)
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
    expect(await readFile(join(directory, 'dist/client/bootstrap.js'), 'utf8')).toContain(
      'querySelectorAll',
    )
  })
})
