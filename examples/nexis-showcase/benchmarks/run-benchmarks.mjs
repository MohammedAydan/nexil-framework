import { gzipSync } from 'node:zlib'
import { readFile, readdir, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { spawn } from 'node:child_process'

const root = resolve(new URL('..', import.meta.url).pathname)
const dist = join(root, 'dist', 'client')
const outputDir = join(root, 'benchmarks')
const port = Number(process.env.BENCH_PORT ?? 5173)
const routePaths = [
  '/',
  '/features',
  '/labs',
  '/docs/architecture',
  '/docs/resumability',
  '/docs/performance',
  '/status',
]

async function fileMetrics(filePath) {
  const bytes = (await stat(filePath)).size
  const source = await readFile(filePath)
  return { bytes, gzipBytes: gzipSync(source).byteLength }
}

async function waitForServer(child) {
  let log = ''
  child.stdout.on('data', (chunk) => {
    log += chunk.toString()
  })
  child.stderr.on('data', (chunk) => {
    log += chunk.toString()
  })
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`http://localhost:${port}/`)
      if (response.status > 0) return log
    } catch {}
    await new Promise((resolveWait) => setTimeout(resolveWait, 250))
  }
  throw new Error(`Development server did not start. Output: ${log}`)
}

async function measureRoute(path) {
  const samples = []
  let lastBody = ''
  let lastStatus = 0
  let headers = {}
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const started = performance.now()
    const response = await fetch(`http://localhost:${port}${path}`, {
      headers: { accept: 'text/html' },
    })
    const body = await response.text()
    samples.push(performance.now() - started)
    lastBody = body
    lastStatus = response.status
    headers = Object.fromEntries(response.headers.entries())
  }
  const sorted = [...samples].sort((a, b) => a - b)
  const seo = {
    title: /<title>[^<]+<\/title>/.test(lastBody),
    description: /name="description"/.test(lastBody),
    canonical: /rel="canonical"/.test(lastBody),
    openGraph: /property="og:title"/.test(lastBody) && /property="og:url"/.test(lastBody),
    twitter: /name="twitter:card"/.test(lastBody),
    jsonLd: /application\/ld\+json/.test(lastBody),
    noDangerousUrl: !/(?:javascript|vbscript|data):/i.test(lastBody),
  }
  return {
    path,
    status: lastStatus,
    bytes: Buffer.byteLength(lastBody),
    gzipBytes: gzipSync(Buffer.from(lastBody)).byteLength,
    latencyMs: {
      min: Number(Math.min(...samples).toFixed(2)),
      median: Number(sorted[Math.floor(sorted.length / 2)].toFixed(2)),
      max: Number(Math.max(...samples).toFixed(2)),
    },
    cacheControl: headers['cache-control'] ?? null,
    contentType: headers['content-type'] ?? null,
    interactive: /data-nx-on-/.test(lastBody),
    seo,
  }
}

const server =
  process.env.BENCH_USE_EXISTING === '1'
    ? null
    : spawn('node', ['../../packages/cli/dist/bin.js', 'dev'], {
        cwd: root,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
try {
  if (server) await waitForServer(server)
  const manifest = JSON.parse(await readFile(join(dist, 'nexis-manifest.json'), 'utf8'))
  const routeMetrics = []
  for (const path of routePaths) routeMetrics.push(await measureRoute(path))
  const missing = await measureRoute('/missing-benchmark-route')
  const bootstrap = await fileMetrics(join(dist, 'nexis-bootstrap.js'))
  const chunkNames = await readdir(join(dist, 'nexis-chunks'))
  const chunks = []
  for (const chunkName of chunkNames.filter((name) => name.endsWith('.js')).sort()) {
    chunks.push({ name: chunkName, ...(await fileMetrics(join(dist, 'nexis-chunks', chunkName))) })
  }
  const assets = []
  for (const name of await readdir(join(dist, 'assets'))) {
    assets.push({ name, ...(await fileMetrics(join(dist, 'assets', name))) })
  }
  const results = {
    generatedAt: new Date().toISOString(),
    environment: { node: process.version, platform: process.platform, port },
    routes: { manifest: manifest.routes, measured: routeMetrics, missingRoute: missing },
    assets: { bootstrap, chunks, assets },
    totals: {
      routeCount: manifest.routes.length,
      interactiveRoutes: manifest.routes.filter((route) => route.interactive).length,
      chunkCount: chunks.length,
      clientJsBytes: bootstrap.bytes + chunks.reduce((total, chunk) => total + chunk.bytes, 0),
      clientJsGzipBytes:
        bootstrap.gzipBytes + chunks.reduce((total, chunk) => total + chunk.gzipBytes, 0),
    },
  }
  await import('node:fs/promises').then(({ writeFile }) =>
    writeFile(join(outputDir, 'benchmark-results.json'), `${JSON.stringify(results, null, 2)}\n`),
  )
  const rows = routeMetrics.concat(missing)
  const csvRows = rows.map(
    (route) =>
      `${route.path},${route.status},${route.bytes},${route.gzipBytes},${route.latencyMs.median},${route.interactive},${Object.values(route.seo).filter(Boolean).length}`,
  )
  const csv = ['path,status,bytes,gzipBytes,medianMs,interactive,seoPassCount', ...csvRows].join(
    '\n',
  )
  await import('node:fs/promises').then(({ writeFile }) =>
    writeFile(join(outputDir, 'benchmark-routes.csv'), `${csv}\n`),
  )
  console.log(JSON.stringify(results, null, 2))
} finally {
  server?.kill('SIGTERM')
}
