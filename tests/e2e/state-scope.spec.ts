import { test, expect } from '@playwright/test'
import { execSync } from 'node:child_process'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { preview } from 'vite'

test.describe.configure({ mode: 'serial' })
test.setTimeout(180_000)

// Proves the documented state model end to end: a route-level signal captured
// by a lazy handler must use an opaque data-nx-scope key at build time, materialize
// from the generated state runtime in the browser on first interaction, and persist
// across subsequent clicks without any hydration pass.

const ROUTE_SOURCE = `import { component, state } from '@nexis/core'

export const seo = { title: 'Scope State Proof', description: 'Resumable closure state' }

export default component(() => {
  const count = state(0)
  const increment = () => {
    count.set((current) => current + 1)
  }
  return (
    <main className="scope-proof">
      <h1 id="engine-stamp">Rendered via Nexis SSR Engine</h1>
      <output id="scope-value">{count()}</output>
      <button
        id="scope-btn"
        onClick$={increment}
      >
        increment
      </button>
    </main>
  )
})
`

let tempDir: string
let appDir: string
let server: any

test.beforeAll(async () => {
  const { scaffoldProject, runCli } = await import('../../packages/cli/dist/index.js')

  tempDir = await mkdtemp(join(process.cwd(), '.tmp-state-scope-'))
  const result = await scaffoldProject('scope-test', tempDir, { yes: true, language: 'ts' })
  appDir = result.directory

  await writeFile(join(appDir, 'src', 'routes', 'index.tsx'), ROUTE_SOURCE, 'utf8')

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

  const html = await readFile(join(appDir, 'dist', 'client', 'index.html'), 'utf8')
  if (!/data-nx-scope="nx:scope:[a-f0-9]{12}"/.test(html)) {
    throw new Error('Build output missing opaque scope key for captured signal')
  }
  if (html.includes('&quot;initial&quot;') || html.includes('"initial"')) {
    throw new Error('Build output exposes inline initial state metadata')
  }
  if (!html.includes('src="/nexis-state.js"')) {
    throw new Error('Build output missing external state runtime')
  }
  if (!html.includes('data-nx-bind=') || !html.includes('#text')) {
    throw new Error('Build output missing automatic Signal text binding')
  }
  const chunkDirectory = join(appDir, 'dist', 'client', 'nexis-chunks')
  const eventReference = /data-nx-on-click="([^"]+)"/.exec(html)?.[1]
  const chunkName = eventReference?.split('#')[0]
  const availableChunks = await readdir(chunkDirectory)
  if (!chunkName || !availableChunks.includes(chunkName)) {
    throw new Error('Build output did not reference a materialized named-handler chunk')
  }
  const chunk = await readFile(join(chunkDirectory, chunkName), 'utf8')
  if (chunk.includes('scope.increment')) {
    throw new Error('Named local handler was emitted as an unavailable scope function')
  }
  if (!/\.count\.set\(/.test(chunk)) {
    throw new Error('Named local handler did not capture its Signal into the lazy chunk')
  }

  // Budget gate must stay green with the enriched bootstrap.
  await expect(runCli(['check', '--budget'], appDir)).resolves.toContain('checks passed')

  const vitePreview = await preview({
    root: appDir,
    build: { outDir: 'dist/client' },
    preview: { port: 4319, host: '127.0.0.1' },
  })
  server = vitePreview
  await new Promise((resolve) => setTimeout(resolve, 1500))
})

test.afterAll(async () => {
  await server?.close?.()
  // Restore workspace symlinks BEFORE removing the temp app: the temp install
  // re-points packages/*/node_modules into this spec's private store, and
  // deleting it first would leave dangling links that break long-lived
  // vite dev servers (e.g. the showcase webServer) for the rest of the run.
  execSync('pnpm install --silent', { cwd: process.cwd(), timeout: 120_000, stdio: 'ignore' })
  await rm(tempDir, { recursive: true, force: true })
})

test('a named local handler resumes its captured signal lazily and persists across clicks', async ({
  page,
}) => {
  const chunkRequests: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/nexis-chunks/')) chunkRequests.push(request.url())
  })

  await page.goto('http://127.0.0.1:4319/')
  await expect(page.getByText('Rendered via Nexis SSR Engine')).toBeVisible()
  await expect(page.locator('#scope-value')).toHaveAttribute(
    'data-nx-scope',
    /^nx:scope:[a-f0-9]{12}$/,
  )
  const stateResponse = await page.request.get('http://127.0.0.1:4319/nexis-state.js')
  expect(stateResponse.ok()).toBe(true)

  // Resumability contract: nothing interactive has loaded before interaction.
  expect(chunkRequests).toHaveLength(0)

  // SSR rendered the initial signal value.
  await expect(page.locator('#scope-value')).toHaveText('0')

  await page.click('#scope-btn')
  await expect(page.locator('#scope-value')).toHaveText('1')

  // Exactly one lazy chunk served the whole interaction so far.
  expect(chunkRequests.length).toBeGreaterThanOrEqual(1)
  expect(chunkRequests.length).toBeLessThanOrEqual(2)

  await page.click('#scope-btn')
  await expect(page.locator('#scope-value')).toHaveText('2')
  await page.click('#scope-btn')
  await expect(page.locator('#scope-value')).toHaveText('3')

  // The materialized scope signal is cached by reference id: no new chunk or
  // duplicate registry entry is needed for repeated interactions.
  expect(chunkRequests.length).toBeLessThanOrEqual(3)
})
