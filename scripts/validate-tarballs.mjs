#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'

const EXPECTED = [
  { name: '@nexil/core', dir: 'packages/nexil', main: 'dist/index.js', types: 'dist/index.d.ts' },
  {
    name: '@nexil/vite-plugin',
    dir: 'packages/vite-plugin',
    main: 'dist/index.js',
    types: 'dist/index.d.ts',
  },
  {
    name: '@nexil/cli',
    dir: 'packages/cli',
    main: 'dist/index.js',
    types: 'dist/index.d.ts',
    bin: 'dist/bin.js',
  },
  {
    name: 'create-nexil',
    dir: 'packages/create-nexil',
    main: 'dist/scaffold.js',
    types: 'dist/scaffold.d.ts',
    bin: 'dist/bin.js',
  },
]

let failed = false

function log(...args) {
  console.log(...args)
}
function error(...args) {
  console.error(...args)
  failed = true
}

for (const pkg of EXPECTED) {
  const pkgJsonPath = join(pkg.dir, 'package.json')
  if (!existsSync(pkgJsonPath)) {
    error(`::error::Missing ${pkgJsonPath}`)
    continue
  }
  const manifest = JSON.parse(readFileSync(pkgJsonPath, 'utf8'))
  if (manifest.name !== pkg.name) {
    error(`::error::${pkg.dir} package.json name is ${manifest.name}, expected ${pkg.name}`)
  }
  if (!/^\d+\.\d+\.\d+(-.*)?$/.test(manifest.version)) {
    error(`::error::${pkg.name} version is ${manifest.version}, expected semver`)
  }
  if (!manifest.publishConfig || manifest.publishConfig.access !== 'public') {
    error(`::error::${pkg.name} missing publishConfig.access public`)
  }
  if (manifest.publishConfig?.registry !== 'https://registry.npmjs.org/') {
    error(`::error::${pkg.name} publishConfig.registry should be https://registry.npmjs.org/`)
  }
  // Check main/module/types/exports
  if (manifest.main && !existsSync(join(pkg.dir, manifest.main))) {
    error(`::error::${pkg.name} main ${manifest.main} does not exist in ${pkg.dir}`)
  }
  if (manifest.module && !existsSync(join(pkg.dir, manifest.module))) {
    error(`::error::${pkg.name} module ${manifest.module} does not exist`)
  }
  if (manifest.types && !existsSync(join(pkg.dir, manifest.types))) {
    error(`::error::${pkg.name} types ${manifest.types} does not exist`)
  }
  if (!manifest.exports) {
    error(`::error::${pkg.name} missing exports`)
  } else {
    const dot = manifest.exports['.']
    if (!dot) error(`::error::${pkg.name} missing exports["."]`)
    else {
      const typesPath = dot.types || dot.typings
      const defaultPath = dot.default || dot.import || dot.require
      if (typesPath && !existsSync(join(pkg.dir, typesPath.replace(/^\.\//, '')))) {
        error(`::error::${pkg.name} exports["."].types ${typesPath} missing file`)
      }
      if (defaultPath && !existsSync(join(pkg.dir, defaultPath.replace(/^\.\//, '')))) {
        error(`::error::${pkg.name} exports["."].default ${defaultPath} missing file`)
      }
    }
  }
  if (pkg.bin) {
    const binVal =
      typeof manifest.bin === 'string'
        ? manifest.bin
        : manifest.bin
          ? Object.values(manifest.bin)[0]
          : undefined
    if (!binVal) error(`::error::${pkg.name} missing bin`)
    else if (!existsSync(join(pkg.dir, binVal))) error(`::error::${pkg.name} bin ${binVal} missing`)
    if (pkg.bin && !existsSync(join(pkg.dir, pkg.bin)))
      error(`::error::${pkg.name} expected bin dist file ${pkg.bin} missing`)
  }
  // Check files exist: dist and README
  if (!existsSync(join(pkg.dir, 'dist')))
    error(`::error::${pkg.name} dist directory missing (run pnpm build)`)
  if (!existsSync(join(pkg.dir, 'README.md'))) error(`::error::${pkg.name} README.md missing`)
  // Check dist contains expected entry
  if (pkg.main && !existsSync(join(pkg.dir, pkg.main)))
    error(`::error::${pkg.name} dist main file ${pkg.main} missing`)
  if (pkg.types && !existsSync(join(pkg.dir, pkg.types)))
    error(`::error::${pkg.name} dist types file ${pkg.types} missing`)

  // Run npm pack --dry-run and capture (npm prints notices to stderr, so merge)
  try {
    const out = execSync('npm pack --dry-run 2>&1', { cwd: pkg.dir, encoding: 'utf8', shell: true })
    const combined = out
    // Check for workspace:* leak
    if (combined.includes('workspace:')) {
      error(`::error::${pkg.name} tarball contains workspace:* leak`)
    }
    if (/test\.js|test\.d\.ts/.test(combined)) {
      error(`::error::${pkg.name} tarball contains test artifacts`)
    }
    // verify expected files in notice
    if (!combined.includes('dist/')) error(`::error::${pkg.name} pack output missing dist/ entries`)
    if (pkg.name === '@nexil/core') {
      if (!combined.includes('dist/index.js'))
        error(`::error::@nexil/core missing dist/index.js in pack`)
      if (!combined.includes('dist/index.d.ts'))
        error(`::error::@nexil/core missing dist/index.d.ts in pack`)
      if (!combined.includes('dist/client/index.js'))
        error(`::error::@nexil/core missing dist/client/index.js`)
      if (!combined.includes('dist/server/index.js'))
        error(`::error::@nexil/core missing dist/server/index.js`)
      if (!combined.includes('dist/router/index.js'))
        error(`::error::@nexil/core missing dist/router/index.js`)
    }
    if (pkg.name === '@nexil/cli' || pkg.name === 'create-nexil') {
      if (!combined.includes('dist/bin.js'))
        error(`::error::${pkg.name} missing dist/bin.js in pack`)
    }
    // Print publish-compatible line for workflow grep
    log(`+ ${pkg.name}@${manifest.version}`)
    // Also print pack details for debugging
    for (const line of combined.split('\n').filter((l) => l.includes('npm notice'))) {
      log(line)
    }
  } catch (e) {
    const out = (e.stdout || '') + (e.stderr || '') + (e.message || '')
    error(`::error::npm pack --dry-run failed for ${pkg.name}: ${out.slice(0, 2000)}`)
  }
}

if (failed) {
  error('::error::Tarball validation failed')
  process.exit(1)
} else {
  const versions = EXPECTED.map((p) => {
    try {
      const m = JSON.parse(readFileSync(join(p.dir, 'package.json'), 'utf8'))
      return `${p.name}@${m.version}`
    } catch {
      return p.name
    }
  }).join(', ')
  log(`Tarball validation passed for 4 packages: ${versions}`)
  process.exit(0)
}
