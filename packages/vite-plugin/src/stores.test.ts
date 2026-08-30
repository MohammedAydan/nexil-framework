import { describe, expect, it, afterAll } from 'vitest'
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { discoverStores, generateStoresDTS, generateVirtualBarrel } from './stores'

describe('nexil stores discovery', () => {
  let tempRoot: string

  it('discovers modular, unified-file and unified-folder stores with correct IDs', async () => {
    tempRoot = await mkdtemp(join(tmpdir(), 'nexil-stores-'))

    // modular: src/stores/user/store.ts
    await mkdir(join(tempRoot, 'src', 'stores', 'user'), { recursive: true })
    await writeFile(
      join(tempRoot, 'src', 'stores', 'user', 'store.ts'),
      `export const useUserStore = {}`,
      'utf8',
    )
    await writeFile(
      join(tempRoot, 'src', 'stores', 'user', 'types.ts'),
      `export interface UserState {}`,
      'utf8',
    )
    await writeFile(
      join(tempRoot, 'src', 'stores', 'user', 'actions.ts'),
      `export const userActions = {}`,
      'utf8',
    )

    // unified file: src/stores/cart.ts
    await writeFile(
      join(tempRoot, 'src', 'stores', 'cart.ts'),
      `export const useCartStore = {}`,
      'utf8',
    )

    // unified folder: src/stores/cart2/index.ts
    await mkdir(join(tempRoot, 'src', 'stores', 'cart2'), { recursive: true })
    await writeFile(
      join(tempRoot, 'src', 'stores', 'cart2', 'index.ts'),
      `export const useCart2Store = {}`,
      'utf8',
    )

    // nested modular: src/stores/admin/settings/store.ts
    await mkdir(join(tempRoot, 'src', 'stores', 'admin', 'settings'), { recursive: true })
    await writeFile(
      join(tempRoot, 'src', 'stores', 'admin', 'settings', 'store.ts'),
      `export const useSettingsStore = {}`,
      'utf8',
    )

    const { descriptors, warnings } = await discoverStores(tempRoot)
    const ids = descriptors.map((d) => d.id).sort()
    expect(ids).toEqual(['admin/settings', 'cart', 'cart2', 'user'])
    expect(descriptors.find((d) => d.id === 'user')?.kind).toBe('modular')
    expect(descriptors.find((d) => d.id === 'cart')?.kind).toBe('unified-file')
    expect(descriptors.find((d) => d.id === 'cart2')?.kind).toBe('unified-folder')
    expect(descriptors.find((d) => d.id === 'admin/settings')?.kind).toBe('modular')
    expect(warnings).toHaveLength(0)
  })

  it('modular wins over unified on collision and emits warning', async () => {
    // Add conflicting unified file for existing modular id "user"
    await writeFile(
      join(tempRoot, 'src', 'stores', 'user.ts'),
      `export const useUserStore2 = {}`,
      'utf8',
    )
    const { descriptors, warnings } = await discoverStores(tempRoot)
    const user = descriptors.find((d) => d.id === 'user')
    expect(user?.kind).toBe('modular')
    expect(warnings.some((w) => w.includes('user') && w.includes('modular'))).toBe(true)
    expect(descriptors.filter((d) => d.id === 'user')).toHaveLength(1)
  })

  it('ignores types.ts and actions.ts as standalone stores', async () => {
    // Already have types.ts/actions.ts in user folder, ensure they are not counted as unified
    const { descriptors } = await discoverStores(tempRoot)
    const hasTypes = descriptors.some((d) => d.id === 'types' || d.id === 'actions')
    expect(hasTypes).toBe(false)
  })

  it('returns empty when src/stores does not exist', async () => {
    const emptyRoot = await mkdtemp(join(tmpdir(), 'nexil-empty-'))
    const { descriptors } = await discoverStores(emptyRoot)
    expect(descriptors).toHaveLength(0)
    await rm(emptyRoot, { recursive: true, force: true })
  })

  afterAll(async () => {
    if (tempRoot) await rm(tempRoot, { recursive: true, force: true })
  })
})

describe('nexil stores virtual barrel & dts', () => {
  it('generates virtual barrel with re-exports', () => {
    const barrel = generateVirtualBarrel([
      { id: 'user', kind: 'modular', entry: '/project/src/stores/user/store.ts' },
      { id: 'cart', kind: 'unified-file', entry: '/project/src/stores/cart.ts' },
    ])
    expect(barrel).toContain("export * from '/project/src/stores/user/store.ts'")
    expect(barrel).toContain("export * from '/project/src/stores/cart.ts'")
    expect(barrel).toContain('store:user')
  })

  it('generates empty barrel when no stores', () => {
    const barrel = generateVirtualBarrel([])
    expect(barrel).toContain('no stores discovered')
  })

  it('generates stores.d.ts with module declarations', () => {
    const dts = generateStoresDTS(
      [{ id: 'user', kind: 'modular', entry: '/project/src/stores/user/store.ts' }],
      '/project',
    )
    expect(dts).toContain("declare module 'virtual:nexil-stores'")
    expect(dts).toContain("declare module '$stores/user'")
    expect(dts).toContain('src/stores/user/store.ts')
  })

  it('generates stores.d.ts for empty', () => {
    const dts = generateStoresDTS([], '/project')
    expect(dts).toContain('No stores discovered')
  })
})
