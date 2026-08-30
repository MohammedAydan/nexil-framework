import { describe, expect, it, afterAll } from 'vitest'
import { mkdtemp, rm, readFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { scaffoldStore } from './index'
import { parseCommand, helpText } from './index'

describe('nexil generate store — CLI', () => {
  it('parses g alias and help', () => {
    expect(parseCommand(['g', 'store', 'user', '--split'])).toEqual({
      command: 'generate',
      args: ['store', 'user', '--split'],
    })
    expect(parseCommand(['generate', 'store', 'cart', '--unified'])).toEqual({
      command: 'generate',
      args: ['store', 'cart', '--unified'],
    })
    expect(helpText()).toContain('generate store')
    expect(helpText()).toContain('g store')
  })

  it('creates split store with types/actions/store.ts per File Contracts', async () => {
    const root = await mkdtemp(join(tmpdir(), 'nexil-store-split-'))
    try {
      const files = await scaffoldStore(root, 'user', 'split')
      expect(files).toEqual(
        expect.arrayContaining([
          'src/stores/user/types.ts',
          'src/stores/user/actions.ts',
          'src/stores/user/store.ts',
        ]),
      )
      const types = await readFile(join(root, 'src/stores/user/types.ts'), 'utf8')
      expect(types).toContain('export interface UserState')
      expect(types).not.toContain('function')

      const actions = await readFile(join(root, 'src/stores/user/actions.ts'), 'utf8')
      expect(actions).toContain("from './types'")
      expect(actions).toContain('export const userActions')
      expect(actions).toContain('state: UserState')

      const store = await readFile(join(root, 'src/stores/user/store.ts'), 'utf8')
      expect(store).toContain("from '@nexil/core'")
      expect(store).toContain('createStore({')
      expect(store).toContain("id: 'user'")
      expect(store).toContain('useUserStore')
      expect(store).toContain('userActions')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('creates unified store with defineStore', async () => {
    const root = await mkdtemp(join(tmpdir(), 'nexil-store-unified-'))
    try {
      const files = await scaffoldStore(root, 'cart', 'unified')
      expect(files).toEqual(['src/stores/cart.ts'])
      const content = await readFile(join(root, 'src/stores/cart.ts'), 'utf8')
      expect(content).toContain("from '@nexil/core'")
      expect(content).toContain("defineStore('cart'")
      expect(content).toContain('useCartStore')
      expect(content).toContain('getters')
      expect(content).toContain('actions')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('supports nested store ids (admin/settings)', async () => {
    const root = await mkdtemp(join(tmpdir(), 'nexil-store-nested-'))
    try {
      const files = await scaffoldStore(root, 'admin/settings', 'split')
      expect(files).toContain('src/stores/admin/settings/store.ts')
      const store = await readFile(join(root, 'src/stores/admin/settings/store.ts'), 'utf8')
      expect(store).toContain("id: 'admin/settings'")
      expect(store).toContain('useSettingsStore')

      const files2 = await scaffoldStore(root, 'admin/cart', 'unified')
      expect(files2).toContain('src/stores/admin/cart.ts')
      const unified = await readFile(join(root, 'src/stores/admin/cart.ts'), 'utf8')
      expect(unified).toContain("defineStore('admin/cart'")
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('validates name and prevents collisions', async () => {
    const root = await mkdtemp(join(tmpdir(), 'nexil-store-validate-'))
    try {
      await expect(scaffoldStore(root, '../escape', 'split')).rejects.toThrow(/safe relative/)
      await expect(scaffoldStore(root, 'User', 'unified')).rejects.toThrow(/lowercase/)
      await expect(scaffoldStore(root, '/absolute', 'split')).rejects.toThrow(/safe relative/)

      await scaffoldStore(root, 'user', 'split')
      await expect(scaffoldStore(root, 'user', 'split')).rejects.toThrow(/already exists/)
      await expect(scaffoldStore(root, 'user', 'unified')).rejects.toThrow(/already exists/)
      // unified then split collision
      await scaffoldStore(root, 'cart', 'unified')
      await expect(scaffoldStore(root, 'cart', 'split')).rejects.toThrow(/already exists/)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('scaffoldStore via runCli integration', async () => {
    const { runCli, createProject } = await import('./index')
    const parent = await mkdtemp(join(tmpdir(), 'nexil-cli-store-'))
    try {
      const directory = await createProject('store-cli-app', parent)
      const out1 = await import('./index').then((m) =>
        m.runCli(['generate', 'store', 'user', '--split'], directory),
      )
      expect(out1).toContain('src/stores/user/store.ts')
      await expect(stat(join(directory, 'src/stores/user/store.ts'))).resolves.toBeDefined()

      const out2 = await import('./index').then((m) =>
        m.runCli(['g', 'store', 'cart', '--unified'], directory),
      )
      expect(out2).toContain('src/stores/cart.ts')
      await expect(stat(join(directory, 'src/stores/cart.ts'))).resolves.toBeDefined()

      await expect(runCli(['generate', 'store', 'user', '--split'], directory)).rejects.toThrow(
        /already exists/,
      )
      await expect(runCli(['generate', 'store', 'bad..name'], directory)).rejects.toThrow()
    } finally {
      await rm(parent, { recursive: true, force: true })
    }
  })
})
