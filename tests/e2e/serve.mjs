import { createReadStream, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve } from 'node:path'

const root = resolve(process.cwd())
const server = createServer((request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname)
    if (
      pathname === '/examples/basic-app/ssr-stream' ||
      pathname === '/examples/basic-app/ssr-stream/'
    ) {
      response.writeHead(200, {
        'Cache-Control': 'private, no-store',
        'Content-Type': 'text/html; charset=utf-8',
        'Transfer-Encoding': 'chunked',
      })
      response.write(
        '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Nexis Streaming SSR</title></head><body><main><h1>Streaming SSR</h1>',
      )
      response.write(
        '<p data-data-source="request-local">Data streamed from a request-local loader.</p></main></body></html>',
      )
      response.end()
      return
    }
    const relativePath = pathname.replace(/^\/+/, '')
    const example = ['examples/basic-app', 'examples/landing-page'].find(
      (candidate) => relativePath === candidate || relativePath.startsWith(`${candidate}/`),
    )
    const file = example
      ? resolve(join(root, relativePath.replace(example, `${example}/dist`)))
      : resolve(join(root, relativePath))
    if (!file.startsWith(`${root}/`)) {
      response.writeHead(404)
      response.end('Not Found')
      return
    }
    const servedFile = statSync(file).isDirectory() ? resolve(file, 'index.html') : file
    if (!servedFile.startsWith(`${root}/`) || !statSync(servedFile).isFile()) {
      response.writeHead(404)
      response.end('Not Found')
      return
    }
    const contentType =
      {
        '.avif': 'image/avif',
        '.css': 'text/css; charset=utf-8',
        '.html': 'text/html; charset=utf-8',
        '.js': 'text/javascript; charset=utf-8',
        '.svg': 'image/svg+xml',
        '.webp': 'image/webp',
        '.woff2': 'font/woff2',
      }[extname(servedFile)] ?? 'application/octet-stream'
    response.writeHead(200, { 'Cache-Control': 'no-store', 'Content-Type': contentType })
    createReadStream(normalize(servedFile)).pipe(response)
  } catch {
    response.writeHead(404)
    response.end('Not Found')
  }
})

server.listen(4173, '127.0.0.1', () => {
  process.stdout.write('Nexis E2E fixture server listening on http://127.0.0.1:4173\n')
})
