import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { join, resolve } from 'node:path'
import lighthouse from 'lighthouse'
import * as chromeLauncher from 'chrome-launcher'

const showcaseRoot = resolve(new URL('.', import.meta.url).pathname, '..')
const outputDir = join(showcaseRoot, 'benchmarks')
const origin = process.env.LIGHTHOUSE_ORIGIN ?? 'http://127.0.0.1:4173'
const routes = [
  '/',
  '/features',
  '/labs',
  '/docs/architecture',
  '/docs/resumability',
  '/docs/performance',
  '/status',
]
const thresholds = { seo: 1, performance: 0.95, accessibility: 0.95 }

async function isUp(url) {
  try {
    const response = await fetch(url)
    return response.status < 500
  } catch {
    return false
  }
}

async function startServerIfNeeded() {
  if (await isUp(origin)) return undefined
  if (process.env.LIGHTHOUSE_USE_EXISTING === '1')
    throw new Error(`Lighthouse origin is unavailable: ${origin}`)
  const target = new URL(origin)
  const server = spawn('node', ['benchmarks/serve-production.mjs'], {
    cwd: showcaseRoot,
    env: { ...process.env, NEXIS_HOST: '127.0.0.1', NEXIS_PORT: target.port || '4173' },
    stdio: 'inherit',
  })
  for (let attempts = 0; attempts < 40; attempts += 1) {
    if (await isUp(origin)) return server
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250))
  }
  server.kill()
  throw new Error(`Timed out waiting for Lighthouse origin: ${origin}`)
}

const server = await startServerIfNeeded()
const chrome = await chromeLauncher.launch({
  chromeFlags: ['--headless', '--no-sandbox', '--disable-gpu'],
})
await mkdir(outputDir, { recursive: true })
const results = []
try {
  for (const route of routes) {
    const url = `${origin}${route}`
    const runnerResult = await lighthouse(url, {
      port: chrome.port,
      output: 'json',
      logLevel: 'error',
      formFactor: 'mobile',
      screenEmulation: {
        mobile: true,
        width: 390,
        height: 844,
        deviceScaleFactor: 1,
        disabled: false,
      },
      onlyCategories: ['performance', 'accessibility', 'seo'],
    })
    if (!runnerResult?.lhr) throw new Error(`Lighthouse returned no report for ${url}`)
    const report = runnerResult.lhr
    const scores = {
      seo: report.categories.seo?.score ?? 0,
      performance: report.categories.performance?.score ?? 0,
      accessibility: report.categories.accessibility?.score ?? 0,
    }
    const result = {
      route,
      url,
      generatedAt: new Date().toISOString(),
      scores,
      gates: {
        seo: scores.seo >= thresholds.seo,
        performance: scores.performance >= thresholds.performance,
        accessibility: scores.accessibility >= thresholds.accessibility,
      },
    }
    results.push(result)
    await writeFile(
      join(
        outputDir,
        `lighthouse-${route === '/' ? 'home' : route.slice(1).replaceAll('/', '-')}.json`,
      ),
      `${JSON.stringify(report, null, 2)}\n`,
    )
  }
} finally {
  await chrome.kill()
  if (server) server.kill()
}
const summary = {
  generatedAt: new Date().toISOString(),
  origin,
  thresholds,
  passed: results.every((result) => Object.values(result.gates).every(Boolean)),
  results,
}
await writeFile(join(outputDir, 'lighthouse-summary.json'), `${JSON.stringify(summary, null, 2)}\n`)
console.log(JSON.stringify(summary, null, 2))
if (!summary.passed) process.exitCode = 1
