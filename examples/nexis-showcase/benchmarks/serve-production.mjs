import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'
import { createProductionServer } from '@nexil/serve'

const root = fileURLToPath(new URL('../dist/client', import.meta.url))
const config = JSON.parse(await readFile(new URL('../nexis.config.json', import.meta.url), 'utf8'))
const server = createProductionServer(root, {
  host: '0.0.0.0',
  port: Number(process.env.PORT ?? process.env.NEXIS_PORT ?? 4173),
  serverDir: fileURLToPath(new URL('../dist/server/routes', import.meta.url)),
  ...(config.redirects ? { redirects: config.redirects } : {}),
  telemetry: { onEvent: () => undefined },
})
await server.listen()
const address = server.server.address()
const port =
  typeof address === 'object' && address
    ? address.port
    : Number(process.env.PORT ?? process.env.NEXIS_PORT ?? 4173)
console.log(`Nexil official production server running at http://localhost:${port}/`)
