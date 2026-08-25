import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, resolve } from 'node:path'
import { chromium } from '@playwright/test'

const root = resolve(new URL('..', import.meta.url).pathname, '..', '..')
const showcaseRoot = resolve(new URL('.', import.meta.url).pathname, '..')
const baselineRoot = join(showcaseRoot, 'benchmarks', 'comparison', 'astro-baseline')
const nexOrigin = process.env.NEXIS_COMPARE_ORIGIN ?? 'http://127.0.0.1:4173'
const baselinePort = Number(process.env.ASTRO_COMPARE_PORT ?? 4174)
const baselineOrigin = `http://127.0.0.1:${baselinePort}`

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
}

function safePath(rootDir, requestUrl) {
  const pathname = decodeURIComponent(new URL(requestUrl, 'http://compare.invalid').pathname)
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '')
  const file = resolve(rootDir, relative)
  if (!file.startsWith(`${rootDir}/`) && file !== rootDir) return undefined
  return file
}

function startStaticServer(directory, port) {
  const server = createServer(async (request, response) => {
    const file = safePath(directory, request.url ?? '/')
    if (!file) {
      response.statusCode = 403
      response.end('Forbidden')
      return
    }
    try {
      const info = await stat(file)
      if (!info.isFile()) throw new Error('not a file')
      response.statusCode = 200
      response.setHeader('Content-Type', mime[extname(file)] ?? 'application/octet-stream')
      response.end(await readFile(file))
    } catch {
      response.statusCode = 404
      response.end('Not Found')
    }
  })
  return new Promise((resolveServer, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => resolveServer(server))
  })
}

async function sumJavaScriptFiles(files) {
  let total = 0
  for (const file of files) total += (await stat(file)).size
  return total
}

async function routeJavaScriptBytes(directory) {
  const html = await readFile(join(directory, 'index.html'), 'utf8')
  const files = new Set()
  for (const source of html.matchAll(/<script[^>]+src="([^"]+\.m?js)"/g)) files.add(source[1])
  for (const chunk of html.matchAll(/data-nx-on-[^=]+="([^"]*chunk_[a-f0-9]{12}\.js)/g))
    files.add(`/nexis-chunks/${chunk[1]}`)
  const paths = [...files].map((file) => join(directory, file.replace(/^\//, '')))
  return {
    bytes: await sumJavaScriptFiles(paths),
    files: paths.map((file) => file.slice(directory.length + 1)),
  }
}

async function measure(browser, origin, path = '/') {
  const page = await browser.newPage()
  await page.addInitScript(() => {
    window.__nexisVitals = { lcp: null, cls: 0, inp: null }
    new PerformanceObserver((list) => {
      const entries = list.getEntries()
      const last = entries.at(-1)
      if (last) window.__nexisVitals.lcp = last.startTime
    }).observe({ type: 'largest-contentful-paint', buffered: true })
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) window.__nexisVitals.cls += entry.value
      }
    }).observe({ type: 'layout-shift', buffered: true })
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const duration = entry.processingStart + entry.duration - entry.startTime
          window.__nexisVitals.inp = Math.max(window.__nexisVitals.inp ?? 0, duration)
        }
      }).observe({ type: 'event', buffered: true, durationThreshold: 16 })
    } catch {}
  })
  const started = performance.now()
  await page.goto(`${origin}${path}`, { waitUntil: 'load' })
  await page.waitForTimeout(250)
  const metrics = await page.evaluate(() => {
    const navigation = performance.getEntriesByType('navigation')[0]
    return {
      ttfbMs: navigation?.responseStart ?? null,
      ...window.__nexisVitals,
    }
  })
  await page.close()
  return { ...metrics, wallMs: performance.now() - started }
}

const baselineServer = await startStaticServer(baselineRoot, baselinePort)
const browser = await chromium.launch({ headless: true })
try {
  const [nexis, astro] = await Promise.all([
    measure(browser, nexOrigin),
    measure(browser, baselineOrigin),
  ])
  const nexisBundle = await routeJavaScriptBytes(join(showcaseRoot, 'dist', 'client'))
  const astroBundle = await routeJavaScriptBytes(baselineRoot)
  const clientJsBytes = nexisBundle.bytes
  const astroJsBytes = astroBundle.bytes
  const result = {
    generatedAt: new Date().toISOString(),
    methodology:
      'Local Chromium lab comparison; Astro baseline is a checked-in equivalent island fixture, not an Astro framework build.',
    routes: { nexis: '/', astro: '/' },
    clientJsBytes: {
      nexis: clientJsBytes,
      astro: astroJsBytes,
      nexisFiles: nexisBundle.files,
      astroFiles: astroBundle.files,
      gatePassed: clientJsBytes <= astroJsBytes,
    },
    vitals: { nexis, astro },
  }
  console.log(JSON.stringify(result, null, 2))
  await (
    await import('node:fs/promises')
  ).writeFile(
    join(showcaseRoot, 'benchmarks', 'benchmark-comparison-astro.json'),
    `${JSON.stringify(result, null, 2)}\n`,
  )
  if (!result.clientJsBytes.gatePassed) process.exitCode = 1
} finally {
  await browser.close()
  baselineServer.close()
}
