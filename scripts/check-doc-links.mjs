import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, resolve } from 'node:path'

const roots = ['README.md', 'docs', 'packages', 'examples']
const markdownFiles = []

function walk(path) {
  if (!existsSync(path)) return
  const stat = statSync(path)
  if (stat.isDirectory()) {
    for (const entry of readdirSync(path)) {
      if (entry === 'node_modules' || entry === 'dist') continue
      walk(resolve(path, entry))
    }
  } else if (['.md', '.mdx'].includes(extname(path)) || path.endsWith('README.md')) {
    markdownFiles.push(resolve(path))
  }
}

for (const root of roots) walk(resolve(root))

const failures = []
for (const file of markdownFiles) {
  const source = readFileSync(file, 'utf8')
  const pattern = /\[[^\]]*\]\(([^)\s]+)(?:\s+[^)]*)?\)/g
  for (const match of source.matchAll(pattern)) {
    const target = match[1]
    if (!target || /^(?:https?:|mailto:|#)/i.test(target)) continue
    const localTarget = target.split('#', 1)[0]
    if (!localTarget) continue
    const candidate = resolve(file, '..', localTarget)
    if (!existsSync(candidate)) failures.push(`${file}: missing ${target}`)
  }
}

if (failures.length) {
  console.error(failures.join('\n'))
  process.exit(1)
}
console.log(`Checked ${markdownFiles.length} Markdown files; all local links resolve.`)
