import { expect, test } from '@playwright/test'

const live = process.env.SHOWCASE_BASE_URL ?? 'http://127.0.0.1:5173'

test.describe('Nexil showcase', () => {
  test('renders SSR content and resumes interaction on demand', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })
    await page.goto(`${live}/`, { waitUntil: 'networkidle' })
    await expect(page.locator('h1').first()).toContainText('already alive')
    await expect(page.locator('main')).toHaveCount(1)
    await expect(page.locator('[data-nx-on-click]')).toHaveCount(1)
    const button = page.locator('#signal-button')
    const before = await button.textContent()
    await button.click()
    await expect(button).toContainText('Signal acknowledged')
    expect(await button.textContent()).not.toBe(before)
    expect(errors).toEqual([])
  })

  test('renders every showcase route with complete head metadata', async ({ page }) => {
    for (const path of [
      '/',
      '/features',
      '/labs',
      '/docs/architecture',
      '/docs/resumability',
      '/docs/performance',
      '/status',
    ]) {
      const response = await page.goto(`${live}${path}`, { waitUntil: 'networkidle' })
      expect(response?.status(), path).toBe(200)
      await expect(page.locator('title')).toHaveCount(1)
      await expect(page.locator('meta[name="description"]')).toHaveCount(1)
      await expect(page.locator('link[rel="canonical"]')).toHaveCount(1)
      await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(1)
    }
  })

  test('returns 404 for an unknown route', async ({ page }) => {
    const response = await page.goto(`${live}/showcase-not-found`, { waitUntil: 'networkidle' })
    expect(response?.status()).toBe(404)
    await expect(page.locator('body')).toContainText('Not Found')
  })
})

test('posts the progressive action form through the Nexil endpoint', async ({ page }) => {
  await page.goto(`${live}/labs`, { waitUntil: 'networkidle' })
  await expect(page.locator('#action-form')).toHaveAttribute('data-nx-on-submit', /chunk_/)
  await page.locator('#action-name').fill('Ada')
  await page.locator('#action-form button[type="submit"]').click()
  await expect(page.locator('#action-output')).toHaveText('Action result: queued:Ada')
})
