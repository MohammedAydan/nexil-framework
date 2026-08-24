import { cp, mkdir, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const source = join(root, 'examples', 'landing-page')
const output = join(source, 'dist')
await rm(output, { recursive: true, force: true })
await mkdir(output, { recursive: true })
await cp(join(source, 'index.html'), join(output, 'index.html'))
await cp(join(source, 'styles.css'), join(output, 'styles.css'))
console.log(`Built ${output}`)
