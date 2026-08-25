import { chromium } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

const baseUrl = process.env.BASE_URL ?? 'http://127.0.0.1:5173'
const outputDir = new URL('./screenshots/', import.meta.url).pathname
const routes = ['/', '/features', '/labs', '/docs/performance']

await mkdir(outputDir, { recursive: true })
const browser = await chromium.launch({ headless: true })
try {
  for (const viewport of [
    { name: 'desktop', width: 1440, height: 1000 },
    { name: 'mobile', width: 390, height: 844 },
  ]) {
    const page = await browser.newPage({ viewport })
    for (const route of routes) {
      const slug = route === '/' ? 'home' : route.slice(1).replaceAll('/', '-')
      await page.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle' })
      await page.screenshot({
        path: `${outputDir}${viewport.name}-${slug}.png`,
        fullPage: true,
      })
    }
    await page.close()
  }
} finally {
  await browser.close()
}

console.log(`Screenshots written to ${outputDir}`)
