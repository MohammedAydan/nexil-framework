import { createProductionServer } from '@mohammedaydan/serve'

const root = new URL('../dist/client', import.meta.url).pathname
const server = createProductionServer(root, {
  host: '0.0.0.0',
  port: Number(process.env.PORT ?? 4173),
  serverDir: new URL('../dist/server/routes', import.meta.url).pathname,
})
await server.listen()
const address = server.server.address()
const port =
  typeof address === 'object' && address ? address.port : Number(process.env.PORT ?? 4173)
console.log(`Nexis official production server running at http://localhost:${port}/`)
