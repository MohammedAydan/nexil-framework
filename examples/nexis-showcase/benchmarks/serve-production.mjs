import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize, relative, resolve } from 'node:path'

const root = resolve(new URL('../dist/client', import.meta.url).pathname)
const port = Number(process.env.PORT ?? 4173)
const mime = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
}

function candidatePaths(pathname) {
  const clean = pathname.replace(/^\/+/, '').replace(/\/$/, '')
  if (clean.includes('..')) return []
  if (!clean) return ['index.html']
  return [`${clean}/index.html`, clean]
}

const server = createServer(async (request, response) => {
  const pathname = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`)
    .pathname
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' })
    response.end('Method Not Allowed')
    return
  }
  for (const candidate of candidatePaths(pathname)) {
    const file = normalize(join(root, candidate))
    if (relative(root, file).startsWith('..')) continue
    try {
      const info = await stat(file)
      if (!info.isFile()) continue
      const body = await readFile(file)
      const isAsset = candidate.startsWith('assets/') || candidate.startsWith('nexis-')
      response.writeHead(200, {
        'Content-Type': mime[extname(file)] ?? 'application/octet-stream',
        'Cache-Control': isAsset
          ? 'public, max-age=31536000, immutable'
          : 'public, max-age=0, must-revalidate',
        'X-Content-Type-Options': 'nosniff',
      })
      response.end(request.method === 'HEAD' ? undefined : body)
      return
    } catch {}
  }
  response.writeHead(404, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  response.end('Not Found')
})
server.listen(port, '0.0.0.0', () =>
  console.log(`Nexis production static server running at http://localhost:${port}/`),
)
