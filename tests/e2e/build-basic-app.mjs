import { cp, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(new URL('../../examples/basic-app', import.meta.url).pathname)
await mkdir(resolve(root, 'dist'), { recursive: true })
await cp(resolve(root, 'public'), resolve(root, 'dist'), { recursive: true })
process.stdout.write(`Built ${resolve(root, 'dist')}\n`)
