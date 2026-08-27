import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'

test.describe.configure({ mode: 'serial' })
test.setTimeout(120_000)

let parent: string
let appDir: string
let server: { readonly close: () => Promise<void>; readonly listen: () => Promise<void> }

test.beforeAll(async () => {
  const { createProject, runCli } = await import('../../packages/cli/dist/index.js')
  const { createServer } = await import('../../packages/serve/dist/index.js')
  parent = await mkdtemp(join(tmpdir(), 'nexis-link-e2e-'))
  appDir = await createProject('link-app', parent)
  await writeFile(
    join(appDir, 'src/routes/_layout.tsx'),
    `import { createStore } from '@mohammedaydan/state'
const navigationState = createStore({ visits: 0 }, 'global')
export default function Layout({ children }: { children: unknown }) {
  return <section><header><button id="global-increment" onClick$={({ element }) => { navigationState.set((value) => ({ visits: value.visits + 1 })); element.setAttribute('data-applied', 'true') }}>Increase global</button><button id="global-read" onClick$={({ element }) => { element.textContent = String(navigationState.value().visits) }}>Read global</button></header>{children}</section>
}
`,
    'utf8',
  )
  await writeFile(
    join(appDir, 'src/routes/index.tsx'),
    `import { Link } from '@mohammedaydan/router'
export const metadata = { title: 'Nexis home', description: 'Link navigation proof home' }
export default function Home() {
  return <main><h1>Nexis home</h1><Link href="/about" prefetch="intent" id="about-link">Read about Nexis</Link><a data-nx-link="push" href="#home-anchor" id="hash-link">Skip to anchor</a><a data-nx-link="push" href="/about" id="middle-link">Open with middle button</a><a data-nx-link="push" href="/about" target="_blank" id="target-link">Open in new tab</a><a data-nx-link="push" href="/about" download id="download-link">Download route</a><a data-nx-link="push" href="https://example.com/" id="external-link">External route</a><h2 id="home-anchor">Home anchor</h2><div style={{ height: '1600px' }} /></main>
}
`,
    'utf8',
  )
  await writeFile(
    join(appDir, 'src/routes/about.tsx'),
    `import { Link } from '@mohammedaydan/router'
import { state } from '@mohammedaydan/core'
const visits = state(0)
export const metadata = { title: 'About Nexis', description: 'Navigation proof route' }
export default function About() {
  return <main><h1>About Nexis</h1><output id="visit-count">{visits()}</output><button id="visit-button" onClick$={() => visits.set((value) => value + 1)}>Count visit</button><Link href="/" id="home-link">Return home</Link></main>
}
`,
    'utf8',
  )
  await runCli(['build'], appDir)
  server = createServer(join(appDir, 'dist/client'), { port: 4321, host: '127.0.0.1' })
  await server.listen()
})

test.afterAll(async () => {
  await server?.close()
  await rm(parent, { recursive: true, force: true })
})

test('Link swaps server-rendered outlet without a full document reload and supports browser history', async ({
  page,
}) => {
  const navigationRequests: string[] = []
  page.on('request', (request) => {
    if (request.headers()['x-nexis-navigation'] === '1') navigationRequests.push(request.url())
  })
  await page.goto('http://127.0.0.1:4321/')
  await expect(page.locator('#about-link')).toHaveAttribute('data-nx-link', 'push')
  await expect(page.locator('script[src="/nexis-navigation.js"]')).toHaveCount(1)
  await page.evaluate(() => {
    ;(globalThis as typeof globalThis & { __nexisLinkProof?: string }).__nexisLinkProof =
      'preserved'
  })
  await page.evaluate(() => scrollTo(0, 300))
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0)
  await page.locator('#about-link').click()
  await expect(page).toHaveURL('http://127.0.0.1:4321/about')
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0)
  await expect(page).toHaveTitle('About Nexis')
  await expect(page.getByRole('heading', { name: 'About Nexis' })).toBeVisible()
  await expect(page.locator('#visit-count')).toHaveText('0')
  await page.locator('#visit-button').click()
  await expect(page.locator('#visit-count')).toHaveText('1')
  await expect.poll(() => navigationRequests.some((url) => url.endsWith('/about'))).toBe(true)
  await expect
    .poll(() =>
      page.evaluate(
        () => (globalThis as typeof globalThis & { __nexisLinkProof?: string }).__nexisLinkProof,
      ),
    )
    .toBe('preserved')
  await page.goBack()
  await expect(page).toHaveURL('http://127.0.0.1:4321/')
  await expect(page.getByRole('heading', { name: 'Nexis home' })).toBeVisible()
  await expect(page).toHaveTitle('Nexis home')
  await page.goForward()
  await expect(page).toHaveURL('http://127.0.0.1:4321/about')
  await expect(page.getByRole('heading', { name: 'About Nexis' })).toBeVisible()
})

