import { readdir, stat, mkdir, writeFile } from 'node:fs/promises'
import { join, relative, dirname, extname, resolve } from 'node:path'
import { existsSync } from 'node:fs'
import { parse } from '@babel/parser'
import traverseModule from '@babel/traverse'
import MagicString from 'magic-string'

const traverse =
  (traverseModule as unknown as { default?: typeof traverseModule }).default ?? traverseModule

export type StoreKind = 'modular' | 'unified-file' | 'unified-folder'

export interface StoreDescriptor {
  readonly id: string
  readonly kind: StoreKind
  readonly entry: string // absolute path to entry file (store.ts or user.ts or index.ts)
  readonly directory?: string // for modular, the store directory
}

const STORE_ENTRY_BASENAMES = new Set([
  'store.ts',
  'store.js',
  'store.tsx',
  'store.jsx',
  'store.mts',
  'store.mjs',
])
const UNIFIED_INDEX_BASENAMES = new Set([
  'index.ts',
  'index.js',
  'index.tsx',
  'index.jsx',
  'index.mts',
  'index.mjs',
])
const STORE_FILE_EXTENSIONS = new Set(['.ts', '.js', '.tsx', '.jsx', '.mts', '.mjs'])
const IGNORED_BASENAMES = new Set([
  'types.ts',
  'types.js',
  'types.tsx',
  'actions.ts',
  'actions.js',
  'actions.tsx',
])

function isStoreEntryBasename(basename: string): boolean {
  return STORE_ENTRY_BASENAMES.has(basename)
}

function isUnifiedIndexBasename(basename: string): boolean {
  return UNIFIED_INDEX_BASENAMES.has(basename)
}

function isIgnoredBasename(basename: string): boolean {
  return IGNORED_BASENAMES.has(basename)
}

function toStoreId(relativePath: string): string {
  // relativePath is like "user" or "admin/settings" or "cart.ts" -> strip extension, normalize slashes
  const withoutExt = relativePath.replace(/\.(ts|js|tsx|jsx|mts|mjs)$/, '')
  // remove trailing /index
  const withoutIndex = withoutExt.endsWith('/index') ? withoutExt.slice(0, -6) : withoutExt
  // remove trailing /store for modular
  const withoutStore = withoutIndex.endsWith('/store') ? withoutIndex.slice(0, -6) : withoutIndex
  return withoutStore.replace(/\\/g, '/')
}

function isValidStoreId(id: string): boolean {
  return /^[a-zA-Z0-9/_-]+$/.test(id) && id.length > 0 && !id.startsWith('/') && !id.endsWith('/')
}

