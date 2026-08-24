import { createReadStream, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve } from 'node:path'

const root = resolve(process.cwd())
const server = createServer((request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname)
    const file = resolve(join(root, pathname.replace(/^\/+/, '')))
    if (!file.startsWith(`${root}/`) || !statSync(file).isFile()) {
      response.writeHead(404)
      response.end('Not Found')
      return
    }
    const contentType =
      { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' }[
        extname(file)
      ] ?? 'application/octet-stream'
    response.writeHead(200, { 'Cache-Control': 'no-store', 'Content-Type': contentType })
    createReadStream(normalize(file)).pipe(response)
  } catch {
    response.writeHead(404)
    response.end('Not Found')
  }
})

server.listen(4173, '127.0.0.1', () => {
  process.stdout.write('Nexis E2E fixture server listening on http://127.0.0.1:4173\n')
})
