import { mkdtemp, readFile } from 'node:fs/promises'
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
    await expect(runCli(['analyze'], directory)).resolves.toContain('Route: /')
  })
})
