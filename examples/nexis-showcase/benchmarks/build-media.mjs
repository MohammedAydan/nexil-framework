import { fileURLToPath } from 'node:url'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { buildImageVariants } from '@nexil/media'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const source = join(root, 'public', 'nexis-showcase.svg')
const client = join(root, 'dist', 'client')
const output = join(client, 'assets', 'images')
await mkdir(output, { recursive: true })
await copyFile(source, join(client, 'nexis-showcase.svg'))
const variants = await buildImageVariants({
  sourcePath: source,
  outputDir: output,
  fileBase: 'nexis-showcase',
  widths: [320, 640],
})
if (variants.length > 0) {
  const htmlFiles = [join(client, 'index.html')]
  for (const file of htmlFiles) {
    const html = await readFile(file, 'utf8')
    const optimized = html.replaceAll(
      '/nexis-showcase.svg',
      '/assets/images/nexis-showcase-320.webp',
    )
    await writeFile(file, optimized, 'utf8')
  }
}
await writeFile(
  join(client, 'media-manifest.json'),
  `${JSON.stringify({ source: '/nexis-showcase.svg', variants }, null, 2)}\n`,
  'utf8',
)
console.log(`Nexil media build produced ${variants.length} variants.`)