test('Link leaves native escape hatches untouched and cancels a stale visit', async ({ page }) => {
  const navigationRequests: string[] = []
  page.on('request', (request) => {
    if (request.headers()['x-nexis-navigation'] === '1') navigationRequests.push(request.url())
  })
  await page.goto('http://127.0.0.1:4321/')
  navigationRequests.length = 0
  await page.locator('#hash-link').click()
  await expect(page).toHaveURL('http://127.0.0.1:4321/#home-anchor')
  expect(navigationRequests).toHaveLength(0)

  await page.locator('#about-link').dispatchEvent('click', { button: 0, ctrlKey: true })
  await page.waitForTimeout(100)
  expect(navigationRequests).toHaveLength(0)

  await page.evaluate(() => {
    document.addEventListener('click', (event) => {
      if ((event.target as Element).closest('#external-link')) event.preventDefault()
    })
  })

  for (const [selector, event] of [
    ['#middle-link', { button: 1 }],
    ['#target-link', { button: 0 }],
    ['#download-link', { button: 0 }],
  ] as const) {
    await page.locator(selector).dispatchEvent('click', event)
    await page.waitForTimeout(25)
  }
  await page.locator('#external-link').dispatchEvent('click', { button: 0 })
  await page.waitForTimeout(25)
  expect(navigationRequests).toHaveLength(0)

  await page.route('**/slow', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 250))
    try {
      await route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><title>Slow</title><main id="app"><h1>Slow destination</h1></main>',
      })
    } catch {
      // The navigation contract intentionally aborts stale fetches.
    }
  })
  await page.evaluate(() => {
    ;(
      globalThis as typeof globalThis & { __nexisNavigate?: (href: string) => void }
    ).__nexisNavigate?.('/slow')
  })
  await page.waitForTimeout(25)
  await page.evaluate(() => {
    ;(
      globalThis as typeof globalThis & { __nexisNavigate?: (href: string) => void }
    ).__nexisNavigate?.('/about')
  })
  await expect(page).toHaveURL('http://127.0.0.1:4321/about')
  await expect(page.getByRole('heading', { name: 'About Nexis' })).toBeVisible()
  await page.waitForTimeout(300)
  await expect(page.getByRole('heading', { name: 'Slow destination' })).toHaveCount(0)
})

test('Link clears a restored-page request and falls back for a non-HTML response', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:4321/')
  await page.route('**/restored-slow', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 250))
    try {
      await route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><title>Stale</title><main id="app"><h1>Stale restored destination</h1></main>',
      })
    } catch {
      // A persisted pageshow aborts the stale request before it can commit.
    }
  })
  await page.evaluate(() => {
    ;(
      globalThis as typeof globalThis & { __nexisNavigate?: (href: string) => void }
    ).__nexisNavigate?.('/restored-slow')
  })
  await page.waitForTimeout(25)
  await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })))
  await page.waitForTimeout(300)
  await expect(page.getByRole('heading', { name: 'Nexis home' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Stale restored destination' })).toHaveCount(0)

  await page.route('**/non-html', (route) =>
    route.fulfill({ contentType: 'application/json', body: '{"status":"fallback"}' }),
  )
  await page.evaluate(() => {
    ;(
      globalThis as typeof globalThis & { __nexisNavigate?: (href: string) => void }
    ).__nexisNavigate?.('/non-html')
  })
  await expect(page).toHaveURL('http://127.0.0.1:4321/non-html')
  await expect(page.getByRole('heading', { name: 'Nexis home' })).toHaveCount(0)
})

test('Link remains an ordinary anchor when JavaScript is unavailable', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()
  try {
    await page.goto('http://127.0.0.1:4321/')
    await expect(page.locator('#about-link')).toHaveAttribute('href', '/about')
    await page.locator('#about-link').click()
    await expect(page).toHaveURL('http://127.0.0.1:4321/about')
    await expect(page.getByRole('heading', { name: 'About Nexis' })).toBeVisible()
  } finally {
    await context.close()
  }
})

test('an explicit browser-global Store survives a Link outlet replacement', async ({ page }) => {
  await page.goto('http://127.0.0.1:4321/')
  await page.locator('#global-increment').click()
  await expect(page.locator('#global-increment')).toHaveAttribute('data-applied', 'true')
  await page.locator('#about-link').click()
  await expect(page).toHaveURL('http://127.0.0.1:4321/about')
  await page.locator('#global-read').click()
  await expect(page.locator('#global-read')).toHaveText('1')
})
