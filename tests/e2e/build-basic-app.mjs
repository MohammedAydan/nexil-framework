import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { fontFace, transformImage } from '../../packages/media/dist/index.js'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('../../examples/basic-app', import.meta.url)))
const publicRoot = resolve(root, 'public')
const outputRoot = resolve(root, 'dist')
const outputAssets = resolve(outputRoot, 'assets')

await rm(outputRoot, { recursive: true, force: true })
await mkdir(outputAssets, { recursive: true })
await cp(publicRoot, outputRoot, { recursive: true })

const hero = await readFile(resolve(publicRoot, 'assets/hero.svg'))
let variants = []
try {
  variants = await transformImage(hero, 'hero', [320, 640])
  for (const variant of variants) {
    await writeFile(resolve(outputAssets, variant.fileName), variant.bytes)
  }
} catch (err) {
  console.warn(
    `[build-basic-app] transformImage failed (sharp not available), using fallback: ${err.message}`,
  )
  variants = []
  // Ensure fallback hero.svg is still available
  try {
    await writeFile(resolve(outputAssets, 'hero.svg'), hero)
  } catch {}
}

const fontCss = fontFace({
  family: 'Nexil Inter',
  weight: [400],
  source: '/examples/basic-app/assets/inter.woff2',
})
const css = await readFile(resolve(publicRoot, 'assets/app.css'), 'utf8')
await writeFile(resolve(outputAssets, 'app.css'), `${fontCss}${css}`, 'utf8')

const html = await readFile(resolve(publicRoot, 'index.html'), 'utf8')
const srcset = variants
  .filter((variant) => variant.format === 'webp')
  .map((variant) => `/examples/basic-app/assets/${variant.fileName} ${variant.width}w`)
  .join(', ')
const optimizedHtml = html.replace(
  'src="/examples/basic-app/assets/hero.svg"',
  `src="/examples/basic-app/assets/hero-320.webp" srcset="${srcset}"`,
)
await writeFile(resolve(outputRoot, 'index.html'), optimizedHtml, 'utf8')
await writeFile(
  resolve(outputRoot, 'media-manifest.json'),
  `${JSON.stringify(
    {
      image: variants.map(({ format, width, fileName }) => ({ format, width, fileName })),
      font: { css: fontCss, preload: '/examples/basic-app/assets/inter.woff2' },
    },
    null,
    2,
  )}\n`,
  'utf8',
)
process.stdout.write(
  `Built ${outputRoot} with ${variants.length} image variants and self-hosted font metadata\n`,
)