export async function discoverStores(root: string): Promise<{
  readonly descriptors: readonly StoreDescriptor[]
  readonly warnings: readonly string[]
}> {
  const storesRoot = join(root, 'src', 'stores')
  if (!existsSync(storesRoot)) {
    return { descriptors: [], warnings: [] }
  }

  const descriptors: StoreDescriptor[] = []
  const warnings: string[] = []
  const seenIds = new Map<string, StoreDescriptor>()

  async function walk(currentDir: string): Promise<void> {
    const entries = await readdir(currentDir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name)
      if (entry.isDirectory()) {
        // Check if this directory is a modular store (contains store.ts)
        const entriesInDir = await readdir(fullPath, { withFileTypes: true })
        const hasStoreEntry = entriesInDir.some((e) => e.isFile() && isStoreEntryBasename(e.name))
        if (hasStoreEntry) {
          const storeEntry = entriesInDir.find((e) => e.isFile() && isStoreEntryBasename(e.name))!
          const entryFile = join(fullPath, storeEntry.name)
          const relativePath = relative(storesRoot, fullPath).replace(/\\/g, '/')
          const id = toStoreId(relativePath || entry.name)
          if (!isValidStoreId(id)) {
            warnings.push(
              `Invalid store id "${id}" from modular store at ${relativePath} — skipped.`,
            )
            continue
          }
          const descriptor: StoreDescriptor = {
            id,
            kind: 'modular',
            entry: entryFile,
            directory: fullPath,
          }
          const existing = seenIds.get(id)
          if (existing) {
            // modular wins over unified — warn
            if (existing.kind !== 'modular') {
              warnings.push(
                `Store id collision for "${id}": modular ${relativePath}/store.ts wins over unified ${existing.entry} — unified will be ignored.`,
              )
              // replace unified with modular
              const index = descriptors.findIndex((d) => d.id === id)
              if (index >= 0) descriptors.splice(index, 1, descriptor)
              seenIds.set(id, descriptor)
            } else {
              warnings.push(`Duplicate modular store id "${id}" — ignoring ${relativePath}.`)
            }
          } else {
            descriptors.push(descriptor)
            seenIds.set(id, descriptor)
          }
          // Do not recurse into modular store's directory further (avoid treating types.ts/actions.ts as stores)
          continue
        }

        // Check if directory is unified-folder (contains index.ts but not store.ts)
        const hasIndex = entriesInDir.some((e) => e.isFile() && isUnifiedIndexBasename(e.name))
        if (hasIndex) {
          const indexEntry = entriesInDir.find((e) => e.isFile() && isUnifiedIndexBasename(e.name))!
          const entryFile = join(fullPath, indexEntry.name)
          const relativePath = relative(storesRoot, fullPath).replace(/\\/g, '/')
          const id = toStoreId(relativePath)
          if (!isValidStoreId(id)) {
            warnings.push(
              `Invalid store id "${id}" from unified folder at ${relativePath} — skipped.`,
            )
            continue
          }
          if (seenIds.has(id)) {
            warnings.push(
              `Store id collision for "${id}" — unified folder ${relativePath} ignored (existing ${seenIds.get(id)?.entry}).`,
            )
            continue
          }
          const descriptor: StoreDescriptor = {
            id,
            kind: 'unified-folder',
            entry: entryFile,
          }
          descriptors.push(descriptor)
          seenIds.set(id, descriptor)
          continue
        }

        // Otherwise recurse
        await walk(fullPath)
      } else if (entry.isFile()) {
        const ext = extname(entry.name)
        if (!STORE_FILE_EXTENSIONS.has(ext)) continue
        if (isIgnoredBasename(entry.name)) continue
        if (isStoreEntryBasename(entry.name)) {
          // This would be src/stores/store.ts at root — treat as modular with id from file
          const relativePath = relative(storesRoot, fullPath).replace(/\\/g, '/')
          const id = toStoreId(relativePath)
          if (!isValidStoreId(id)) continue
          if (seenIds.has(id)) {
            warnings.push(`Store id collision for "${id}" — file ${relativePath} ignored.`)
            continue
          }
          descriptors.push({
            id,
            kind: 'modular',
            entry: fullPath,
          })
          seenIds.set(id, { id, kind: 'modular', entry: fullPath } as StoreDescriptor)
          continue
        }
        // Unified file: src/stores/<name>.ts
        const relativePath = relative(storesRoot, fullPath).replace(/\\/g, '/')
        const id = toStoreId(relativePath)
        if (!isValidStoreId(id)) {
          warnings.push(`Invalid store id "${id}" from file ${relativePath} — skipped.`)
          continue
        }
        // Ignore files that are inside a directory that will be walked as nested store? But we are walking recursively, so this file is at currentDir which is storesRoot or subdir
        // If this file is directly under storesRoot or a non-modular subdir, it's a valid unified store
        if (seenIds.has(id)) {
          warnings.push(
            `Store id collision for "${id}" — file ${relativePath} ignored (modular wins).`,
          )
          continue
        }
        descriptors.push({
          id,
          kind: 'unified-file',
          entry: fullPath,
        })
        seenIds.set(id, { id, kind: 'unified-file', entry: fullPath } as StoreDescriptor)
      }
    }
  }

  await walk(storesRoot)

  // Sort for deterministic output
  descriptors.sort((a, b) => a.id.localeCompare(b.id))
  return { descriptors, warnings }
}

