import { readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const root = resolve(new URL('..', import.meta.url).pathname)
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
