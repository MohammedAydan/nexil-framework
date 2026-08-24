import { expect, test } from '@playwright/test'

test('resumable interaction executes no application handler on initial paint', async ({ page }) => {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Runtime.enable')

  const loadedChunks: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('chunk_')) loadedChunks.push(request.url())
  })

  await page.goto('/tests/e2e/fixtures/resumability/index.html', { waitUntil: 'networkidle' })
  const button = page.locator('#counter')
  const mainBefore = await page.locator('main').innerHTML()
  expect(await page.evaluate(() => window.__nexisHandlerRuns)).toBe(0)
  expect(loadedChunks).toEqual([])

  await button.click()
  await expect(button).toHaveText('1')
  expect(await page.evaluate(() => window.__nexisHandlerRuns)).toBe(1)
  expect(loadedChunks.some((url) => url.endsWith('/chunk_increment.js'))).toBe(true)
  expect(await page.locator('h1').textContent()).toBe('Counter')
  expect(await page.locator('main').innerHTML()).not.toBe(mainBefore)

  await cdp.detach()
})
