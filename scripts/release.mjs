import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'

const args = process.argv.slice(2)
const isDryRun = args.includes('--dry-run')
const versionArg = args.find((a) => !a.startsWith('-')) || 'patch'

const rootPkgPath = join(process.cwd(), 'package.json')
const rootPkg = JSON.parse(readFileSync(rootPkgPath, 'utf8'))
const currentVersion = rootPkg.version || '0.2.0'

function bumpVersion(current, type) {
  const parts = current.split('.').map(Number)
  if (parts.length !== 3 || parts.some(isNaN)) {
    throw new Error(`Invalid semver version: ${current}`)
  }
  if (type === 'major') return `${parts[0] + 1}.0.0`
  if (type === 'minor') return `${parts[0]}.${parts[1] + 1}.0`
  if (type === 'patch') return `${parts[0]}.${parts[1]}.${parts[2] + 1}`
  if (/^\d+\.\d+\.\d+$/.test(type)) return type
  throw new Error(`Unknown bump type or version format: ${type}`)
}

const nextVersion = bumpVersion(currentVersion, versionArg)
console.log(
  `Bumping Nexil workspace from v${currentVersion} to v${nextVersion} (dry-run: ${isDryRun})...`,
)

// 1. Update root package.json
rootPkg.version = nextVersion
if (!isDryRun) {
  writeFileSync(rootPkgPath, JSON.stringify(rootPkg, null, 2) + '\n', 'utf8')
}

// 2. Update all packages
const packagesDir = join(process.cwd(), 'packages')
const packageDirs = readdirSync(packagesDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)

for (const pkgDir of packageDirs) {
  const pkgJsonPath = join(packagesDir, pkgDir, 'package.json')
  let pkg
  try {
    pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8'))
  } catch {
    continue
  }

  pkg.version = nextVersion
  if (!isDryRun) {
    writeFileSync(pkgJsonPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8')
  }
  console.log(`  Updated ${pkg.name} -> v${nextVersion}`)
}

console.log(`\n🎉 Successfully updated all packages to v${nextVersion}!`)
if (!isDryRun) {
  console.log(`To publish to npm, run:\n  pnpm publish:npm`)
}
