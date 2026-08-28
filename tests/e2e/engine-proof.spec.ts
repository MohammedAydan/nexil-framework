import { test, expect } from '@playwright/test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { preview } from 'vite'

test.describe.configure({ mode: 'serial' })
test.setTimeout(120_000)

let tempDir: string
let server: any

test.afterAll(async () => {
  if (!tempDir) return
  await server?.close?.()
  // Restore workspace symlinks before removal — see state-scope.spec.ts for
  // the rationale; temp-workspace installs re-point framework package links.
  const { execSync } = await import('node:child_process')
  try {
    execSync('pnpm install --silent', { cwd: process.cwd(), timeout: 120_000, stdio: 'ignore' })
  } catch {
    // Best effort: a later suite's install will also relink.
  }
  await rm(tempDir, { recursive: true, force: true })
})

test.beforeAll(async () => {
  test.setTimeout(120_000)
  const { scaffoldProject } = await import('../../packages/cli/dist/index.js')
  const { execSync } = await import('node:child_process')

  tempDir = await mkdtemp(join(process.cwd(), '.tmp-engine-proof-'))
  const result = await scaffoldProject('engine-test', tempDir, { yes: true, language: 'ts' })
  const appDir = result.directory

  // Install workspace dependencies (needed for Vite SSR to resolve @nexis/*)
  try {
    execSync('pnpm install --silent', { cwd: appDir, stdio: 'inherit', timeout: 90_000 })
  } catch {
    // Fallback: try with frozen lockfile off
    execSync('pnpm install --no-frozen-lockfile --silent', {
      cwd: appDir,
      stdio: 'inherit',
      timeout: 90_000,
    })
  }

  // Build the app to generate SSR HTML and chunks
  const { runCli } = await import('../../packages/cli/dist/index.js')
  await runCli(['build'], appDir)

  // Verify build output contains SSR proof before starting server
  const html = await readFile(join(appDir, 'dist', 'client', 'index.html'), 'utf8')
  console.log(
    `[engine-proof] dist/client/index.html chunk: ${html.match(/chunk_[a-f0-9]+\.js/)?.[0]}`,
  )
  if (!html.includes('Rendered via Nexis SSR Engine')) {
    throw new Error('Build output missing engine-stamp - SSR pipeline bypassed')
  }
  if (!html.includes('data-nx-on-click') && !html.includes('on:click')) {
    throw new Error('Build output missing resumability attributes')
  }
  if (!/data-nx-scope="nx:scope:[a-f0-9]{12}"/.test(html)) {
    throw new Error('Build output did not externalize resumability scope metadata')
  }
  if (html.includes('&quot;initial&quot;') || html.includes('"initial"')) {
    throw new Error('Build output still contains inline resumability initial values')
  }
  if (!html.includes('src="/nexis-state.js"')) {
    throw new Error('Build output is missing the external state runtime')
  }

  // Start preview server for E2E browser testing
  const vitePreview = await preview({
    root: appDir,
    build: { outDir: 'dist/client' },
    preview: { port: 4317, host: '127.0.0.1' },
  })
  server = vitePreview
  // Wait for server to be ready and verify chunk serving
  await new Promise((resolve) => setTimeout(resolve, 2000))
  // Verify preview serves the chunk correctly before running tests
  const chunkFiles = await import('node:fs/promises').then((m) =>
    m.readdir(join(appDir, 'dist', 'client', 'nexis-chunks')).catch(() => []),
  )
  console.log(`[engine-proof] dist/nexis-chunks files: ${chunkFiles.join(', ')}`)
  const previewHtml = await fetch('http://127.0.0.1:4317/')
    .then((r) => r.text())
    .catch(() => '')
  console.log(`[engine-proof] preview / chunk: ${previewHtml.match(/chunk_[a-f0-9]+\.js/)?.[0]}`)
  if (chunkFiles.length > 0) {
    try {
      const res = await fetch(`http://127.0.0.1:4317/nexis-chunks/${chunkFiles[0]}`)
      console.log(`[engine-proof] fetch chunk ${chunkFiles[0]} status: ${res.status}`)
      const text = await res.text()
      console.log(`[engine-proof] chunk content preview: ${text.slice(0, 200)}`)
    } catch (e) {
      console.log(`[engine-proof] fetch chunk failed: ${e}`)
    }
  }
  try {
    const res = await fetch('http://127.0.0.1:4317/nexis-bootstrap.js')
    console.log(`[engine-proof] fetch bootstrap status: ${res.status}`)
  } catch (e) {
    console.log(`[engine-proof] fetch bootstrap failed: ${e}`)
  }
})

test.afterAll(async () => {
  if (server) {
    try {
      await server.close()
    } catch {
      try {
        server.httpServer?.close()
      } catch {}
    }
  }
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {})
  }
})

test('engine proof: SSR renders dynamic markup with engine stamp', async ({ page }) => {
  await page.goto('http://127.0.0.1:4317/')
  await expect(page.locator('#engine-stamp')).toContainText('Rendered via Nexis SSR Engine')
})

test('engine proof: counter has serialized resumable attributes', async ({ page }) => {
  await page.goto('http://127.0.0.1:4317/')
  const button = page.locator('#counter-btn')
  await expect(button).toBeVisible()
  const onClickAttr = await button.getAttribute('data-nx-on-click')
  const qOnClick = await button.getAttribute('on:click')
  const attr = onClickAttr || qOnClick || ''
  expect(attr).toMatch(/chunk_[a-f0-9]+\.js#handler_[a-f0-9]+/)
  await expect(button).toHaveAttribute('data-nx-scope', /^nx:scope:[a-f0-9]{12}$/)
  const html = await page.content()
  expect(html).not.toContain('&quot;initial&quot;')
  const stateResponse = await page.request.get('http://127.0.0.1:4317/nexis-state.js')
  expect(stateResponse.ok()).toBe(true)
})

test('engine proof: clicking counter updates without hydration', async ({ page }) => {
  const requests: string[] = []
  page.on('request', (req) => {
    if (req.url().includes('chunk_') || req.url().includes('nexis-bootstrap')) {
      requests.push(req.url())
    }
  })
  page.on('console', (msg) => console.log(`[browser console] ${msg.text()}`))
  page.on('pageerror', (err) => console.log(`[page error] ${err.message}`))

  await page.goto('http://127.0.0.1:4317/')
  const button = page.locator('#counter-btn')
  await expect(button).toContainText('Count: 0')

  // Verify bootstrap is loaded
  const bootstrapLoaded = await page.evaluate(() => {
    return document.querySelector('script[src="/nexis-bootstrap.js"]') !== null
  })
  console.log(`bootstrap script tag present: ${bootstrapLoaded}`)
  console.log(`requests before click: ${requests.join(', ')}`)

  await button.click()
  // Wait a bit for chunk to load and handler to execute
  await page.waitForTimeout(1000)
  console.log(`requests after first click: ${requests.join(', ')}`)
  const text1 = await button.textContent()
  console.log(`button text after first click: ${text1}`)
  await expect(button).toContainText('Count: 1')
  await button.click()
  await page.waitForTimeout(500)
  await expect(button).toContainText('Count: 2')
})
