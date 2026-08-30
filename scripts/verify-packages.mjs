import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const packagesDir = join(process.cwd(), 'packages')
const packageDirs = readdirSync(packagesDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)

const AUTHOR = 'Mohammed Aydan <mohammed@nexil.dev>'
const REPO_URL = 'git+https://github.com/MohammedAydan/nexil-framework.git'

let updatedCount = 0

for (const pkgDir of packageDirs) {
  const pkgJsonPath = join(packagesDir, pkgDir, 'package.json')
  let pkg
  try {
    pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8'))
  } catch {
    continue
  }

  let modified = false

  if (!pkg.license) {
    pkg.license = 'MIT'
    modified = true
  }

  if (!pkg.author) {
    pkg.author = AUTHOR
    modified = true
  }

  if (!pkg.publishConfig || pkg.publishConfig.access !== 'public') {
    pkg.publishConfig = {
      access: 'public',
      registry: 'https://registry.npmjs.org/',
    }
    modified = true
  }

  if (!pkg.repository || typeof pkg.repository !== 'object') {
    pkg.repository = {
      type: 'git',
      url: REPO_URL,
      directory: `packages/${pkgDir}`,
    }
    modified = true
  } else if (pkg.repository.directory !== `packages/${pkgDir}`) {
    pkg.repository.directory = `packages/${pkgDir}`
    modified = true
  }

  if (modified) {
    writeFileSync(pkgJsonPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8')
    console.log(`Updated package.json metadata for ${pkg.name || pkgDir}`)
    updatedCount++
  }
}

console.log(`Verified ${packageDirs.length} packages. Updated ${updatedCount} packages.`)
