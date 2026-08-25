import { chromium } from '@playwright/test'
import { writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const root = resolve(new URL('..', import.meta.url).pathname)
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()
const consoleErrors = []
page.on('console', (message) => {
  if (message.type() === 'error' && !message.text().includes('Failed to load resource'))
    consoleErrors.push(message.text())
})
const results = []
const check = async (name, run) => {
  try {
    results.push({ name, passed: Boolean(await run()) })
  } catch (error) {
    results.push({
      name,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
await check('Home SSR stamp is visible', async () =>
  (await page.locator('h1').first().textContent()).includes('already alive'),
)
await check(
  'Home exposes a resumability boundary',
  async () => (await page.locator('[data-nx-on-click], [data-nx-on]').count()) > 0,
)
await check(
  'Home exposes no hydration root script',
  async () => !(await page.content()).includes('react-dom'),
)
await check('Signal interaction updates without hydration', async () => {
  const button = page.locator('#signal-button')
  const before = await button.textContent()
  await button.click()
  await page.waitForTimeout(350)
  const after = await button.textContent()
  return before !== after && after.includes('Signal acknowledged')
})
for (const path of [
  '/features',
  '/labs',
  '/docs/architecture',
  '/docs/resumability',
  '/docs/performance',
  '/status',
]) {
  await page.goto(`http://localhost:5173${path}`, { waitUntil: 'networkidle' })
  await check(`${path} has a document title`, async () => Boolean(await page.title()))
  await check(`${path} has a main landmark`, async () => (await page.locator('main').count()) === 1)
}
await page.goto('http://localhost:5173/missing-browser-route', { waitUntil: 'networkidle' })
await check('Missing route returns a visible 404 response', async () =>
  (await page.locator('body').textContent()).includes('Not Found'),
)
results.push({
  name: 'No browser console errors',
  passed: consoleErrors.length === 0,
  detail: consoleErrors,
})
await browser.close()
const summary = {
  generatedAt: new Date().toISOString(),
  passed: results.filter((item) => item.passed).length,
  total: results.length,
  results,
}
await writeFile(
  join(root, 'benchmarks', 'browser-evaluation.json'),
  `${JSON.stringify(summary, null, 2)}\n`,
)
console.log(JSON.stringify(summary, null, 2))
if (summary.passed !== summary.total) process.exitCode = 1
