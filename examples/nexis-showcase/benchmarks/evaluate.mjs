import { fileURLToPath } from 'node:url'
import { readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const results = JSON.parse(
  await readFile(join(root, 'benchmarks', 'benchmark-results.json'), 'utf8'),
)
const checks = []
function check(name, passed, detail) {
  checks.push({ name, passed: Boolean(passed), detail })
}

const measured = new Map(results.routes.measured.map((route) => [route.path, route]))
check(
  'All published routes return 200',
  results.routes.measured.every((route) => route.status === 200),
  results.routes.measured.map((route) => `${route.path}:${route.status}`).join(' '),
)
check(
  'Missing route returns 404',
  results.routes.missingRoute.status === 404,
  `status=${results.routes.missingRoute.status}`,
)
check(
  'SSR emits substantive HTML',
  results.routes.measured.every((route) => route.bytes > 600),
  results.routes.measured.map((route) => `${route.path}:${route.bytes}B`).join(' '),
)
check(
  'Nested static paths render',
  ['/docs/architecture', '/docs/resumability', '/docs/performance'].every(
    (path) => (measured.get(path)?.bytes ?? 0) > 600,
  ),
  'dynamic route expansion',
)
check(
  'Interactive route emits resumability boundary',
  measured.get('/')?.interactive === true && measured.get('/labs')?.interactive === true,
  'home and labs',
)
check(
  'Static feature page is non-interactive',
  measured.get('/features')?.interactive === false,
  `interactive=${measured.get('/features')?.interactive}`,
)
check(
  'SEO title exists on every measured page',
  results.routes.measured.every((route) => route.seo.title),
  'title tags',
)
check(
  'SEO description exists on every measured page',
  results.routes.measured.every((route) => route.seo.description),
  'description tags',
)
check(
  'Canonical and OpenGraph URL exist',
  results.routes.measured.every((route) => route.seo.canonical && route.seo.openGraph),
  'canonical + og:url',
)
check(
  'No dangerous URL protocols emitted',
  results.routes.measured.every((route) => route.seo.noDangerousUrl),
  'javascript/vbscript/data protocol scan',
)
check(
  'Bootstrap is below 2KB raw',
  results.assets.bootstrap.bytes < 2048,
  `${results.assets.bootstrap.bytes}B`,
)
check(
  'Average interactive chunk is below 2KB raw',
  results.assets.chunks.length > 0 &&
    results.assets.chunks.reduce((sum, chunk) => sum + chunk.bytes, 0) /
      results.assets.chunks.length <
      2048,
  `${results.assets.chunks.length} chunks`,
)
check(
  'Median route latency is below 250ms',
  results.routes.measured.every((route) => route.latencyMs.median < 250),
  results.routes.measured.map((route) => `${route.path}:${route.latencyMs.median}ms`).join(' '),
)
check(
  'HTML responses include an explicit cache policy',
  results.routes.measured.every(
    (route) => typeof route.cacheControl === 'string' && route.cacheControl.length > 0,
  ),
  results.routes.measured.map((route) => `${route.path}:${route.cacheControl}`).join(' '),
)
check(
  'Sitemap endpoint is crawlable and includes published routes',
  results.endpoints['/sitemap.xml']?.status === 200 &&
    results.routes.measured.every((route) =>
      results.endpoints['/sitemap.xml'].body.includes(route.path),
    ),
  `status=${results.endpoints['/sitemap.xml']?.status}`,
)
check(
  'Robots endpoint points to the sitemap',
  results.endpoints['/robots.txt']?.status === 200 &&
    results.endpoints['/robots.txt'].body.includes('Sitemap:'),
  `status=${results.endpoints['/robots.txt']?.status}`,
)
check(
  'Action endpoint returns a successful typed envelope',
  results.action.status === 200 && results.action.body?.ok === true,
  JSON.stringify(results.action.body),
)
check(
  'Crawler finds no broken internal links or duplicate metadata signatures',
  results.crawler.brokenLinks.length === 0 && results.crawler.duplicateMetadata.length === 0,
  JSON.stringify(results.crawler),
)
check(
  'Every measured page passes schema-level JSON-LD validation',
  results.routes.measured.every((route) => route.seo.jsonLdSchema),
  'schema.org context/type/name',
)
check(
  'Build-time image variants are present and non-empty',
  results.media.variants.length >= 2 && results.media.smallerOrEqual === true,
  `${results.media.variants.length} variants`,
)
check(
  'Static routes ship zero client JavaScript',
  results.routes.manifest
    .filter((route) => !route.interactive)
    .every((route) => route.clientJsBytes === 0),
  'static route client-byte floor',
)
check(
  'RSS feed is valid and includes expanded routes',
  results.endpoints['/feed.xml']?.status === 200 &&
    results.endpoints['/feed.xml'].contentType?.includes('xml') &&
    results.endpoints['/feed.xml'].body.includes('<rss') &&
    results.endpoints['/feed.xml'].body.includes('/docs/architecture'),
  `status=${results.endpoints['/feed.xml']?.status}`,
)
check(
  'Atom feed is valid and includes expanded routes',
  results.endpoints['/atom.xml']?.status === 200 &&
    results.endpoints['/atom.xml'].contentType?.includes('xml') &&
    results.endpoints['/atom.xml'].body.includes('<feed') &&
    results.endpoints['/atom.xml'].body.includes('/docs/architecture'),
  `status=${results.endpoints['/atom.xml']?.status}`,
)
check(
  'Declarative docs redirect returns 308',
  results.endpoints['/docs']?.status === 308,
  `status=${results.endpoints['/docs']?.status}`,
)
check(
  'Build-time OG cards are emitted',
  (results.assets.ogCards ?? []).length >= 1 &&
    (results.assets.ogCards ?? []).every((asset) => asset.bytes > 0),
  `${(results.assets.ogCards ?? []).length} cards`,
)
let astroComparison
try {
  astroComparison = JSON.parse(
    await readFile(join(root, 'benchmarks', 'benchmark-comparison-astro.json'), 'utf8'),
  )
} catch {}
check(
  'Nexil client JavaScript is no larger than the comparison baseline',
  astroComparison?.clientJsBytes?.gatePassed === true,
  JSON.stringify(astroComparison?.clientJsBytes ?? null),
)
let lighthouseSummary
try {
  lighthouseSummary = JSON.parse(
    await readFile(join(root, 'benchmarks', 'lighthouse-summary.json'), 'utf8'),
  )
} catch {}
check(
  'Lighthouse SEO/performance/accessibility gates pass on all routes',
  lighthouseSummary?.passed === true && lighthouseSummary.results?.length === 7,
  JSON.stringify(lighthouseSummary?.thresholds ?? null),
)

const passed = checks.filter((check) => check.passed).length
const evaluation = {
  generatedAt: new Date().toISOString(),
  passed,
  total: checks.length,
  passRate: Number(((passed / checks.length) * 100).toFixed(1)),
  checks,
}
await writeFile(
  join(root, 'benchmarks', 'evaluation.json'),
  `${JSON.stringify(evaluation, null, 2)}\n`,
)
console.log(JSON.stringify(evaluation, null, 2))
if (passed !== checks.length) process.exitCode = 1
