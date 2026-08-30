import { describe, expect, it } from 'vitest'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { scaffoldProject } from '../../packages/create-nexil/src/scaffold.js'

describe('E2E Monorepo Smoke Test — Scaffold & Template Integrity', () => {
  it('scaffolds template-blank and verifies all essential files and configs', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'nexil-e2e-blank-'))
    try {
      const { directory } = await scaffoldProject('test-blank-app', parent, {
        yes: true,
        template: 'blank' as any,
        language: 'ts',
      })

      const entries = await readdir(directory)
      expect(entries).toContain('package.json')
      expect(entries).toContain('tsconfig.json')
      expect(entries).toContain('index.html')
      expect(entries).toContain('src')

      const pkgRaw = await readFile(join(directory, 'package.json'), 'utf8')
      const pkg = JSON.parse(pkgRaw)
      expect(pkg.name).toBe('test-blank-app')
      expect(pkg.dependencies['nexil']).toBeDefined()
    } finally {
      await rm(parent, { recursive: true, force: true })
    }
  })

  it('scaffolds template-fullstack and verifies complete routing, layout, and entry files', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'nexil-e2e-fullstack-'))
    try {
      const { directory } = await scaffoldProject('test-fullstack-app', parent, {
        yes: true,
        template: 'fullstack' as any,
        language: 'ts',
      })

      const entries = await readdir(directory)
      expect(entries).toContain('package.json')
      expect(entries).toContain('tsconfig.json')
      expect(entries).toContain('vite.config.ts')
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

      const pkgRaw = await readFile(join(directory, 'package.json'), 'utf8')
      const pkg = JSON.parse(pkgRaw)
      expect(pkg.name).toBe('test-fullstack-app')
      expect(pkg.dependencies['nexil']).toBeDefined()
      expect(pkg.dependencies['@nexil/cli']).toBeDefined()

      const layoutContent = await readFile(join(directory, 'src', 'routes', '_layout.tsx'), 'utf8')
      expect(layoutContent).toContain('Slot')
      expect(layoutContent).toContain('Link')

      const itemContent = await readFile(
        join(directory, 'src', 'routes', 'items', '[id].tsx'),
        'utf8',
      )
      expect(itemContent).toContain('routeLoader$')
    } finally {
      await rm(parent, { recursive: true, force: true })
    }
  })
})
