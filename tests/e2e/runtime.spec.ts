import { expect, test } from '@playwright/test'

test('basic static route ships no JavaScript requests', async ({ page }) => {
  const scripts: string[] = []
  page.on('request', (request) => {
    if (request.resourceType() === 'script') scripts.push(request.url())
  })

  await page.goto('/examples/basic-app/', { waitUntil: 'networkidle' })

  expect(await page.locator('h1').textContent()).toBe('Nexis Basic App')
  expect(scripts).toEqual([])
})

test('basic counter has no application handler before click and loads one lazy chunk after click', async ({
  page,
}) => {
  const chunks: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('chunk_')) chunks.push(request.url())
  })

  await page.goto('/examples/basic-app/counter/', { waitUntil: 'networkidle' })
  const button = page.locator('#counter')
  const mainBefore = await page.locator('main').innerHTML()

  expect(await page.evaluate(() => window.__nexisCounterHandlerRuns ?? 0)).toBe(0)
  expect(chunks).toEqual([])

  await button.click()
  await expect(button).toHaveText('1')
  expect(await page.evaluate(() => window.__nexisCounterHandlerRuns)).toBe(1)
  expect(chunks.some((url) => url.endsWith('/chunk_increment.js'))).toBe(true)
  expect(await page.locator('main').innerHTML()).not.toBe(mainBefore)
})

test('streaming SSR route renders request-local data without client JavaScript', async ({
  page,
}) => {
  const response = await page.goto('/examples/basic-app/ssr-stream', { waitUntil: 'networkidle' })
  expect(response?.status()).toBe(200)
  expect(await page.locator('h1').textContent()).toBe('Streaming SSR')
  expect(await page.locator('[data-data-source="request-local"]').textContent()).toContain(
    'request-local loader',
  )
  expect(await page.locator('script').count()).toBe(0)
})
