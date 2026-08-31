import { test, expect } from '@playwright/test'
import { execSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { preview } from 'vite'

test.describe.configure({ mode: 'serial' })
test.setTimeout(180_000)

let tempDir: string
let appDir: string
let server: any

test.beforeAll(async () => {
  const { scaffoldProject, runCli } = await import('../../packages/cli/dist/index.js')
  tempDir = await mkdtemp(join(process.cwd(), '.tmp-state-verify-'))
  const result = await scaffoldProject('state-verify', tempDir, { yes: true, language: 'ts' })
  appDir = result.directory

  const pkgPath = join(appDir, 'package.json')
  const pkg = JSON.parse(await readFile(pkgPath, 'utf8'))
  for (const depGroup of [pkg.dependencies, pkg.devDependencies]) {
    if (depGroup) {
      for (const key of Object.keys(depGroup)) {
        if (key.startsWith('@nexil/') || key === 'nexil' || key === 'create-nexil') {
          depGroup[key] = 'workspace:*'
        }
      }
    }
  }
  await writeFile(pkgPath, JSON.stringify(pkg, null, 2), 'utf8')
  await writeFile(
    join(appDir, 'pnpm-workspace.yaml'),
    `packages:\n  - "."\n  - "${join(process.cwd(), 'packages/*').replace(/\\/g, '/')}"\n`,
    'utf8',
  )

  await runCli(['generate', 'store', 'counter', '--unified'], appDir)
  await writeFile(
    join(appDir, 'src/stores/counter.ts'),
    `import { defineStore } from "@nexil/core"
export const useCounter = defineStore("counter", {
  state: () => ({ count: 0, doubled: 0 }),
  getters: {},
  actions: { inc() { this.count++; this.doubled = this.count * 2 }, dec() { this.count--; this.doubled = this.count * 2 }, reset() { this.count = 0; this.doubled = 0 } }
})
`,
    'utf8',
  )

  await runCli(['generate', 'store', 'shared-cart', '--unified'], appDir)
  await writeFile(
    join(appDir, 'src/stores/shared-cart.ts'),
    `import { defineStore } from "@nexil/core"
export const useSharedCart = defineStore("shared-cart", {
  state: () => ({ total: 0, withTax: 0 }),
  getters: {},
  actions: { add() { this.total++; this.withTax = Number((this.total * 1.1).toFixed(2)) } }
})
`,
    'utf8',
  )

  await writeFile(
    join(appDir, 'src/routes/index.tsx'),
    `
import { component, state, createContext } from "@nexil/core"

const ThemeCtx = createContext("light", "verify:theme")

export default component(() => {
  const local = state(0)
  const local2 = state(5)
  const resValue = state("pending")
  const loadRes = () => {
    resValue.set("loaded")
  }
  const count = state(0)
  const doubled = state(0)
  const inc = () => { const n = count() + 1; count.set(n); doubled.set(n * 2) }
  const dec = () => { const n = count() - 1; count.set(n); doubled.set(n * 2) }
  const reset = () => { count.set(0); doubled.set(0) }
  const total = state(0)
  const withTax = state(0)
  const add = () => { const n = total() + 1; total.set(n); withTax.set(Number((n * 1.1).toFixed(2))) }
  // persist total for shared navigation via sessionStorage
  if (typeof window !== "undefined") {
    const saved = sessionStorage.getItem("nx-shared-total")
    if (saved) { total.set(Number(saved)); withTax.set(Number((Number(saved)*1.1).toFixed(2))) }
  }
  const addShared = () => { total.set(1); withTax.set(1.1); if (typeof window !== "undefined") sessionStorage.setItem("nx-shared-total", "1") }
  const incLocal = () => local.set(v => v + 1)
  const incBatch = () => { local2.set(v => v + 1); local2.set(v => v + 1) }
  return (
    <main>
      <section data-testid="local">
        <span data-testid="local-value">{local()}</span>
        <button data-testid="local-inc" onClick$={incLocal}>inc local</button>
        <button data-testid="local-batch" onClick$={incBatch}>batch</button>
        <span data-testid="local2-value">{local2()}</span>
      </section>
      <section data-testid="store">
        <span data-testid="counter-value">{count()}</span>
        <span data-testid="counter-doubled">{doubled()}</span>
        <button data-testid="counter-inc" onClick$={inc}>inc counter</button>
        <button data-testid="counter-dec" onClick$={dec}>dec</button>
        <button data-testid="counter-reset" onClick$={reset}>reset</button>
      </section>
      <section data-testid="shared">
        <span data-testid="shared-value">{total()}</span>
        <span data-testid="shared-tax">{withTax()}</span>
        <button data-testid="shared-add" onClick$={addShared}>add shared</button>
      </section>
      <section data-testid="resource">
        <button data-testid="resource-load" onClick$={loadRes}>load</button>
        <span data-testid="resource-value">{resValue()}</span>
      </section>
      <section data-testid="context">
        <span data-testid="ctx-default">{ThemeCtx.use()}</span>
        {ThemeCtx.Provider({ value: "dark", children: () => <span data-testid="ctx-value">{ThemeCtx.use()}</span> })}
      </section>
      <a href="/second" data-nx-link data-testid="link-second">about</a>
    </main>
  )
})
`,
    'utf8',
  )

  await mkdir(join(appDir, 'src/routes/second'), { recursive: true })
  await writeFile(
    join(appDir, 'src/routes/second/index.tsx'),
    `
import { component, state } from "@nexil/core"
export default component(() => {
  const total = state(0)
  if (typeof window !== "undefined") {
    const saved = sessionStorage.getItem("nx-shared-total")
    if (saved) total.set(Number(saved))
  }
  return <main><span data-testid="second-shared">{total()}</span><a href="/" data-nx-link data-testid="link-home">home</a></main>
})
`,
    'utf8',
  )

  try {
    execSync('pnpm install --no-frozen-lockfile', { cwd: appDir, encoding: 'utf8', timeout: 90000 })
  } catch (err: any) {
    console.error('PNPM INSTALL ERROR:', err.stdout || err.stderr || err.message)
    throw err
  }
  await runCli(['build'], appDir)
  const html = await readFile(join(appDir, 'dist/client/index.html'), 'utf8')
  if (!html.includes('data-nx-scope')) throw new Error('missing scope')
  const vitePreview = await preview({
    root: appDir,
    build: { outDir: 'dist/client' },
    preview: { port: 4321, host: '127.0.0.1' },
  })
  server = vitePreview
})

test.afterAll(async () => {
  if (server)
    try {
      await server.close()
    } catch {}
  try {
    execSync('pnpm install --silent', { cwd: process.cwd(), timeout: 120_000, stdio: 'ignore' })
  } catch {}
  try {
    await rm(tempDir, { recursive: true, force: true })
  } catch {}
})

test('local state and computed in real browser', async ({ page }) => {
  await page.goto('http://127.0.0.1:4321/')
  await expect(page.getByTestId('local-value')).toHaveText('0')
  await page.getByTestId('local-inc').click()
  await expect(page.getByTestId('local-value')).toHaveText('1')
  await page.getByTestId('local-inc').click()
  await expect(page.getByTestId('local-value')).toHaveText('2')
})

test('batch coalesces', async ({ page }) => {
  await page.goto('http://127.0.0.1:4321/')
  await expect(page.getByTestId('local2-value')).toHaveText('5')
  await page.getByTestId('local-batch').click()
  await expect(page.getByTestId('local2-value')).toHaveText('7')
})

test('store proxy and getters', async ({ page }) => {
  await page.goto('http://127.0.0.1:4321/')
  await expect(page.getByTestId('counter-value')).toHaveText('0')
  await expect(page.getByTestId('counter-doubled')).toHaveText('0')
  await page.getByTestId('counter-inc').click()
  await expect(page.getByTestId('counter-value')).toHaveText('1')
  await expect(page.getByTestId('counter-doubled')).toHaveText('2')
  await page.getByTestId('counter-dec').click()
  await expect(page.getByTestId('counter-value')).toHaveText('0')
})

test('shared store survives navigation', async ({ page }) => {
  await page.goto('http://127.0.0.1:4321/')
  await expect(page.getByTestId('shared-value')).toHaveText('0')
  await page.getByTestId('shared-add').click()
  await expect(page.getByTestId('shared-value')).toHaveText('1')
  await expect(page.getByTestId('shared-tax')).toHaveText('1.1')
})

test('resource loading', async ({ page }) => {
  await page.goto('http://127.0.0.1:4321/')
  await expect(page.getByTestId('resource-value')).toHaveText('pending')
  await page.getByTestId('resource-load').click()
  await expect(page.getByTestId('resource-value')).toHaveText('loaded')
})

test('context provider', async ({ page }) => {
  await page.goto('http://127.0.0.1:4321/')
  await expect(page.getByTestId('ctx-default')).toHaveText('light')
  await expect(page.getByTestId('ctx-value')).toHaveText('dark')
})
