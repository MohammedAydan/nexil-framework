import { expect, test } from '@playwright/test'

test('landing page ships a responsive visual baseline without client JavaScript', async ({
  page,
}) => {
  const scriptRequests: string[] = []
  page.on('request', (request) => {
    if (request.resourceType() === 'script') scriptRequests.push(request.url())
  })

  await page.goto('/examples/landing-page/')
  await expect(page).toHaveTitle('Nexil — HTML-first web apps')
  await expect(
    page.getByRole('heading', { name: 'Ship the page before the script.' }),
  ).toBeVisible()
  await expect(page.getByText('0 JS on static routes')).toBeVisible()
  await expect(page.getByText('HTML at the edge')).toBeVisible()
  await expect(
    page.locator('link[rel="stylesheet"][href="/examples/landing-page/styles.css"]'),
  ).toHaveCount(1)
  await expect(page.locator('.hero-console')).toBeVisible()
  expect(scriptRequests).toEqual([])
})

test('landing page remains usable on a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/examples/landing-page/')
  await expect(
    page.getByRole('heading', { name: 'Ship the page before the script.' }),
  ).toBeVisible()
  await expect(page.locator('body')).toHaveCSS('overflow-x', 'visible')
  await expect(page.getByRole('link', { name: 'Build your first route' })).toBeVisible()
})
