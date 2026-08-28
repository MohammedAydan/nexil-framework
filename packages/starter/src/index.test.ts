import { describe, expect, it } from 'vitest'
import { createStarterFiles, resolveStarterOptions } from './index.js'

describe('Nexil starter engine', () => {
  it('creates portable interactive files without credentials or filesystem side effects', () => {
    const files = createStarterFiles({
      projectName: 'northstar',
      template: 'interactive',
      language: 'ts',
    })
    const paths = files.map((file) => file.path)
    expect(paths).toEqual(
      expect.arrayContaining(['package.json', 'index.html', 'src/routes/index.tsx', '.npmrc']),
    )
    const interactive = files.find((file) => file.path === 'src/routes/index.tsx')?.content ?? ''
    expect(interactive).toContain('onClick$')
    expect(interactive).toContain('const increment =')
    expect(interactive).toContain('onClick$={increment}')
    expect(files.find((file) => file.path === 'package.json')?.content).toContain('^0.0.1')
    expect(files.every((file) => !file.content.includes('ghp_'))).toBe(true)
  })

  it('creates an explicit secure-node configuration and validates options', () => {
    const files = createStarterFiles({ projectName: 'ledger', template: 'secure-node' })
    expect(files.find((file) => file.path === 'nexil.config.ts')?.content).toContain(
      'securityHeaders',
    )
    expect(files.find((file) => file.path === 'nexil.config.ts')?.content).toContain(
      'trustProxy: false',
    )
    expect(() => resolveStarterOptions({ projectName: '../escape' })).toThrow(/Project name/)
    expect(() =>
      resolveStarterOptions({ projectName: 'safe', template: 'unknown' as never }),
    ).toThrow(/Unknown starter template/)
  })
})