export function generateVirtualBarrel(descriptors: readonly StoreDescriptor[]): string {
  if (descriptors.length === 0) {
    return `// Auto-generated by @nexil/vite-plugin — no stores discovered\nexport const __NEXIL_STORES__ = []\n`
  }
  const lines: string[] = []
  lines.push(`// Auto-generated by @nexil/vite-plugin — do not edit`)
  lines.push(`// Store IDs: ${descriptors.map((d) => d.id).join(', ')}`)
  for (const d of descriptors) {
    lines.push(`export * from '${d.entry.replace(/\\/g, '/')}'`)
    // Also re-export entry for virtual aggregation
    lines.push(`// store:${d.id} -> ${d.entry} [${d.kind}]`)
  }
  return lines.join('\n') + '\n'
}

export function generateStoresDTS(descriptors: readonly StoreDescriptor[], root: string): string {
  const lines: string[] = []
  lines.push(`// Auto-generated by @nexil/vite-plugin — do not edit`)
  lines.push(`// Generated at ${new Date().toISOString()}`)
  lines.push(`// Stores: ${descriptors.map((d) => d.id).join(', ') || 'none'}`)
  lines.push(``)
  if (descriptors.length === 0) {
    lines.push(`// No stores discovered in src/stores/`)
    lines.push(`declare module 'virtual:nexil-stores' {}`)
    lines.push(`declare module '$stores/*' {}`)
    return lines.join('\n') + '\n'
  }
  lines.push(`declare module 'virtual:nexil-stores' {`)
  for (const d of descriptors) {
    const rel = relative(root, d.entry).replace(/\\/g, '/')
    lines.push(`  // ${d.id} -> ${rel} [${d.kind}]`)
  }
  lines.push(`  const stores: Record<string, unknown>`)
  lines.push(`  export default stores`)
  lines.push(`}`)
  lines.push(``)
  lines.push(`declare module '$stores/*' {`)
  lines.push(`  const store: unknown`)
  lines.push(`  export default store`)
  lines.push(`}`)
  for (const d of descriptors) {
    lines.push(``)
    lines.push(`declare module '$stores/${d.id}' {`)
    const rel = relative(root, d.entry).replace(/\\/g, '/')
    lines.push(`  // ${d.kind}: ${rel}`)
    lines.push(`  const mod: typeof import('${rel.replace(/'/g, "\\'")}')`)
    lines.push(`  export = mod`)
    lines.push(`}`)
  }
  return lines.join('\n') + '\n'
}

export async function writeStoresDTS(
  root: string,
  descriptors: readonly StoreDescriptor[],
): Promise<string> {
  const outFile = join(root, '.nexil', 'stores.d.ts')
  const content = generateStoresDTS(descriptors, root)
  await mkdir(dirname(outFile), { recursive: true })
  await writeFile(outFile, content, 'utf8')
  return outFile
}

