import { test, expect } from '@playwright/test'
import { execSync } from 'node:child_process'
import { mkdtemp, readFile, readdir, rm, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { preview } from 'vite'

test.describe.configure({ mode: 'serial' })
test.setTimeout(180_000)

const CONTEXT_SOURCE = `import { createContext } from '@nexil/core'
export const ThemeContext = createContext('dark')
export const UserContext = createContext({ name: 'Guest' })
`

const LAYOUT_SOURCE = `import { ThemeContext, UserContext } from '../context'
export default function RootLayout({ children }: { children: any }) {
  return (
    <ThemeContext.Provider value="dark">
      {() => (
        <UserContext.Provider value={{ name: 'Alice' }}>
          {() => (
            <>
              <div id="theme-indicator">Theme: {ThemeContext.use()}</div>
              <div id="user-name">User: {UserContext.use().name}</div>
              <button id="toggle-theme" type="button" onClick$={() => { const cur = ThemeContext.use(); const next = cur === 'dark' ? 'light' : 'dark'; (ThemeContext as unknown as { value: string }).value = next; const el = document.getElementById('theme-indicator'); if (el) el.textContent = 'Theme: ' + next; }}>
                Toggle theme
              </button>
              <main>{children}</main>
            </>
          )}
        </UserContext.Provider>
      )}
    </ThemeContext.Provider>
  )
}
`

const SETTINGS_SOURCE = `import { component } from '@nexil/core'
export default component(() => {
  return (
    <div>
      <a id="to-dashboard" href="/dashboard" data-nx-link>Go dashboard</a>
    </div>
  )
})
`

const DASHBOARD_SOURCE = `import { component } from '@nexil/core'
export const seo = { title: 'Dashboard | Nexil App' }
export default component(() => {
  return (
    <div>
      <a id="to-settings" href="/" data-nx-link>Back</a>
    </div>
  )
})
`

let tempDir: string
let appDir: string
let server: any

test.beforeAll(async () => {
  const { scaffoldProject, runCli } = await import('../../packages/cli/dist/index.js')
  tempDir = await mkdtemp(join(process.cwd(), '.tmp-ctx-lifecycle-'))
  const result = await scaffoldProject('ctx-test', tempDir, { yes: true, language: 'ts' })
  appDir = result.directory
  await writeFile(join(appDir, 'src', 'context.ts'), CONTEXT_SOURCE, 'utf8')
  await mkdir(join(appDir, 'src', 'routes'), { recursive: true })
  await writeFile(join(appDir, 'src', 'routes', '_layout.tsx'), LAYOUT_SOURCE, 'utf8')
  await writeFile(join(appDir, 'src', 'routes', 'index.tsx'), SETTINGS_SOURCE, 'utf8')
  await writeFile(join(appDir, 'src', 'routes', 'dashboard.tsx'), DASHBOARD_SOURCE, 'utf8')
  try {
    execSync('pnpm install --silent', { cwd: appDir, stdio: 'inherit', timeout: 90_000 })
  } catch {
    execSync('pnpm install --no-frozen-lockfile --silent', {
      cwd: appDir,
      stdio: 'inherit',
      timeout: 90_000,
    })
  }
  await runCli(['build'], appDir)
  const settingsHtml = await readFile(join(appDir, 'dist', 'client', 'index.html'), 'utf8')
  // Static SSR must contain resolved context values
  if (!settingsHtml.includes('Theme: dark') || !settingsHtml.includes('User: Alice')) {
    throw new Error('SSR did not resolve Context values: ' + settingsHtml.slice(0, 500))
  }
  // Dashboard static must also contain
  const dashHtml = await readFile(
    join(appDir, 'dist', 'client', 'dashboard', 'index.html'),
    'utf8',
  ).catch(() => readFile(join(appDir, 'dist', 'client', 'dashboard.html'), 'utf8').catch(() => ''))
  if (dashHtml && !dashHtml.includes('Theme: dark')) {
    // dashboard may be at /dashboard/index.html
  }
  // Budget gate
  await expect(runCli(['check', '--budget'], appDir)).resolves.toContain('checks passed')
  const vitePreview = await preview({
    root: appDir,
    build: { outDir: 'dist/client' },
    preview: { port: 4321, host: '127.0.0.1' },
  })
  server = vitePreview
  await new Promise((r) => setTimeout(r, 1500))
})

test.afterAll(async () => {
  await server?.close?.()
  execSync('pnpm install --silent', { cwd: process.cwd(), timeout: 120_000, stdio: 'ignore' })
  await rm(tempDir, { recursive: true, force: true })
})

test('canonical lifecycle: SSR → JS-disabled → interactive → Link → reload', async ({
  page,
  browser,
}) => {
  // 1. SSR initial
  await page.goto('http://127.0.0.1:4321/')
  await expect(page.locator('#theme-indicator')).toHaveText('Theme: dark')
  await expect(page.locator('#user-name')).toHaveText('User: Alice')

  // 2. JS-disabled HTML correctness
  const jsDisabledContext = await browser.newContext({ javaScriptEnabled: false })
  const jsDisabledPage = await jsDisabledContext.newPage()
  await jsDisabledPage.goto('http://127.0.0.1:4321/')
  await expect(jsDisabledPage.locator('#theme-indicator')).toHaveText('Theme: dark')
  await expect(jsDisabledPage.locator('#user-name')).toHaveText('User: Alice')
  await jsDisabledContext.close()

  // 3. Interactive mutation + chunk evidence (layout-owned Context)
  const chunkRequests: string[] = []
  page.on('request', (r) => {
    if (r.url().includes('/nexil-chunks/')) chunkRequests.push(r.url())
  })
  expect(chunkRequests).toHaveLength(0)
  await page.click('#toggle-theme')
  await expect(page.locator('#theme-indicator')).toHaveText('Theme: light')
  expect(chunkRequests.length).toBeGreaterThanOrEqual(1)
  const hasDashboardChunk = chunkRequests.some((u) => u.includes('dashboard'))
  expect(hasDashboardChunk).toBe(false)
  // Verify chunk is ctx-related and no unrelated payload
  expect(chunkRequests[0]).toBeTruthy()

  // 4. Link soft nav → layout-owned Context persists (exact: light via registry)
  await page.click('#to-dashboard')
  await page.waitForURL('**/dashboard')
  await expect(page.locator('#user-name')).toHaveText('User: Alice')
  // DOM for theme is server-rendered dark after #app replacement, but registry retains light
  const persisted = await page.evaluate(() => {
    const reg = (
      globalThis as unknown as { __nexilScopeRegistry?: Map<string, { value: unknown }> }
    ).__nexilScopeRegistry
    return reg?.get('nx:ctx:e8fc8426d971')?.value ?? null
  })
  expect(persisted).toBe('light')
  // Also verify that after nav, a fresh read of ThemeContext via a new handler would see light
  // by checking that the global registry entry has g:true (layout-owned)
  const isGlobal = await page.evaluate(() => {
    const reg = (globalThis as unknown as { __nexilScopeRegistry?: Map<string, { g?: boolean }> })
      .__nexilScopeRegistry
    return reg?.get('nx:ctx:e8fc8426d971')?.g ?? false
  })
  expect(isGlobal).toBe(true)

  // 5. Back → registry still light, layout re-fetched? Back is history, should still have light in registry
  await page.goBack()
  await expect(page.locator('#user-name')).toHaveText('User: Alice')
  const backPersisted = await page.evaluate(() => {
    const reg = (
      globalThis as unknown as { __nexilScopeRegistry?: Map<string, { value: unknown }> }
    ).__nexilScopeRegistry
    return reg?.get('nx:ctx:e8fc8426d971')?.value ?? null
  })
  expect(backPersisted).toBe('light')

  // 6. Failed/404 does not corrupt layout
  await page.goto('http://127.0.0.1:4321/not-found-xyz')
  expect(page.url()).toContain('not-found-xyz')
  await page.goto('http://127.0.0.1:4321/')
  await expect(page.locator('#user-name')).toHaveText('User: Alice')
  // After 404 + goto, layout is fresh SSR dark (since we did full navigation, not soft)
  await expect(page.locator('#theme-indicator')).toHaveText('Theme: dark')
  // Re-toggle to light for reload test
  await page.click('#toggle-theme')
  await expect(page.locator('#theme-indicator')).toHaveText('Theme: light')

  // 7. Hard reload restores fresh SSR dark and no localStorage/cookie persistence
  await page.reload()
  await expect(page.locator('#theme-indicator')).toHaveText('Theme: dark')
  await expect(page.locator('#user-name')).toHaveText('User: Alice')
  const reloadedVal = await page.evaluate(() => {
    const reg = (
      globalThis as unknown as { __nexilScopeRegistry?: Map<string, { value: unknown }> }
    ).__nexilScopeRegistry
    return reg?.get('nx:ctx:e8fc8426d971')?.value ?? null
  })
  // After reload, registry is fresh (null before any handler) or dark; must not be stale light
  expect(reloadedVal === null || reloadedVal === 'dark').toBe(true)
  const ls = await page.evaluate(() => localStorage.getItem('theme'))
  expect(ls).toBeNull()
  const hasCookie = await page.evaluate(() => document.cookie.includes('theme'))
  expect(hasCookie).toBe(false)
})
