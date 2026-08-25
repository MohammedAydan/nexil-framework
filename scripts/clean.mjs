// Cross-platform workspace cleaner: removes dist outputs and stale
// tsbuildinfo files (composite tsc skips emit when tsbuildinfo claims
// the project is up to date, so cleaning must remove both).
import { readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'

const root = process.cwd()

async function cleanPackage(directory) {
  const removed = []
  const dist = join(directory, 'dist')
  if (existsSync(dist)) {
    await rm(dist, { recursive: true, force: true })
    removed.push('dist')
  }
  const info = join(directory, 'tsconfig.tsbuildinfo')
  if (existsSync(info)) {
    await rm(info, { force: true })
    removed.push('tsconfig.tsbuildinfo')
  }
  if (removed.length > 0) console.log(`cleaned ${directory} (${removed.join(', ')})`)
}

await cleanPackage(root)
for (const group of ['packages', 'examples']) {
  const groupPath = join(root, group)
  if (!existsSync(groupPath)) continue
  for (const entry of await readdir(groupPath)) {
    await cleanPackage(join(groupPath, entry))
  }
}
for (const artifact of ['playwright-report', 'test-results', 'coverage']) {
  await rm(join(root, artifact), { recursive: true, force: true }).catch(() => {})
}
console.log('clean complete')