// AST-based batch wrapping for store actions.
// Wraps each action function body with `batch(() => { ... })` and ensures `batch` is imported.
// Handles:
//  - Modular: `export const userActions = { increment(state) { ... }, setCount: (state, n) => { ... } }` in `actions.ts`
//  - Unified: `defineStore('id', { actions: { inc(){ this.count++ }, ... } })` in `src/stores/*.ts`
// Preserves comments, TypeScript syntax, and avoids double-wrapping.
export function wrapActionsWithBatch(
  source: string,
  id: string,
): { readonly code: string; readonly changed: boolean } {
  if (!id.includes('/src/stores/') && !id.includes('\\src\\stores\\')) {
    return { code: source, changed: false }
  }

  let ast: ReturnType<typeof parse>
  try {
    ast = parse(source, {
      sourceType: 'module',
      plugins: ['typescript', 'jsx'],
    })
  } catch {
    return { code: source, changed: false }
  }

  const s = new MagicString(source)
  let needsBatchImport = false
  let hasBatchImport = false

  // Check existing batch import
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  traverse(ast as any, {
    ImportDeclaration(path: any) {
      if (path.node.source.value === '@nexil/reactivity') {
        for (const spec of path.node.specifiers) {
          if (spec.imported?.name === 'batch' || spec.local.name === 'batch') {
            hasBatchImport = true
          }
        }
      }
    },
  })

  // Find actions objects: `export const *Actions = { ... }` and `actions: { ... }` inside defineStore/createStore
  const actionsObjects: Array<{ properties: unknown[]; start?: number; end?: number }> = []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  traverse(ast as any, {
    VariableDeclarator(path: any) {
      const name = path.node.id?.name
      if (name && /Actions$/.test(name) && path.node.init?.type === 'ObjectExpression') {
        actionsObjects.push(
          path.node.init as unknown as { properties: unknown[]; start?: number; end?: number },
        )
      }
    },
    ObjectProperty(path: any) {
      const keyName =
        (path.node.key as unknown as { name?: string })?.name ??
        (path.node.key as unknown as { value?: string })?.value
      if (keyName === 'actions' && path.node.value?.type === 'ObjectExpression') {
        // Ensure parent is inside defineStore or createStore or plain object - we treat any `actions: {}` as actions object
        actionsObjects.push(
          path.node.value as unknown as { properties: unknown[]; start?: number; end?: number },
        )
      }
    },
  })

  if (actionsObjects.length === 0) {
    return { code: source, changed: false }
  }

  let changed = false

  for (const obj of actionsObjects) {
    for (const prop of obj.properties as unknown as Array<{
      type: string
      key?: { name?: string; value?: string }
      value?: {
        type: string
        body?: { type: string; start?: number | null; end?: number | null }
        params?: unknown[]
      }
      method?: boolean
      computed?: boolean
      shorthand?: boolean
      params?: unknown[]
      body?: { type: string; start?: number | null; end?: number | null }
      start?: number | null
      end?: number | null
    }>) {
      let fnNode:
        | {
            type: string
            body?: { type: string; start?: number | null; end?: number | null }
            params?: unknown[]
            async?: boolean
          }
        | undefined
      let body: { type: string; start?: number | null; end?: number | null } | undefined

      if (prop.type === 'ObjectMethod') {
        // e.g., increment(state: UserState): void { ... }
        fnNode = prop as unknown as {
          type: string
          body?: { type: string; start?: number | null; end?: number | null }
        }
        body = fnNode.body
      } else if (prop.type === 'ObjectProperty') {
        const val = prop.value
        if (val && (val.type === 'FunctionExpression' || val.type === 'ArrowFunctionExpression')) {
          fnNode = val as unknown as {
            type: string
            body?: { type: string; start?: number | null; end?: number | null }
          }
          body = fnNode.body
        }
      }

      if (!fnNode || !body || body.start == null || body.end == null) continue

      const bodyText = source.slice(body.start, body.end)
      // Avoid double-wrapping if already contains `batch(`
      if (
        /^\s*\{?\s*return\s+batch\s*\(/.test(bodyText) ||
        /batch\s*\(\s*\(\)\s*=>/.test(bodyText)
      ) {
        continue
      }

      if (body.type === 'BlockStatement') {
        // e.g., { state.count += 1 }
        const innerStart = body.start + 1
        const innerEnd = body.end - 1
        const inner = source.slice(innerStart, innerEnd)
        // Wrap inner with `return batch(() => { ... })`
        // Preserve original inner formatting
        const wrappedInner = `return batch(() => {${inner}})`
        s.overwrite(innerStart, innerEnd, wrappedInner)
        needsBatchImport = true
        changed = true
      } else {
        // Arrow with expression body: `state => state.count++` or `() => 42`
        // Wrap expression with `batch(() => expression)`
        const expr = source.slice(body.start, body.end)
        s.overwrite(body.start, body.end, `batch(() => (${expr}))`)
        needsBatchImport = true
        changed = true
      }
    }
  }

  if (!changed) {
    return { code: source, changed: false }
  }

  if (needsBatchImport && !hasBatchImport) {
    s.prepend(`import { batch } from '@nexil/reactivity'\n`)
  }

  return { code: s.toString(), changed: true }
}

export function resolveStoreIdFromImport(importPath: string): string | undefined {
  if (
    importPath === 'virtual:nexil-stores' ||
    importPath === '$stores' ||
    importPath.startsWith('virtual:nexil-stores/')
  ) {
    return undefined
  }
  if (importPath.startsWith('$stores/')) {
    return importPath.slice('$stores/'.length)
  }
  return undefined
}
