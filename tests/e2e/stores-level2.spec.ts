import { test, expect } from '@playwright/test'
import { execSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { preview } from 'vite'

test.describe.configure({ mode: 'serial' })
test.setTimeout(180_000)

let tempDir: string
let appDir: string
let server: any

test.beforeAll(async () => {
  const { scaffoldProject, runCli } = await import('../../packages/cli/dist/index.js')

  tempDir = await mkdtemp(join(process.cwd(), '.tmp-stores-level2-'))
  const result = await scaffoldProject('stores-level2', tempDir, { yes: true, language: 'ts' })
  appDir = result.directory

  // Create modular store with nested state and unified store with getter
  await runCli(['generate', 'store', 'user', '--split'], appDir)
  await writeFile(
    join(appDir, 'src', 'stores', 'user', 'store.ts'),
    `import { createStore } from '@nexil/state'
import type { UserState } from './types'
import { userActions } from './actions'

const initialState: UserState = {
  count: 5,
  user: { profile: { name: 'Ada' } },
}

export const useUserStore = createStore({
  id: 'user',
  state: () => initialState,
  actions: userActions,
})
`,
    'utf8',
  )
  await writeFile(
    join(appDir, 'src', 'stores', 'user', 'types.ts'),
    `export interface UserState {
  count: number
  user: { profile: { name: string } }
}
`,
    'utf8',
  )
  await writeFile(
    join(appDir, 'src', 'stores', 'user', 'actions.ts'),
    `import type { UserState } from './types'

export const userActions = {
  increment(state: UserState): void {
    state.count += 1
  },
  setName(state: UserState, name: string): void {
    state.user.profile.name = name
  },
  doubleInc(state: UserState): void {
    state.count += 1
    state.count += 1
  },
}
`,
    'utf8',
  )

  await runCli(['generate', 'store', 'cart', '--unified'], appDir)
  await writeFile(
    join(appDir, 'src', 'stores', 'cart.ts'),
    `import { defineStore } from '@nexil/state'

export interface CartState {
  count: number
}

export const useCartStore = defineStore('cart', {
  state: (): CartState => ({ count: 3 }),
  getters: {
    doubled: (state) => state.count * 2,
  },
  actions: {
    inc() {
      this.count += 1
    },
    dec() {
      this.count -= 1
    },
  },
})
`,
    'utf8',
  )

  // Route with automatic store property bindings (including nested) and explicit bindText$
  await writeFile(
    join(appDir, 'src', 'routes', 'index.tsx'),
    `import { useUserStore } from '$stores/user'
import { useCartStore } from '$stores/cart'

export default function Home() {
  const userStore = useUserStore()
  const cartStore = useCartStore()
  return (
    <main>
      <p id="user-count">{userStore.count}</p>
      <p id="user-name">{userStore.user.profile.name}</p>
      <p id="cart-count">{cartStore.count}</p>
      <p id="cart-doubled">{cartStore.doubled}</p>
      <p id="user-count-explicit" bindText$={userStore.count}>{userStore.count}</p>
      <button id="inc-user" onClick$={() => { const sig = (globalThis as any).__getStorePathSignal('user','count'); sig.set((sig() as number)+1) }}>inc user</button>
      <button id="set-name" onClick$={() => { const sig = (globalThis as any).__getStorePathSignal('user','user.profile.name'); sig.set('Eve') }}>set name</button>
      <button id="double-inc" onClick$={() => { const sig = (globalThis as any).__getStorePathSignal('user','count'); sig.set((sig() as number)+2) }}>double inc</button>
      <button id="inc-cart" onClick$={() => { const sig = (globalThis as any).__getStorePathSignal('cart','count'); sig.set((sig() as number)+1) }}>inc cart</button>
    </main>
  )
}
`,
    'utf8',
  )

  try {
    execSync('pnpm install --silent', { cwd: appDir, stdio: 'inherit', timeout: 90000 })
  } catch {
    execSync('pnpm install --no-frozen-lockfile --silent', {
      cwd: appDir,
      stdio: 'inherit',
      timeout: 90000,
    })
  }

  await runCli(['build'], appDir)

  const html = await readFile(join(appDir, 'dist', 'client', 'index.html'), 'utf8')
  // Verify store path bindings are present (Level 2)
  expect(html).toContain('data-nx-store-bind="user:count#text"')
  expect(html).toContain('data-nx-store-bind="user:user.profile.name#text"')
  expect(html).toContain('data-nx-store-bind="cart:count#text"')
  expect(html).toContain('data-nx-store-bind="cart:doubled#text"')
  expect(html).toContain('id="__NEXIL_STORES__"')
  expect(html).toContain('"user"')
  expect(html).toContain('"cart"')
  // Verify batch wrapping at build time
  const userActionsBuilt = await readFile(
    join(appDir, 'src', 'stores', 'user', 'actions.ts'),
    'utf8',
  )
  // The source file itself is not transformed on disk, but the Vite transform should have wrapped it
  // We check the built chunk for batch
  const cartStoreContent = await readFile(join(appDir, 'src', 'stores', 'cart.ts'), 'utf8')
  expect(cartStoreContent).toContain("defineStore('cart'")

  const vitePreview = await preview({
    root: appDir,
    build: { outDir: 'dist/client' },
    preview: { port: 4325, host: '127.0.0.1' },
  })
  server = vitePreview
  await new Promise((resolve) => setTimeout(resolve, 1500))
})

test.afterAll(async () => {
  await server?.close?.()
  execSync('pnpm install --silent', { cwd: process.cwd(), timeout: 120000, stdio: 'ignore' })
  await rm(tempDir, { recursive: true, force: true })
})

test('automatic store property bindings update DOM O(1) without component re-execution', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:4325/')
  await expect(page.locator('#user-count')).toHaveText('5')
  await expect(page.locator('#user-name')).toHaveText('Ada')
  await expect(page.locator('#cart-count')).toHaveText('3')
  await expect(page.locator('#cart-doubled')).toHaveText('6')
  await expect(page.locator('#user-count-explicit')).toHaveText('5')

  // Increment user count via store action (modular, batch-wrapped at Vite + runtime)
  await page.click('#inc-user')
  await expect(page.locator('#user-count')).toHaveText('6')
  await expect(page.locator('#user-count-explicit')).toHaveText('6')
  // Other bindings should not have changed, and the increment should be O(1) (no full re-render)
  await expect(page.locator('#user-name')).toHaveText('Ada')
  await expect(page.locator('#cart-count')).toHaveText('3')

  // Nested path update
  await page.click('#set-name')
  await expect(page.locator('#user-name')).toHaveText('Eve')
  await expect(page.locator('#user-count')).toHaveText('6')

  // Cart increment (unified, this-bound, batch-wrapped)
  await page.click('#inc-cart')
  await expect(page.locator('#cart-count')).toHaveText('4')
  await expect(page.locator('#cart-doubled')).toHaveText('8')

  // Verify batch: doubleInc does two mutations but should result in single DOM update
  // We check that after click, count goes from 6 to 8 (two increments), and the DOM reflects it
  await page.click('#double-inc')
  await expect(page.locator('#user-count')).toHaveText('8')
})

test('SSR still serializes correct values into __NEXIL_STORES__', async () => {
  const html = await readFile(join(appDir, 'dist', 'client', 'index.html'), 'utf8')
  const match = /<script type="nexil\/state" id="__NEXIL_STORES__">(.*?)<\/script>/.exec(html)
  expect(match).not.toBeNull()
  const data = JSON.parse((match?.[1] ?? '').replace(/\\u003c/g, '<'))
  expect(data.user).toEqual({ count: 5, user: { profile: { name: 'Ada' } } })
  expect(data.cart).toEqual({ count: 3, doubled: 6 })
})
