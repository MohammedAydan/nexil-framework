import { gzipSync } from 'node:zlib'
import { readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { spawn } from 'node:child_process'

const root = resolve(new URL('..', import.meta.url).pathname)
const dist = join(root, 'dist', 'client')
const outputDir = join(root, 'benchmarks')
const port = Number(process.env.BENCH_PORT ?? 5173)
const base = `http://127.0.0.1:${port}`
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

async function walkFiles(directory, prefix = '') {
  const files = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name)
    const name = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) files.push(...(await walkFiles(file, name)))
    else files.push({ name, file })
  }
  return files
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
      const response = await fetch(`${base}/`)
      if (response.status > 0) return log
    } catch {}
    await new Promise((resolveWait) => setTimeout(resolveWait, 250))
  }
  throw new Error(`Benchmark server did not start. Output: ${log}`)
}

async function measureRoute(path) {
  const samples = []
  let lastBody = ''
  let lastStatus = 0
  let headers = {}
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const started = performance.now()
    const response = await fetch(`${base}${path}`, { headers: { accept: 'text/html' } })
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
    jsonLdSchema: (() => {
      const match = lastBody.match(/<script type="application\/ld\+json">([^<]+)<\/script>/)
      if (!match?.[1]) return false
      try {
        const data = JSON.parse(match[1])
        return (
          data?.['@context'] === 'https://schema.org' &&
          typeof data?.['@type'] === 'string' &&
          typeof data?.name === 'string'
        )
      } catch {
        return false
      }
    })(),
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
    body: lastBody,
  }
}

async function crawl(routes) {
  const brokenLinks = []
  const canonicalSignatures = new Map()
  for (const route of routes) {
    const body = route.body
    const links = [...body.matchAll(/(?:href|src)="(\/[^"#?]*)/g)]
      .map((match) => match[1])
      .filter(Boolean)
    for (const link of new Set(links)) {
      if (link.startsWith('/__') || /\.(?:css|js|svg|png|jpg|jpeg|webp|avif|woff2?)$/i.test(link))
        continue
      const response = await fetch(`${base}${link}`, { headers: { accept: 'text/html' } })
      if (response.status >= 400)
        brokenLinks.push({ from: route.path, link, status: response.status })
    }
    const canonical = body.match(/<link rel="canonical" href="([^"]+)"/i)?.[1] ?? ''
    const title = body.match(/<title>([^<]+)<\/title>/i)?.[1] ?? ''
    const description = body.match(/<meta name="description" content="([^"]*)"/i)?.[1] ?? ''
    const signature = `${canonical}|${title}|${description}`
    canonicalSignatures.set(signature, (canonicalSignatures.get(signature) ?? 0) + 1)
  }
  return {
    brokenLinks,
    duplicateMetadata: [...canonicalSignatures]
      .filter(([, count]) => count > 1)
      .map(([signature, count]) => ({ signature, count })),
  }
}

const server =
  process.env.BENCH_USE_EXISTING === '1'
    ? null
    : spawn(
        'node',
        process.env.BENCH_SERVER === 'dev'
          ? ['../../packages/cli/dist/bin.js', 'dev']
          : ['benchmarks/serve-production.mjs'],
        {
          cwd: root,
          env: { ...process.env, NEXIS_HOST: '127.0.0.1', NEXIS_PORT: String(port) },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      )
try {
  if (server) await waitForServer(server)
  const manifest = JSON.parse(await readFile(join(dist, 'nexis-manifest.json'), 'utf8'))
  const measured = []
  for (const path of routePaths) measured.push(await measureRoute(path))
  const missing = await measureRoute('/missing-benchmark-route')
  const endpointChecks = {}
  for (const path of ['/sitemap.xml', '/robots.txt', '/feed.xml', '/atom.xml', '/docs']) {
    const response = await fetch(`${base}${path}`, path === '/docs' ? { redirect: 'manual' } : {})
    endpointChecks[path] = {
      status: response.status,
      contentType: response.headers.get('content-type'),
      body: await response.text(),
    }
  }
  const actionResponse = await fetch(`${base}/__nexis/actions/labs/submit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': `benchmark-action-${Date.now()}`,
    },
    body: JSON.stringify({ name: 'Ada' }),
  })
  const action = { status: actionResponse.status, body: await actionResponse.json() }
  const crawlResult = await crawl(measured)
  const bootstrap = await fileMetrics(join(dist, 'nexis-bootstrap.js'))
  const chunkNames = await readdir(join(dist, 'nexis-chunks'))
  const chunks = []
  for (const chunkName of chunkNames.filter((name) => name.endsWith('.js')).sort())
    chunks.push({ name: chunkName, ...(await fileMetrics(join(dist, 'nexis-chunks', chunkName))) })
  const assets = []
  for (const asset of await walkFiles(join(dist, 'assets')))
    assets.push({ name: asset.name, ...(await fileMetrics(asset.file)) })
  const ogCards = []
  for (const asset of await walkFiles(join(dist, 'og')))
    ogCards.push({ name: asset.name, ...(await fileMetrics(asset.file)) })
  let media = { variants: [], smallerOrEqual: true }
  try {
    const manifestPath = join(dist, 'media-manifest.json')
    const mediaManifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    media = {
      variants: mediaManifest.variants ?? [],
      smallerOrEqual: (mediaManifest.variants ?? []).every((variant) => variant.bytes > 0),
    }
  } catch {}
  const results = {
    generatedAt: new Date().toISOString(),
    environment: { node: process.version, platform: process.platform, port },
    routes: {
      manifest: manifest.routes,
      measured: measured.map(({ body, ...route }) => route),
      missingRoute: missing,
    },
    endpoints: endpointChecks,
    action,
    crawler: crawlResult,
    media,
    assets: { bootstrap, chunks, assets, ogCards },
    totals: {
      routeCount: manifest.routes.length,
      interactiveRoutes: manifest.routes.filter((route) => route.interactive).length,
      chunkCount: chunks.length,
      clientJsBytes: bootstrap.bytes + chunks.reduce((total, chunk) => total + chunk.bytes, 0),
      clientJsGzipBytes:
        bootstrap.gzipBytes + chunks.reduce((total, chunk) => total + chunk.gzipBytes, 0),
    },
  }
  await writeFile(
    join(outputDir, 'benchmark-results.json'),
    `${JSON.stringify(results, null, 2)}\n`,
  )
  const rows = measured.concat(missing)
  const csvRows = rows.map(
    (route) =>
      `${route.path},${route.status},${route.bytes},${route.gzipBytes},${route.latencyMs.median},${route.interactive},${Object.values(route.seo).filter(Boolean).length}`,
  )
  await writeFile(
    join(outputDir, 'benchmark-routes.csv'),
    `${['path,status,bytes,gzipBytes,medianMs,interactive,seoPassCount', ...csvRows].join('\n')}\n`,
  )
  console.log(JSON.stringify(results, null, 2))
} finally {
  server?.kill('SIGTERM')
}
