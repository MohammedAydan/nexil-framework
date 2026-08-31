import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { parse } from '@babel/parser'
import traverseModule from '@babel/traverse'
import MagicString from 'magic-string'
import { transformWithEsbuild } from 'vite'
import type { Plugin } from 'vite'
import { findSecretExposure, validateImport } from './boundaries.js'
import { RESUMABILITY_BINDINGS, RESUMABILITY_BOOTSTRAP, RESUMABILITY_FORMS } from './bootstrap.js'
import { RESUMABILITY_BOOTSTRAP_EXTERNAL } from './external-bootstrap.js'
import { RESUMABILITY_BINDINGS_EXTERNAL } from './external-bindings.js'
import { NEXIL_NAVIGATION_RUNTIME } from '@nexil/core/router'
import {
  discoverStores,
  generateVirtualBarrel,
  writeStoresDTS,
  wrapActionsWithBatch,
} from './stores.js'
import type { StoreDescriptor } from './stores.js'

const traverse = ((traverseModule as unknown as { default?: typeof traverseModule }).default ??
  traverseModule) as typeof traverseModule

export {
  NEXIL_NAVIGATION_RUNTIME,
  RESUMABILITY_BINDINGS,
  RESUMABILITY_BINDINGS_EXTERNAL,
  RESUMABILITY_BOOTSTRAP,
  RESUMABILITY_BOOTSTRAP_EXTERNAL,
  RESUMABILITY_FORMS,
}

interface AstNode {
  readonly type?: string
  readonly start?: number
  readonly end?: number
  readonly source?: { readonly value?: unknown }
  readonly name?: { readonly name?: unknown }
  readonly value?: { readonly type?: string; readonly expression?: AstNode }
  readonly attributes?: readonly AstNode[]
  readonly openingElement?: AstNode
}

export interface LazyChunk {
  readonly fileName: string
  readonly source: string
}

export type ScopeCaptureKind = 'value' | 'signal' | 'store' | 'action' | 'ctx' | 'unsupported'
export type ScopeCaptureLifetime = 'route' | 'global'

export type ScopeCaptureInitial =
  | string
  | number
  | boolean
  | null
  | readonly ScopeCaptureInitial[]
  | { readonly [key: string]: ScopeCaptureInitial }

export interface ScopeCapture {
  readonly name: string
  readonly kind: ScopeCaptureKind
  readonly id?: string
  readonly reason?: string
  /** Statically extracted JSON-literal initial value for signal/store captures. */
  readonly initial?: ScopeCaptureInitial
  /** Local endpoint for action captures. */
  readonly endpoint?: string
  /** Store lifetime after a Link outlet replacement; defaults to the route. */
  readonly lifetime?: ScopeCaptureLifetime
  /** For `store.count` member bindings: the store id (e.g. `cart`, `admin/settings`) */
  readonly storeId?: string
  /** For `store.count` member bindings: the dot-joined path inside the store (e.g. `count`, `user.profile.name`) */
  readonly storePath?: string
}

export type DomBindingTarget =
  | 'text'
  | 'value'
  | 'checked'
  | 'disabled'
  | 'hidden'
  | 'class'
  | 'style'
  | 'href'
  | 'src'
  | `aria-${string}`

export interface DomBinding {
  readonly id: string
  readonly scopeId: string
  readonly target: DomBindingTarget
  readonly source: string
  readonly automatic: boolean
}

export interface NexilTransformResult {
  readonly code: string
  readonly map: ReturnType<MagicString['generateMap']>
  readonly chunks: readonly LazyChunk[]
  readonly css: readonly string[]
  readonly scopeCaptures: readonly ScopeCapture[]
  /** Scope payloads moved out of HTML when scopeSerialization is external. */
  readonly externalScopePayloads: readonly ExternalScopePayload[]
  readonly bindings: readonly DomBinding[]
  readonly warnings: readonly string[]
}

export interface ExternalScopePayload {
  /** Opaque HTML token that resolves to this payload in the generated runtime asset. */
  readonly key: string
  readonly payload: Readonly<Record<string, ScopeCapture>>
}

export interface NexilTransformOptions {
  /** Keep ScopeRefs inline for dev compatibility, or externalize them during a production build. */
  readonly scopeSerialization?: 'inline' | 'external'
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 12)
}

function normalizeIdForHash(id: string): string {
  return id
    .replace(/\\/g, '/')
    .replace(/^[A-Za-z]:/, '')
    .replace(/^\/+/, '')
}

const GLOBAL_IDENTIFIERS = new Set([
  'Array',
  'Boolean',
  'Date',
  'Error',
  'JSON',
  'Math',
  'Number',
  'Object',
  'Promise',
  'String',
  'console',
  'document',
  'fetch',
  'FormData',
  'URLSearchParams',
  'undefined',
  // DOM / TS type identifiers that appear in `as Type` casts and should not be captured
  'HTMLElement',
  'HTMLInputElement',
  'HTMLButtonElement',
  'HTMLTextAreaElement',
  'HTMLSelectElement',
  'Event',
  'MouseEvent',
  'InputEvent',
])

function captureExpression(expressionSource: string): {
  readonly code: string
  readonly names: readonly string[]
} {
  const r = captureExpressionWithImports(expressionSource, new Map())
  return { code: r.code, names: r.scopeNames as unknown as readonly string[] }
}

function collectImportMap(
  source: string,
  id: string,
): Map<string, { source: string; imported: string; kind: 'named' | 'default' | 'namespace' }> {
  const map = new Map<
    string,
    { source: string; imported: string; kind: 'named' | 'default' | 'namespace' }
  >()
  try {
    const ast = parseSource(source, id)
    walk(ast, (node) => {
      if (node.type !== 'ImportDeclaration' || typeof node.source?.value !== 'string') return
      const from = node.source.value as string
      const specs = (node as unknown as { specifiers?: readonly AstNode[] }).specifiers ?? []
      for (const spec of specs) {
        const s = spec as unknown as { type?: string; local?: AstNode; imported?: AstNode }
        const local = astIdentifierName(s.local)
        if (!local) continue
        if (s.type === 'ImportDefaultSpecifier')
          map.set(local, { source: from, imported: 'default', kind: 'default' })
        else if (s.type === 'ImportNamespaceSpecifier')
          map.set(local, { source: from, imported: '*', kind: 'namespace' })
        else {
          const imported = astIdentifierName(s.imported) ?? local
          map.set(local, { source: from, imported, kind: 'named' })
        }
      }
    })
  } catch {
    /* ignore parse errors for import collection */
  }
  return map
}

function captureExpressionWithImports(
  expressionSource: string,
  importMap: ReadonlyMap<
    string,
    { source: string; imported: string; kind: 'named' | 'default' | 'namespace' }
  >,
  sourceFileContext?: string,
): {
  readonly code: string
  readonly scopeNames: readonly string[]
  readonly importNames: readonly string[]
} {
  const prefix = 'const __nexilHandler = '
  const ast = parse(`${prefix}${expressionSource}`, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx', 'topLevelAwait'],
  })
  const scopeReplacements: Array<{ start: number; end: number; name: string }> = []
  const importNames = new Set<string>()
  traverse(ast, {
    ReferencedIdentifier(path) {
      const name = path.node.name
      if (GLOBAL_IDENTIFIERS.has(name) || path.scope.hasBinding(name)) return
      if (
        path.parentPath.isObjectProperty() &&
        path.parentKey === 'key' &&
        !path.parentPath.node.computed
      )
        return
      if (
        path.node.start === null ||
        path.node.start === undefined ||
        path.node.end === null ||
        path.node.end === undefined
      )
        return
      if (importMap.has(name)) {
        const isCtxImport =
          expressionSource.includes(`${name}.use`) ||
          new RegExp(`useContext\\s*\\(\\s*${escapeRegExp(name)}\\b`).test(expressionSource) ||
          /Context$/.test(name)
        // Imported Contexts must be serialized via ctx registry, not direct ESM import
        if (isCtxImport && sourceFileContext !== undefined) {
          const start = path.node.start
          const end = path.node.end
          scopeReplacements.push({
            start: start - prefix.length,
            end: end - prefix.length,
            name,
          })
          return
        }
        importNames.add(name)
        return
      }
      const start = path.node.start
      const end = path.node.end
      scopeReplacements.push({
        start: start - prefix.length,
        end: end - prefix.length,
        name,
      })
    },
  })
  const magic = new MagicString(expressionSource)
  for (const replacement of scopeReplacements.sort((left, right) => right.start - left.start)) {
    if (replacement.start >= 0)
      magic.overwrite(replacement.start, replacement.end, `scope.${replacement.name}`)
  }
  return {
    code: magic.toString(),
    scopeNames: [...new Set(scopeReplacements.map((r) => r.name))],
    importNames: [...importNames],
  }
}

function buildImportHeader(
  importNames: readonly string[],
  importMap: ReadonlyMap<
    string,
    { source: string; imported: string; kind: 'named' | 'default' | 'namespace' }
  >,
  fileId?: string,
): string {
  const lines: string[] = []
  let projectRoot: string | undefined
  if (fileId) {
    const normalized = fileId.replace(/\\/g, '/')
    const idx = normalized.lastIndexOf('/src/')
    if (idx >= 0) projectRoot = fileId.slice(0, idx)
  }

  for (const name of importNames) {
    const info = importMap.get(name)
    if (!info) continue
    let importSrc = info.source
    if (importSrc.startsWith('.') && fileId && projectRoot) {
      const dir = dirname(fileId)
      let abs = resolve(dir, importSrc)
      let resolvedFile: string | undefined
      if (existsSync(abs)) {
        resolvedFile = abs
      } else if (existsSync(abs.replace(/\.js$/, '.ts'))) {
        resolvedFile = abs.replace(/\.js$/, '.ts')
      } else if (existsSync(abs.replace(/\.js$/, '.tsx'))) {
        resolvedFile = abs.replace(/\.js$/, '.tsx')
      } else if (existsSync(abs + '.ts')) {
        resolvedFile = abs + '.ts'
      } else if (existsSync(abs + '.tsx')) {
        resolvedFile = abs + '.tsx'
      } else if (existsSync(resolve(abs, 'index.ts'))) {
        resolvedFile = resolve(abs, 'index.ts')
      }
      if (resolvedFile) {
        const relToRoot = relative(projectRoot, resolvedFile).replace(/\\/g, '/')
        importSrc = '/' + relToRoot
      }
    }
    if (info.kind === 'namespace') lines.push(`import * as ${name} from "${importSrc}";`)
    else if (info.kind === 'default') lines.push(`import ${name} from "${importSrc}";`)
    else if (info.imported === name) lines.push(`import { ${name} } from "${importSrc}";`)
    else lines.push(`import { ${info.imported} as ${name} } from "${importSrc}";`)
  }
  return lines.join('\n')
}

/**
 * Resolves a bare local handler identifier used by an event prop to its function
 * expression before capture analysis. Lazy chunks execute in a fresh module, so
 * an emitted `scope.increment(...)` cannot work: ordinary local functions are
 * not serializable scope values. Resolving the body lets the existing capture
 * pipeline serialize the Signal/Store/Action values the handler actually uses.
 *
 * This intentionally only resolves author-local arrow/function expressions that
 * occur before the JSX event reference. Imported functions and computed handler
 * expressions retain the existing behavior rather than being guessed at.
 */
function resolveLocalHandlerExpression(
  source: string,
  expressionSource: string,
  referenceStart: number,
): string {
  const identifier = /^\s*([A-Za-z_$][\w$]*)\s*$/.exec(expressionSource)?.[1]
  if (!identifier) return expressionSource

  const ast = parseSource(source, 'nexil-local-handler.tsx')
  let resolved: AstNode | undefined

  walk(ast, (node) => {
    if (node.start === undefined || node.start >= referenceStart) return
    const declaration = node as AstNode & { readonly id?: AstNode; readonly init?: AstNode }
    if (
      node.type === 'FunctionDeclaration' &&
      astIdentifierName(declaration.id) === identifier &&
      node.end !== undefined
    ) {
      resolved = node
      return
    }
    if (node.type !== 'VariableDeclarator') return
    const init = declaration.init
    if (
      astIdentifierName(declaration.id) === identifier &&
      (init?.type === 'ArrowFunctionExpression' || init?.type === 'FunctionExpression') &&
      init.start !== undefined &&
      init.end !== undefined
    )
      resolved = init
  })

  if (resolved?.start === undefined || resolved.end === undefined) return expressionSource
  return source.slice(resolved.start, resolved.end)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function evaluateStaticLiteral(node: unknown): ScopeCaptureInitial | undefined {
  if (!node || typeof node !== 'object') return undefined
  const value = node as {
    type?: string
    value?: unknown
    operator?: string
    argument?: unknown
    expression?: unknown
    elements?: unknown[]
    properties?: unknown[]
  }
  if (
    value.type === 'TSAsExpression' ||
    value.type === 'TSTypeAssertion' ||
    value.type === 'TSNonNullExpression' ||
    value.type === 'ParenthesizedExpression' ||
    value.type === 'TSSatisfiesExpression'
  ) {
    return evaluateStaticLiteral(value.expression)
  }
  if (value.type === 'UnaryExpression' && (value.operator === '-' || value.operator === '+')) {
    const evaluated = evaluateStaticLiteral(value.argument)
    if (typeof evaluated === 'number') {
      return (value.operator === '-' ? -evaluated : evaluated) as ScopeCaptureInitial
    }
  }
  if (
    value.type === 'StringLiteral' ||
    value.type === 'NumericLiteral' ||
    value.type === 'BooleanLiteral'
  ) {
    return value.value as ScopeCaptureInitial
  }
  if (value.type === 'NullLiteral') return null
  if (value.type === 'ArrayExpression') {
    const elements = value.elements ?? []
    const evaluated = elements.map(evaluateStaticLiteral)
    return evaluated.every((item) => item !== undefined)
      ? (evaluated as ScopeCaptureInitial[])
      : undefined
  }
  if (value.type === 'ObjectExpression') {
    const result: Record<string, ScopeCaptureInitial> = {}
    for (const property of value.properties ?? []) {
      if (!property || typeof property !== 'object') return undefined
      const record = property as {
        type?: string
        key?: { type?: string; name?: string; value?: string }
        value?: unknown
      }
      if (
        record.type !== 'ObjectProperty' ||
        (record.key?.type !== 'Identifier' && record.key?.type !== 'StringLiteral')
      )
        return undefined
      const key = record.key.name ?? record.key.value
      if (!key) return undefined
      const evaluated = evaluateStaticLiteral(record.value)
      if (evaluated === undefined) return undefined
      result[key] = evaluated
    }
    return result
  }
  return undefined
}

function getAtPathStatic(value: unknown, path: readonly string[]): unknown {
  let cur: unknown = value
  for (const seg of path) {
    if (cur == null || typeof cur !== 'object' || Array.isArray(cur)) return undefined
    cur = (cur as Record<string, unknown>)[seg]
  }
  return cur
}

function tryReadStoreState(
  storeId: string,
  currentFileId?: string,
): ScopeCaptureInitial | undefined {
  if (!currentFileId) return undefined
  try {
    // Find project root by locating `src/stores` prefix in currentFileId (handles both / and \ on Windows)
    const normalized = currentFileId.replace(/\\/g, '/')
    const idx = normalized.lastIndexOf('/src/')
    const root = idx >= 0 ? currentFileId.slice(0, idx) : dirname(currentFileId)
    const candidates = [
      resolve(root, 'src', 'stores', `${storeId}.ts`),
      resolve(root, 'src', 'stores', `${storeId}.js`),
      resolve(root, 'src', 'stores', `${storeId}/store.ts`),
      resolve(root, 'src', 'stores', `${storeId}/index.ts`),
      resolve(root, `src/stores/${storeId}.ts`),
      resolve(root, `src/stores/${storeId}/store.ts`),
    ]
    for (const p of candidates) {
      try {
        const content = readFileSync(p, 'utf8')
        // Look for `state: () => ({ ... })` or `state: () => { return { ... } }`
        const stateMatch = /state\s*:\s*\(\)\s*=>\s*\(?\s*(\{[\s\S]*?\})\s*\)?[,}]/.exec(content)
        if (stateMatch?.[1]) {
          try {
            // Try to evaluate as JSON after stripping TS types and single quotes
            const jsonish = stateMatch[1]
              .replace(/\/\/.*$/gm, '')
              .replace(/\/\*[\s\S]*?\*\//g, '')
              .replace(/'/g, '"')
              .replace(/(\w+)\s*:/g, '"$1":')
              .replace(/,(\s*[}\]])/g, '$1')
            const parsed = JSON.parse(jsonish) as ScopeCaptureInitial
            return parsed
          } catch {}
        }
        // Fallback: try evaluate via AST
        const ast = parseSource(content, p)
        let found: ScopeCaptureInitial | undefined
        walk(ast, (node) => {
          if (found !== undefined) return
          if (node.type !== 'ObjectExpression') return
          // Look for state property inside defineStore
          const props =
            (
              node as unknown as {
                properties?: Array<{ key?: { name?: string }; value?: unknown }>
              }
            ).properties ?? []
          for (const prop of props) {
            const key = (prop as unknown as { key?: { name?: string } }).key?.name
            if (
              key === 'state' &&
              (prop as unknown as { value?: { type?: string } }).value?.type ===
                'ArrowFunctionExpression'
            ) {
              const fn = (prop as unknown as { value?: { body?: unknown } }).value as {
                body?: unknown
              }
              const body = fn.body as { type?: string; properties?: unknown[]; body?: unknown }
              if (body && body.type === 'ObjectExpression') {
                found = evaluateStaticLiteral(body as unknown) as ScopeCaptureInitial
              } else if (body && body.type === 'BlockStatement') {
                // `state: () => { return { ... } }`
                const ret = (
                  body as unknown as { body?: Array<{ type?: string; argument?: unknown }> }
                ).body?.find((s) => s.type === 'ReturnStatement')
                if (ret)
                  found = evaluateStaticLiteral(
                    (ret as unknown as { argument?: unknown }).argument,
                  ) as ScopeCaptureInitial
              }
            }
          }
        })
        if (found !== undefined) return found
      } catch {}
    }
  } catch {}
  return undefined
}

function resolveStoreIdForBase(
  baseName: string,
  source: string,
  importMap?: ReadonlyMap<string, { source: string; imported: string; kind: string }>,
  fileId?: string,
): string | undefined {
  // Check `const base = useXStore()` or `const base = useX()`
  const hookMatch = new RegExp(
    `(?:const|let|var)\\s+${escapeRegExp(baseName)}\\s*=\\s*(use(?!State|Context)[A-Za-z0-9_]+)\\s*\\(`,
  ).exec(source.replace(/\s+/g, ' '))
  if (hookMatch) {
    const hook = hookMatch[1] ?? ''
    const imp = importMap?.get(hook)
    if (imp) {
      if (imp.source.startsWith('$stores/')) {
        return imp.source.slice('$stores/'.length)
      }
      const storeMatch = imp.source.match(/stores\/(.+?)(?:\.[a-z]+)?$/)
      if (storeMatch?.[1]) {
        return storeMatch[1].replace(/\/index$/, '').replace(/\/store$/, '')
      }
    }
    // Try to find hook definition in same file: `const useXStore = defineStore('id', ...)`
    const hookDef = new RegExp(
      `(?:const|let|var)\\s+${escapeRegExp(hook)}\\s*=\\s*(?:defineStore|defineStoreContext|createStore)\\s*\\(\\s*['"]([^'"]+)['"]`,
    ).exec(source)
    if (hookDef?.[1]) return hookDef[1]
    const hookCreate = new RegExp(
      `(?:const|let|var)\\s+${escapeRegExp(hook)}\\s*=\\s*createStore\\s*\\(\\s*\\{[^}]*id\\s*:\\s*['"]([^'"]+)['"]`,
    ).exec(source)
    if (hookCreate?.[1]) return hookCreate[1]
    // Fallback: derive from hook name
    if (hook.startsWith('use')) {
      const raw = hook.endsWith('Store') ? hook.slice(3, -5) : hook.slice(3)
      if (raw) {
        return raw.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
      }
    }
  }
  // Check `const base = createStore({id: '...'})` directly
  const directMatch = new RegExp(
    `(?:const|let|var)\\s+${escapeRegExp(baseName)}\\s*=\\s*createStore\\s*\\(\\s*\\{[^}]*id\\s*:\\s*['"]([^'"]+)['"]`,
  ).exec(source)
  if (directMatch?.[1]) return directMatch[1]
  return undefined
}

/**
 * Extracts a JSON-literal initializer for a named signal/store/action
 * declaration so the compiled page can serialize it into `data-nx-scope`.
 * Returns undefined when the initializer is not a pure JSON literal.
 */
function extractStaticInitial(
  source: string,
  name: string,
  fileId?: string,
  importMap?: ReadonlyMap<string, { source: string; imported: string; kind: string }>,
): ScopeCaptureInitial | undefined {
  const dotIndex = name.indexOf('.')
  const baseName = dotIndex >= 0 ? name.slice(0, dotIndex) : name
  const propPath = dotIndex >= 0 ? name.slice(dotIndex + 1).split('.') : undefined
  const ast = parseSource(source, 'nexil-initializer.tsx')
  let initial: ScopeCaptureInitial | undefined
  walk(ast, (node) => {
    if (initial !== undefined || node.type !== 'VariableDeclarator') return
    const declaration = node as AstNode & { readonly id?: AstNode; readonly init?: AstNode }
    const id = declaration.id
    const isNamed = id?.type === 'Identifier' && astIdentifierName(id) === baseName
    const isTuple =
      id?.type === 'ArrayPattern' &&
      Array.isArray((id as AstNode & { readonly elements?: readonly AstNode[] }).elements) &&
      (id as AstNode & { readonly elements: readonly AstNode[] }).elements.some(
        (element) => element?.type === 'Identifier' && astIdentifierName(element) === baseName,
      )
    if (!isNamed && !isTuple) return
    const init = declaration.init
    if (!init || init.type !== 'CallExpression') return
    const callee = (init as AstNode & { readonly callee?: AstNode }).callee
    const calleeName = astIdentifierName(callee)
    // Handle `useCartStore()` / `useCart()` / `useCounter()` where hook is from defineStore/createStore
    if (calleeName?.startsWith('use') && !['useState', 'useContext'].includes(calleeName)) {
      const storeId =
        resolveStoreIdForBase(baseName, source, importMap, fileId) ??
        (calleeName.endsWith('Store') ? calleeName.slice(3, -5) : calleeName.slice(3))
          .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
          .toLowerCase()
      if (propPath) {
        // Try to get full initial for the store, then traverse path
        let storeInitial: ScopeCaptureInitial | undefined
        // First try to find defineStore in same file
        const storeDefMatch = new RegExp(
          `(?:defineStore|defineStoreContext)\\s*\\(\\s*['"]${escapeRegExp(storeId)}['"]\\s*,\\s*\\{[\\s\\S]*?state\\s*:\\s*\\(\\s*\\)\\s*=>\\s*\\(?\\s*(\\{[\\s\\S]*?\\})\\s*\\)?\\s*[,}]`,
        ).exec(source)
        if (storeDefMatch?.[1]) {
          try {
            const jsonish = storeDefMatch[1]
              .replace(/'/g, '"')
              .replace(/(\w+)\s*:/g, '"$1":')
              .replace(/,(\s*[}\]])/g, '$1')
            storeInitial = JSON.parse(jsonish) as ScopeCaptureInitial
          } catch {}
        }
        if (storeInitial === undefined) {
          storeInitial = tryReadStoreState(storeId, fileId)
        }
        if (storeInitial && typeof storeInitial === 'object' && !Array.isArray(storeInitial)) {
          const leaf = getAtPathStatic(storeInitial as Record<string, unknown>, propPath)
          if (leaf !== undefined) {
            initial = leaf as ScopeCaptureInitial
            return
          }
        }
        // Fallback placeholder — actual value will be correct at runtime via __NEXIL_STORES__
        initial = 0 as unknown as ScopeCaptureInitial
        return
      }
      let storeInitial: ScopeCaptureInitial | undefined
      const storeDefMatch = new RegExp(
        `(?:defineStore|defineStoreContext)\\s*\\(\\s*['"]${escapeRegExp(storeId)}['"]\\s*,\\s*\\{[\\s\\S]*?state\\s*:\\s*\\(\\s*\\)\\s*=>\\s*\\(?\\s*(\\{[\\s\\S]*?\\})\\s*\\)?\\s*[,}]`,
      ).exec(source)
      if (storeDefMatch?.[1]) {
        try {
          const jsonish = storeDefMatch[1]
            .replace(/'/g, '"')
            .replace(/(\w+)\s*:/g, '"$1":')
            .replace(/,(\s*[}\]])/g, '$1')
          storeInitial = JSON.parse(jsonish) as ScopeCaptureInitial
        } catch {}
      }
      if (storeInitial === undefined) {
        storeInitial = tryReadStoreState(storeId, fileId)
      }
      if (storeInitial !== undefined) {
        initial = storeInitial
        return
      }
      if (initial === undefined) {
        initial = { count: 0 } as unknown as ScopeCaptureInitial
      }
      return
    }
    if (!['state', 'createStore', 'computed', 'useState'].includes(calleeName ?? '')) return
    const args = (init as AstNode & { readonly arguments?: readonly AstNode[] }).arguments ?? []
    const fullInitial = evaluateStaticLiteral(args[0])
    if (propPath && fullInitial && typeof fullInitial === 'object' && !Array.isArray(fullInitial)) {
      const leaf = getAtPathStatic(fullInitial as Record<string, unknown>, propPath)
      if (leaf !== undefined) {
        initial = leaf as ScopeCaptureInitial
      } else {
        initial = undefined
      }
    } else {
      initial = fullInitial
    }
  })
  return initial
}

function extractStoreLifetime(source: string, name: string): ScopeCaptureLifetime {
  const ast = parseSource(source, 'nexil-store-lifetime.tsx')
  let lifetime: ScopeCaptureLifetime = 'route'
  walk(ast, (node) => {
    if (lifetime === 'global' || node.type !== 'VariableDeclarator') return
    const declaration = node as AstNode & { readonly id?: AstNode; readonly init?: AstNode }
    const id = declaration.id
    if (id?.type !== 'Identifier' || astIdentifierName(id) !== name) return
    const init = declaration.init as
      (AstNode & { readonly callee?: AstNode; readonly arguments?: readonly AstNode[] }) | undefined
    if (!init || init.type !== 'CallExpression' || astIdentifierName(init.callee) !== 'createStore')
      return
    const requested = init.arguments?.[1] as
      { readonly type?: string; readonly value?: unknown } | undefined
    if (requested?.type === 'StringLiteral' && requested.value === 'global') lifetime = 'global'
  })
  return lifetime
}

/** Extracts the first string-literal argument of an action declaration. */
function extractStaticEndpoint(source: string, name: string): string | undefined {
  const compact = source.replace(/\s+/g, ' ')
  const match = new RegExp(`(?:const|let|var) ${escapeRegExp(name)} = action\\(`).exec(compact)
  if (!match) return undefined
  const rest = compact.slice(match.index + match[0].length)
  const quoted = /^(['"])([^'"]+)\1/.exec(rest)
  if (!quoted) return undefined
  return quoted[2]
}

function extractContextDefault(source: string, name: string): ScopeCaptureInitial | undefined {
  const ast = parseSource(source, 'nexil-context.tsx')
  let initial: ScopeCaptureInitial | undefined
  walk(ast, (node) => {
    if (initial !== undefined || node.type !== 'VariableDeclarator') return
    const decl = node as AstNode & { readonly id?: AstNode; readonly init?: AstNode }
    if (astIdentifierName(decl.id) !== name) return
    const init = decl.init as
      (AstNode & { readonly callee?: AstNode; readonly arguments?: readonly AstNode[] }) | undefined
    if (
      !init ||
      init.type !== 'CallExpression' ||
      astIdentifierName(init.callee) !== 'createContext'
    )
      return
    const arg = init.arguments?.[0] as unknown
    initial = evaluateStaticLiteral(arg)
  })
  return initial
}

function extractContextAlias(source: string, local: string): string | undefined {
  const ast = parseSource(source, 'nexil-context-alias.tsx')
  let ctx: string | undefined
  walk(ast, (node) => {
    if (ctx !== undefined || node.type !== 'VariableDeclarator') return
    const decl = node as AstNode & { readonly id?: AstNode; readonly init?: AstNode }
    if (astIdentifierName(decl.id) !== local) return
    const init = decl.init as
      | (AstNode & {
          readonly callee?: AstNode
          readonly object?: AstNode
          readonly arguments?: readonly AstNode[]
        })
      | undefined
    if (!init) return
    if (init.type === 'CallExpression') {
      const callee = init.callee
      const args = init.arguments ?? []
      if (astIdentifierName(callee) === 'useContext' && args[0]?.type === 'Identifier') {
        ctx = astIdentifierName(args[0] as unknown as AstNode)
        return
      }
      if (
        callee?.type === 'MemberExpression' &&
        astIdentifierName((callee as unknown as { property?: AstNode }).property) === 'use'
      ) {
        const obj = (callee as unknown as { object?: AstNode }).object
        if (obj?.type === 'Identifier') ctx = astIdentifierName(obj)
      }
    }
  })
  return ctx
}

function tryReadContextDefaultFromImport(
  importSource: string,
  currentFileId: string,
  ctxName: string,
): ScopeCaptureInitial | undefined {
  try {
    const baseDir = dirname(currentFileId)
    // Resolve relative import like "../context" to file path, try .ts/.tsx/.js
    const candidates = [
      resolve(baseDir, importSource),
      resolve(baseDir, `${importSource}.ts`),
      resolve(baseDir, `${importSource}.tsx`),
      resolve(baseDir, `${importSource}.js`),
      resolve(baseDir, `${importSource}/index.ts`),
      resolve(baseDir, `${importSource}/index.tsx`),
    ]
    for (const p of candidates) {
      try {
        const content = readFileSync(p, 'utf8')
        const v = extractContextDefault(content, ctxName)
        if (v !== undefined) return v
      } catch {}
    }
  } catch {}
  return undefined
}

function inferContextLifetime(id: string): ScopeCaptureLifetime {
  if (id.includes('_layout') || id.includes('/layout')) return 'global'
  return 'route'
}

function classifyScopeCaptures(
  source: string,
  names: readonly string[],
  fileId?: string,
  importMap?: ReadonlyMap<string, { source: string; imported: string; kind: string }>,
): ScopeCapture[] {
  const captures: ScopeCapture[] = []
  const compactSource = source.replace(/\s+/g, ' ')
  for (const name of names) {
    // Handle `store.count` where `store` is a store instance (e.g., `cartStore.count`)
    const dotIndex = name.indexOf('.')
    const baseName = dotIndex >= 0 ? name.slice(0, dotIndex) : name
    const propName = dotIndex >= 0 ? name.slice(dotIndex + 1) : undefined
    const namePattern = escapeRegExp(name)
    const basePattern = escapeRegExp(baseName)
    const declares = (candidate: string): boolean =>
      new RegExp(`(?:const|let|var) ${basePattern} = ${candidate}\\(`).test(compactSource)
    const declaresStateTuple =
      new RegExp(`(?:const|let|var) \\[\\s*${basePattern}\\s*,[^\\]]*\\]\\s*=\\s*useState\\(`).test(
        compactSource,
      ) ||
      new RegExp(
        `(?:const|let|var) \\[\\s*[A-Za-z_$][\\w$]*\\s*,\\s*${basePattern}\\s*\\]\\s*=\\s*useState\\(`,
      ).test(compactSource)

    // Check for store created via useXxxStore() or useXxx() where hook is from $stores/* or defineStore/createStore
    const declaresStoreHook = new RegExp(
      `(?:const|let|var) ${basePattern} = use(?!State|Context)[A-Za-z0-9_]+\\(`,
    ).test(compactSource)
    const originalKind: 'signal' | 'store' | 'action' | undefined =
      declares('createStore') || declaresStoreHook
        ? 'store'
        : declares('action')
          ? 'action'
          : declares('state') || declares('computed') || declaresStateTuple
            ? 'signal'
            : undefined
    let kind = originalKind

    // For `store.count` where `store` is a store, treat the property as a signal
    let storeIdForPath: string | undefined
    let storePathForCapture: string | undefined
    if (propName && kind === 'store') {
      kind = 'signal'
      storeIdForPath = resolveStoreIdForBase(baseName, source, importMap, fileId)
      storePathForCapture = propName
    }

    if (kind === 'signal' || kind === 'store') {
      // For store captures, also resolve storeId for later materialization as real store
      let wholeStoreId: string | undefined
      if (kind === 'store' && !propName) {
        wholeStoreId = resolveStoreIdForBase(baseName, source, importMap, fileId)
      }
      const initial = extractStaticInitial(source, name, fileId, importMap)
      if (initial === undefined) {
        captures.push({
          name,
          kind: 'unsupported',
          reason: `Capture "${name}" needs a JSON-literal initial value to resume in the browser.`,
        })
        continue
      }
      captures.push({
        name,
        kind,
        id: `nx:${kind}:${hash(`${name}:${source}`)}`,
        initial,
        ...(kind === 'store' ? { lifetime: extractStoreLifetime(source, name) } : {}),
        ...(storeIdForPath ? { storeId: storeIdForPath } : {}),
        ...(storePathForCapture ? { storePath: storePathForCapture } : {}),
        ...(wholeStoreId ? { storeId: wholeStoreId } : {}),
      })
      continue
    }
    if (kind === 'action') {
      const endpoint = extractStaticEndpoint(source, name)
      if (endpoint === undefined || !endpoint.startsWith('/')) {
        captures.push({
          name,
          kind: 'unsupported',
          reason: `Capture "${name}" needs a local string endpoint such as action('/api/x').`,
        })
        continue
      }
      captures.push({ name, kind, id: `nx:action:${hash(`${name}:${source}`)}`, endpoint })
      continue
    }
    // Context: const Ctx = createContext('default')
    if (new RegExp(`(?:const|let|var) ${namePattern} = createContext\\(`).test(compactSource)) {
      const initial = extractContextDefault(source, name)
      if (initial === undefined) {
        captures.push({
          name,
          kind: 'unsupported',
          reason: `Context "${name}" needs a JSON-literal default value to resume in the browser.`,
        })
        continue
      }
      captures.push({
        name,
        kind: 'ctx',
        id: `nx:ctx:${hash(name)}`,
        initial,
        lifetime: inferContextLifetime(fileId ?? source),
      })
      continue
    }
    // Alias: const local = useContext(Ctx) or const local = Ctx.use()
    const aliasCtx = extractContextAlias(source, name)
    if (aliasCtx) {
      const initial = extractContextDefault(source, aliasCtx)
      if (initial !== undefined) {
        captures.push({
          name,
          kind: 'ctx',
          id: `nx:ctx:${hash(aliasCtx)}`,
          initial,
          lifetime: inferContextLifetime(fileId ?? source),
        })
        continue
      }
      captures.push({
        name,
        kind: 'unsupported',
        reason: `Context alias "${name}" for "${aliasCtx}" needs a serializable default or a Store/Signal provider.`,
      })
      continue
    }
    // Imported Context used directly: ThemeContext.use() or useContext(ThemeContext)
    if (
      /Context$/.test(name) &&
      (new RegExp(`useContext\\s*\\(\\s*${namePattern}\\b`).test(compactSource) ||
        new RegExp(`${namePattern}\\.use\\b`).test(compactSource))
    ) {
      let initial: ScopeCaptureInitial | null = null
      const imp = importMap?.get(name)
      if (imp && fileId) {
        const fetched = tryReadContextDefaultFromImport(imp.source, fileId, imp.imported)
        if (fetched !== undefined) initial = fetched
      }
      // Fallback: try local default if same-file re-export
      if (initial === null) {
        const localDef = extractContextDefault(source, name)
        if (localDef !== undefined) initial = localDef
      }
      captures.push({
        name,
        kind: 'ctx',
        id: `nx:ctx:${hash(name)}`,
        initial: initial as ScopeCaptureInitial,
        lifetime: inferContextLifetime(fileId ?? source),
      })
      continue
    }
    if (/^(?:true|false|null|undefined|NaN)$/.test(name)) {
      captures.push({ name, kind: 'value' })
      continue
    }
    captures.push({
      name,
      kind: 'unsupported',
      reason: `Capture "${name}" is not a serializable Nexil signal, store, action, or plain value.`,
    })
  }
  return captures
}

/**
 * Builds the JSON payload embedded next to a lazy boundary so the browser can
 * materialize captured signals, stores, and actions before the handler runs.
 */
function buildScopePayload(
  captures: readonly ScopeCapture[],
): Record<string, ScopeCapture> | undefined {
  const payload: Record<string, ScopeCapture> = {}
  for (const capture of captures) {
    if (capture.kind === 'unsupported' || capture.kind === 'value') continue
    payload[capture.name] = capture
  }
  return Object.keys(payload).length > 0 ? payload : undefined
}

/** Escapes JSON for safe embedding inside a double-quoted JSX attribute. */
function toJsonAttribute(value: unknown): string {
  return JSON.stringify(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

function astIdentifierName(node: unknown): string | undefined {
  if (!node || typeof node !== 'object') return undefined
  const name = (node as { readonly name?: unknown }).name
  if (typeof name === 'string') return name
  if (
    name &&
    typeof name === 'object' &&
    typeof (name as { readonly name?: unknown }).name === 'string'
  )
    return (name as { readonly name: string }).name
  return undefined
}

function extractMemberPath(node: AstNode | undefined): string | undefined {
  if (!node) return undefined
  if (node.type === 'Identifier') return astIdentifierName(node)
  const member = node as unknown as {
    readonly type?: string
    readonly computed?: boolean
    readonly object?: AstNode
    readonly property?: AstNode
  }
  if (member.type === 'MemberExpression' && member.computed !== true) {
    const objPath = extractMemberPath(member.object as AstNode)
    const prop = astIdentifierName(member.property as unknown as AstNode)
    if (objPath && prop) return `${objPath}.${prop}`
  }
  return undefined
}

function directReactiveIdentifier(expression: AstNode | undefined): string | undefined {
  const node = expression as
    | (AstNode & {
        readonly callee?: AstNode
        readonly arguments?: readonly unknown[]
        readonly object?: AstNode
        readonly property?: AstNode
        readonly computed?: boolean
      })
    | undefined
  // Handle `String(store.count)` wrapping — unwrap and treat as `store.count`
  if (
    node?.type === 'CallExpression' &&
    astIdentifierName(node.callee) === 'String' &&
    node.arguments?.length === 1
  ) {
    const arg = (node.arguments[0] as AstNode) ?? undefined
    const innerPath = extractMemberPath(arg)
    if (innerPath && innerPath.includes('.')) return innerPath
  }
  if (
    node?.type === 'CallExpression' &&
    node.arguments?.length === 0 &&
    node.callee?.type === 'Identifier'
  ) {
    return astIdentifierName(node.callee)
  }
  if (
    node?.type === 'MemberExpression' &&
    node.computed !== true &&
    node.object?.type === 'Identifier' &&
    node.property?.type === 'Identifier' &&
    astIdentifierName(node.property) === 'value'
  ) {
    return astIdentifierName(node.object)
  }
  // Handle store property reads like `store.count` or `store.user.profile.name`
  const memberPath = extractMemberPath(node as AstNode)
  if (memberPath && memberPath.includes('.')) {
    // Heuristic: if it looks like `store.count`, let classifyScopeCaptures decide if base is a store
    // Return the full path so it can be classified as a store-path signal
    return memberPath
  }
  return undefined
}

function bindingExpressionIdentifier(expression: AstNode | undefined): string | undefined {
  if (expression?.type === 'Identifier') return astIdentifierName(expression)
  const memberPath = extractMemberPath(expression as AstNode)
  if (memberPath && memberPath.includes('.')) {
    return memberPath
  }
  return undefined
}

function identifierNamesInAst(expression: AstNode | undefined): readonly string[] {
  const names = new Set<string>()
  walk(expression, (node) => {
    if (node.type === 'Identifier') {
      const name = astIdentifierName(node)
      if (name) names.add(name)
    }
  })
  return [...names]
}

function bindingInsertionOffset(source: string, end: number): number {
  return source.slice(Math.max(0, end - 2), end).includes('/') ? end - 2 : end - 1
}

function hasScopeAttribute(source: string, start: number, end: number): boolean {
  const openingStart = source.lastIndexOf('<', start)
  const openingEnd = source.indexOf('>', end)
  if (openingStart < 0 || openingEnd < 0) return false
  return /(?:^|\s)data-nx-scope\s*=/.test(source.slice(openingStart, openingEnd + 1))
}

function mergeScopeAttributes(code: string): string {
  return code.replace(/<[A-Za-z][^>]*>/g, (tag) => {
    const matches = [...tag.matchAll(/\sdata-nx-scope="([^"]*)"/g)]
    if (matches.length < 2) return tag
    const merged: Record<string, unknown> = {}
    for (const match of matches) {
      try {
        const decoded = JSON.parse(match[1]!.replace(/&quot;/g, '"').replace(/&amp;/g, '&'))
        if (decoded && typeof decoded === 'object' && !Array.isArray(decoded))
          Object.assign(merged, decoded)
      } catch {
        return tag
      }
    }
    const replacement = ` data-nx-scope="${toJsonAttribute(merged)}"`
    let output = tag
    let replaced = false
    for (const match of matches) {
      if (!replaced) {
        output = output.replace(match[0], replacement)
        replaced = true
      } else output = output.replace(match[0], '')
    }
    return output
  })
}

function decodeJsonAttribute(value: string): string {
  return value.replace(/&quot;/g, '"').replace(/&amp;/g, '&')
}

/**
 * Replace inline ScopeRef attributes in rendered HTML with opaque keys and return
 * the payloads for a separate generated runtime asset. The payload remains public
 * browser data; it is moved out of the document source rather than treated as a secret.
 */
export function externalizeScopeAttributes(
  code: string,
  id: string,
): { readonly code: string; readonly payloads: readonly ExternalScopePayload[] } {
  const payloads = new Map<string, ExternalScopePayload>()
  const externalized = code.replace(/data-nx-scope="([^"]*)"/g, (attribute, encoded: string) => {
    try {
      const parsed = JSON.parse(decodeJsonAttribute(encoded))
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return attribute
      const payload = parsed as Record<string, ScopeCapture>
      const key = `nx:scope:${hash(`${normalizeIdForHash(id)}:${JSON.stringify(payload)}`)}`
      payloads.set(key, { key, payload })
      return `data-nx-scope="${key}"`
    } catch {
      return attribute
    }
  })
  return { code: externalized, payloads: [...payloads.values()] }
}

function mergeBindingAttributes(code: string): string {
  let merged = code
  let previous = ''
  while (merged !== previous) {
    previous = merged
    merged = merged
      .replace(
        /data-nx-bind="([^"]+)"(\s+)data-nx-bind="([^"]+)"/g,
        (_match, first: string, spacing: string, second: string) =>
          `data-nx-bind="${first === second ? first : `${first};${second}`}"${spacing}`,
      )
      .replace(
        /data-nx-store-bind="([^"]+)"(\s+)data-nx-store-bind="([^"]+)"/g,
        (_match, first: string, spacing: string, second: string) =>
          `data-nx-store-bind="${first === second ? first : `${first};${second}`}"${spacing}`,
      )
  }
  return merged
}

export { classifyScopeCaptures }

function walk(node: unknown, visit: (node: AstNode) => void): void {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit)
    return
  }
  const record = node as Record<string, unknown>
  visit(record as AstNode)
  for (const child of Object.values(record)) walk(child, visit)
}

const STATIC_UNITLESS_PROPERTIES = new Set([
  'zIndex',
  'opacity',
  'flex',
  'flexGrow',
  'flexShrink',
  'fontWeight',
  'lineHeight',
  'order',
  'orphans',
  'widows',
  'tabSize',
  'columns',
  'fillOpacity',
  'strokeOpacity',
  'animationIterationCount',
])

function extractStaticCss(source: string, id: string): string[] {
  const styles: string[] = []
  const stylePattern = /style=\{\{([^{}]+)\}\}/g
  for (const match of source.matchAll(stylePattern)) {
    const body = match[1]
    if (!body) continue
    const declarations = body
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const separator = entry.indexOf(':')
        if (separator < 1) throw new Error(`[nexil_CSS] Invalid static style in ${id}.`)
        const rawProperty = entry.slice(0, separator).trim()
        const property = rawProperty.startsWith('--')
          ? rawProperty
          : rawProperty.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
        let value = entry
          .slice(separator + 1)
          .trim()
          .replace(/^['"`]|['"`]$/g, '')
        if (!/^(?:--)?[a-zA-Z][a-zA-Z0-9-]*$/.test(property) || /[;{}<>]/.test(value))
          throw new Error(`[nexil_CSS] Unsafe static style in ${id}.`)
        if (
          /^-?\d+(?:\.\d+)?$/.test(value) &&
          value !== '0' &&
          !STATIC_UNITLESS_PROPERTIES.has(rawProperty)
        )
          value = `${value}px`
        return `${property}:${value};`
      })
      .sort()
      .join('')
    styles.push(`.nx-${hash(declarations)}{${declarations}}`)
  }
  return styles
}

function mergeEventAttributes(code: string): string {
  let merged = code
  let previous = ''
  while (merged !== previous) {
    previous = merged
    merged = merged.replace(
      /data-nx-on-([a-z][a-z0-9-]*)="([^"]+)"(\s+)data-nx-on-\1="([^"]+)"/g,
      (_match, eventName: string, first: string, spacing: string, second: string) =>
        `data-nx-on-${eventName}="${first};${second}"${spacing}`,
    )
  }
  return merged
}

function parseSource(source: string, id: string): AstNode {
  try {
    return parse(source, {
      sourceFilename: id,
      sourceType: 'module',
      plugins: ['typescript', 'jsx', 'topLevelAwait'],
    }) as unknown as AstNode
  } catch (error) {
    throw new Error(
      `Nexil compiler could not parse ${id}: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

export async function transformNexilSource(
  source: string,
  id: string,
  options: NexilTransformOptions = {},
): Promise<NexilTransformResult> {
  const ast = parseSource(source, id)
  const moduleDiagnostics: string[] = []
  const chunkSpecs: Array<{ fileName: string; exportName: string; expressionSource: string }> = []
  const attrRanges: Array<{
    readonly start: number
    readonly end: number
    readonly eventName: string
    readonly specIndex: number
  }> = []
  const css: string[] = []
  const scopeCaptures: ScopeCapture[] = []
  const bindings: DomBinding[] = []
  const bindingRanges: Array<{
    readonly offset: number
    readonly attribute: string
  }> = []
  const bindingAttrRemovals: Array<{ readonly start: number; readonly end: number }> = []
  const warnings: string[] = []
  const magic = new MagicString(source)
  const importMapEarly = collectImportMap(source, id)

  walk(ast, (node) => {
    if (node.type === 'ImportDeclaration' && typeof node.source?.value === 'string') {
      const diagnostic = validateImport(id, node.source.value)
      if (diagnostic) moduleDiagnostics.push(`[${diagnostic.code}] ${diagnostic.message}`)
    }

    if (
      node.type === 'JSXAttribute' &&
      typeof node.name?.name === 'string' &&
      node.name.name.startsWith('on') &&
      node.name.name.endsWith('$')
    ) {
      const start = node.start
      const end = node.end
      const expression = node.value?.expression
      if (
        start === undefined ||
        end === undefined ||
        expression?.start === undefined ||
        expression.end === undefined
      ) {
        moduleDiagnostics.push(
          `[nexil_LAZY_BOUNDARY] ${node.name.name} must contain a serializable expression.`,
        )
        return
      }
      const expressionSource = resolveLocalHandlerExpression(
        source,
        source.slice(expression.start, expression.end),
        expression.start,
      )
      const canonicalExpression = expressionSource.replace(/\s+/g, ' ').trim()
      const idHash = hash(`handler:${canonicalExpression}`)
      const exportName = `handler_${idHash}`
      const fileName = `chunk_${idHash}.js`
      const eventName = node.name.name.slice(2, -1).toLowerCase()
      if (!/^[a-z][a-z0-9-]*$/.test(eventName)) {
        moduleDiagnostics.push(
          `[nexil_LAZY_BOUNDARY] ${node.name.name} must use an event name such as onClick$ or onInput$.`,
        )
        return
      }
      let specIndex = chunkSpecs.findIndex((spec) => spec.fileName === fileName)
      if (specIndex < 0) {
        chunkSpecs.push({ fileName, exportName, expressionSource })
        specIndex = chunkSpecs.length - 1
      }
      attrRanges.push({ start, end, eventName, specIndex })
    }

    if (node.type === 'JSXOpeningElement') {
      const opening = node as AstNode & {
        readonly attributes?: readonly AstNode[]
        readonly name?: AstNode
      }
      // Context Provider: <Ctx.Provider value={...}> — emit ctx scope for client resumability
      const openingName = (
        opening as unknown as {
          name?: AstNode & { type?: string; object?: AstNode; property?: AstNode }
        }
      ).name
      let ctxProviderName: string | undefined
      if (
        openingName?.type === 'JSXMemberExpression' &&
        astIdentifierName((openingName as unknown as { property?: AstNode }).property) ===
          'Provider'
      ) {
        const obj = (openingName as unknown as { object?: AstNode }).object
        if (obj?.type === 'JSXIdentifier') ctxProviderName = astIdentifierName(obj)
      }
      if (ctxProviderName) {
        const valueAttr = (opening.attributes ?? []).find(
          (a) => astIdentifierName((a as unknown as { name?: AstNode }).name) === 'value',
        )
        let initial: ScopeCaptureInitial | undefined
        if (valueAttr) {
          const v = (
            valueAttr as unknown as {
              value?: AstNode & { type?: string; value?: unknown; expression?: AstNode }
            }
          ).value
          if (v?.type === 'StringLiteral') initial = v.value as ScopeCaptureInitial
          else if (v?.type === 'JSXExpressionContainer') {
            const expr = (v as unknown as { expression?: AstNode }).expression
            initial = evaluateStaticLiteral(expr as unknown)
            if (
              initial === undefined &&
              (expr as unknown as { type?: string })?.type === 'Identifier'
            ) {
              const varName = astIdentifierName(expr)
              if (varName)
                initial =
                  extractStaticInitial(source, varName) ??
                  extractContextDefault(source, varName) ??
                  undefined
            }
          }
        }
        if (initial === undefined) initial = extractContextDefault(source, ctxProviderName) ?? null
        const capture: ScopeCapture = {
          name: ctxProviderName,
          kind: 'ctx',
          id: `nx:ctx:${hash(ctxProviderName)}`,
          initial: initial as ScopeCaptureInitial,
          lifetime: inferContextLifetime(id),
        }
        scopeCaptures.push(capture)
        const payload = buildScopePayload([capture])
        if (payload && opening.end !== undefined) {
          bindingRanges.push({
            offset: bindingInsertionOffset(source, opening.end),
            attribute: ` data-nx-scope="${toJsonAttribute(payload)}"`,
          })
        }
      }
      const attributes = opening.attributes ?? []
      const explicitBindings = attributes.filter((attribute) => {
        const name = attribute.name?.name
        return (
          typeof name === 'string' &&
          /^bind(?:Text|Value|Checked|Disabled|Hidden|Class|Style|Href|Src|AriaLabel)\$$/.test(name)
        )
      })
      const addBinding = (
        attribute: AstNode,
        target: DomBindingTarget,
        sourceName: string,
        automatic: boolean,
        removeAttribute: boolean,
      ): void => {
        const capture = classifyScopeCaptures(
          source,
          [sourceName],
          id,
          importMapEarly,
        )[0] as unknown as ScopeCapture & { storeId?: string; storePath?: string }
        const start = attribute.start
        const end = attribute.end
        if (!capture || !capture.id || capture.kind === 'unsupported') {
          warnings.push(
            `${automatic ? 'Automatic binding' : 'Binding'} for ${sourceName} was skipped because its initial value is not statically resumable.`,
          )
          if (removeAttribute && start !== undefined && end !== undefined)
            bindingAttrRemovals.push({ start, end })
          return
        }
        // Store path bindings (e.g., `cartStore.count` or `store.user.profile.name`) use fine-grained
        // `data-nx-store-bind` backed by the real store's lens, preserving Zero-Hydration and O(1) updates.
        // They do not need a separate scope signal; the store's `__NEXIL_STORES__` payload already hydrates the root.
        if (
          (capture as unknown as { storeId?: string }).storeId &&
          (capture as unknown as { storePath?: string }).storePath
        ) {
          const storeId = (capture as unknown as { storeId: string }).storeId
          const storePath = (capture as unknown as { storePath: string }).storePath
          const binding: DomBinding = {
            id: `nx:store-path:${hash(`${normalizeIdForHash(id)}:${start ?? 0}:${target}:${storeId}:${storePath}`)}`,
            scopeId: `store:${storeId}:${storePath}`,
            target,
            source: sourceName,
            automatic,
          }
          bindings.push(binding)
          if (removeAttribute && start !== undefined && end !== undefined)
            bindingAttrRemovals.push({ start, end })
          if (opening.end !== undefined) {
            bindingRanges.push({
              offset: bindingInsertionOffset(source, opening.end),
              attribute: ` data-nx-store-bind="${storeId}:${storePath}#${target}"`,
            })
          }
          return
        }
        if (capture.kind !== 'signal' || capture.initial === undefined) {
          warnings.push(
            `${automatic ? 'Automatic binding' : 'Binding'} for ${sourceName} only supports Signals with JSON-literal initial values in this release.`,
          )
          if (removeAttribute && start !== undefined && end !== undefined)
            bindingAttrRemovals.push({ start, end })
          return
        }
        const binding: DomBinding = {
          id: `nx:bind:${hash(`${normalizeIdForHash(id)}:${start ?? 0}:${target}:${automatic ? 'auto' : 'explicit'}`)}`,
          scopeId: capture.id,
          target,
          source: sourceName,
          automatic,
        }
        bindings.push(binding)
        scopeCaptures.push(capture)
        if (removeAttribute && start !== undefined && end !== undefined)
          bindingAttrRemovals.push({ start, end })
        if (opening.end !== undefined) {
          const payload = buildScopePayload([capture])
          bindingRanges.push({
            offset: bindingInsertionOffset(source, opening.end),
            attribute: ` data-nx-bind="${capture.id}#${target}"${
              payload && !hasScopeAttribute(source, opening.start ?? 0, opening.end)
                ? ` data-nx-scope="${toJsonAttribute(payload)}"`
                : ''
            }`,
          })
        }
      }
      for (const attribute of explicitBindings) {
        const attributeName = attribute.name?.name
        if (typeof attributeName !== 'string') continue
        const target = attributeName
          .slice(4, -1)
          .replace(/^[A-Z]/, (letter) => letter.toLowerCase())
          .replace(/^ariaLabel$/, 'aria-label') as DomBindingTarget
        const sourceName = bindingExpressionIdentifier(attribute.value?.expression)
        if (sourceName) addBinding(attribute, target, sourceName, false, true)
        else if (attribute.start !== undefined && attribute.end !== undefined)
          bindingAttrRemovals.push({ start: attribute.start, end: attribute.end })
      }
      const automaticAttributeTargets: Readonly<Record<string, DomBindingTarget>> = {
        value: 'value',
        checked: 'checked',
        disabled: 'disabled',
        hidden: 'hidden',
        className: 'class',
        href: 'href',
        src: 'src',
      }
      for (const attribute of attributes) {
        const attributeName = attribute.name?.name
        if (typeof attributeName !== 'string') continue
        const target = automaticAttributeTargets[attributeName]
        const sourceName = target
          ? directReactiveIdentifier(attribute.value?.expression)
          : undefined
        if (
          target &&
          sourceName &&
          !explicitBindings.some(
            (binding) =>
              binding.name?.name ===
              `bind${attributeName[0]!.toUpperCase()}${attributeName.slice(1)}$`,
          )
        )
          addBinding(attribute, target, sourceName, true, false)
      }
    }

    if (node.type === 'JSXElement') {
      const element = node as AstNode & {
        readonly children?: readonly AstNode[]
      }
      const attributes = element.openingElement?.attributes ?? []
      const hasExplicitTextBinding = attributes.some(
        (attribute) => attribute.name?.name === 'bindText$',
      )
      const children = (element.children ?? []).filter(
        (child) =>
          !(child.type === 'JSXText' && /^\\s*$/.test(source.slice(child.start, child.end))),
      )
      const child = children.length === 1 ? children[0] : undefined
      const expression =
        child?.type === 'JSXExpressionContainer'
          ? (child as AstNode & { readonly expression?: AstNode }).expression
          : undefined
      const sourceName = hasExplicitTextBinding ? undefined : directReactiveIdentifier(expression)
      const capture = sourceName
        ? (classifyScopeCaptures(
            source,
            [sourceName],
            id,
            importMapEarly,
          )[0] as unknown as ScopeCapture & { storeId?: string; storePath?: string })
        : undefined

      // Preserve authoring-friendly interpolations such as `Items: {count()}` by
      // wrapping each direct signal expression in a tiny independently bound span.
      if (children.length > 1) {
        for (const candidate of children) {
          if (candidate.type !== 'JSXExpressionContainer') continue
          const candidateExpression = (candidate as AstNode & { readonly expression?: AstNode })
            .expression
          const candidateName = directReactiveIdentifier(candidateExpression)
          const candidateCapture = candidateName
            ? (classifyScopeCaptures(
                source,
                [candidateName],
                id,
                importMapEarly,
              )[0] as unknown as ScopeCapture & { storeId?: string; storePath?: string })
            : undefined
          if (
            !candidateName ||
            candidateCapture?.kind !== 'signal' ||
            !candidateCapture.id ||
            candidateCapture.initial === undefined ||
            candidate.start === undefined ||
            candidate.end === undefined
          )
            continue
          // Store path bindings use `data-nx-store-bind` backed by the real store's lens (fine-grained, zero-hydration)
          if ((candidateCapture as unknown as { storeId?: string }).storeId) {
            const storeId = (candidateCapture as unknown as { storeId: string }).storeId
            const storePath = (candidateCapture as unknown as { storePath: string }).storePath
            const bindingId = `nx:store-path:${hash(`${normalizeIdForHash(id)}:${candidate.start}:text:${storeId}:${storePath}`)}`
            const binding: DomBinding = {
              id: bindingId,
              scopeId: `store:${storeId}:${storePath}`,
              target: 'text',
              source: candidateName,
              automatic: true,
            }
            bindings.push(binding)
            const expressionSource = source.slice(candidate.start, candidate.end)
            magic.overwrite(
              candidate.start,
              candidate.end,
              `<span data-nx-store-bind="${storeId}:${storePath}#text">${expressionSource}</span>`,
            )
            continue
          }
          const bindingId = `nx:bind:${hash(`${normalizeIdForHash(id)}:${candidate.start}:text`)}`
          const binding: DomBinding = {
            id: bindingId,
            scopeId: candidateCapture.id,
            target: 'text',
            source: candidateName,
            automatic: true,
          }
          bindings.push(binding)
          scopeCaptures.push(candidateCapture)
          const payload = buildScopePayload([candidateCapture])
          const expressionSource = source.slice(candidate.start, candidate.end)
          magic.overwrite(
            candidate.start,
            candidate.end,
            `<span data-nx-bind="${candidateCapture.id}#text"${
              payload ? ` data-nx-scope="${toJsonAttribute(payload)}"` : ''
            }>${expressionSource}</span>`,
          )
        }
      }
      if (!sourceName && !hasExplicitTextBinding && expression) {
        for (const name of identifierNamesInAst(expression)) {
          const candidate = classifyScopeCaptures(source, [name], id, importMapEarly)[0]
          if (candidate?.kind === 'signal') {
            warnings.push(
              `Automatic binding for ${name} was skipped because the JSX expression is dynamic; use bindText$ for a direct binding.`,
            )
          }
        }
      }
      if (sourceName && capture) {
        // Store path bindings (e.g., `cartStore.count` or `store.user.profile.name`) use `data-nx-store-bind`
        if ((capture as unknown as { storeId?: string }).storeId) {
          const storeId = (capture as unknown as { storeId: string }).storeId
          const storePath = (capture as unknown as { storePath: string }).storePath
          const bindingId = `nx:store-path:${hash(`${normalizeIdForHash(id)}:${child?.start ?? 0}:text:${storeId}:${storePath}`)}`
          const binding: DomBinding = {
            id: bindingId,
            scopeId: `store:${storeId}:${storePath}`,
            target: 'text',
            source: sourceName,
            automatic: true,
          }
          bindings.push(binding)
          if (element.openingElement?.end !== undefined) {
            bindingRanges.push({
              offset: bindingInsertionOffset(source, element.openingElement.end),
              attribute: ` data-nx-store-bind="${storeId}:${storePath}#text"`,
            })
          }
        } else if (capture.kind === 'signal' && capture.id && capture.initial !== undefined) {
          const binding: DomBinding = {
            id: `nx:bind:${hash(`${normalizeIdForHash(id)}:${child?.start ?? 0}:text`)}`,
            scopeId: capture.id,
            target: 'text',
            source: sourceName,
            automatic: true,
          }
          bindings.push(binding)
          scopeCaptures.push(capture)
          if (element.openingElement?.end !== undefined) {
            const payload = buildScopePayload([capture])
            bindingRanges.push({
              offset: bindingInsertionOffset(source, element.openingElement.end),
              attribute: ` data-nx-bind="${capture.id}#text"${
                payload &&
                !hasScopeAttribute(
                  source,
                  element.openingElement.start ?? 0,
                  element.openingElement.end,
                )
                  ? ` data-nx-scope="${toJsonAttribute(payload)}"`
                  : ''
              }`,
            })
          }
        } else {
          warnings.push(
            `Automatic binding for ${sourceName} was skipped because its initial value is not statically resumable.`,
          )
        }
      }
    }

    // component$ bodies use the same capture classifier as route components;
    // state/store declarations are serialized when a nested lazy handler closes over them.

    if (
      node.type === 'ObjectProperty' &&
      typeof node.name?.name === 'string' &&
      node.name.name === 'style'
    ) {
      const value = node.value
      if (
        value?.type === 'ObjectExpression' &&
        node.start !== undefined &&
        node.end !== undefined
      ) {
        css.push(source.slice(node.start, node.end))
      }
    }
  })

  // Inject stable Context identity so same definition across layout/route shares id via createContext(default, stableId),
  // while distinct vars with same default remain distinct (hash(name) not hash(default)).
  {
    const defs: Array<{ name: string; argEnd: number }> = []
    walk(ast, (node) => {
      if (node.type !== 'VariableDeclarator') return
      const decl = node as unknown as {
        readonly id?: AstNode
        readonly init?: AstNode & {
          readonly callee?: AstNode
          readonly arguments?: readonly AstNode[]
        }
      }
      const varName = astIdentifierName(decl.id)
      const init = decl.init
      if (!varName || !init || init.type !== 'CallExpression') return
      if (astIdentifierName(init.callee) !== 'createContext') return
      const args = init.arguments ?? []
      if (args.length !== 1) return
      const first = args[0] as AstNode
      if (first?.end === undefined) return
      defs.push({ name: varName, argEnd: first.end })
    })
    for (const { name, argEnd } of defs) {
      const stable = `nx:ctx:${hash(name)}`
      magic.appendLeft(argEnd, `, "${stable}"`)
    }
  }

  const secretDiagnostic = findSecretExposure(id, source)
  if (secretDiagnostic)
    moduleDiagnostics.push(`[${secretDiagnostic.code}] ${secretDiagnostic.message}`)
  if (moduleDiagnostics.length > 0) throw new Error(moduleDiagnostics.join('\n'))

  // Route modules may be TypeScript: strip annotations so emitted chunks are
  // always plain JavaScript, regardless of the authoring language.
  const isTypeScript = /\.tsx?$/.test(id)
  const chunks: LazyChunk[] = []
  const capturesBySpec: ScopeCapture[][] = []
  const importMap = collectImportMap(source, id)
  for (const { fileName, exportName, expressionSource } of chunkSpecs) {
    const capturedExpression = captureExpressionWithImports(expressionSource, importMap, source)
    const captures = classifyScopeCaptures(
      source,
      capturedExpression.scopeNames as unknown as readonly string[],
      id,
      importMap,
    )
    capturesBySpec.push(captures)
    scopeCaptures.push(...captures)
    for (const capture of captures) {
      if (capture.kind === 'unsupported')
        warnings.push(capture.reason ?? `Unsupported capture: ${capture.name}`)
    }
    const storeInitCalls: string[] = []
    const finalImportNames = new Set(capturedExpression.importNames)
    for (const capture of captures) {
      if (capture.kind === 'store' && (capture as unknown as { storeId?: string }).storeId) {
        const sId = (capture as unknown as { storeId: string }).storeId
        for (const [impName, impInfo] of importMap.entries()) {
          const src = impInfo.source.toLowerCase()
          if (
            src.includes(`stores/${sId}`) ||
            src.includes(`/${sId}`) ||
            src.endsWith(`/${sId}.js`) ||
            src.endsWith(`/${sId}.ts`) ||
            impName.toLowerCase().includes(sId)
          ) {
            finalImportNames.add(impName)
            storeInitCalls.push(
              `try { if (typeof ${impName} === 'function') ${impName}(); } catch {}`,
            )
            storeInitCalls.push(
              `const __live_${sId} = globalThis.__NEXIL_STORES_GLOBAL_REGISTRY__?.get('${sId}'); if (__live_${sId} && scope['${capture.name}']) { scope['${capture.name}'] = __live_${sId}; }`,
            )
          }
        }
      }
    }
    const importHeader = buildImportHeader([...finalImportNames], importMap, id)
    const header = importHeader ? `${importHeader}\n` : ''
    const initCode = storeInitCalls.length > 0 ? `  ${storeInitCalls.join('\n  ')}\n` : ''
    const raw = `${header}export async function ${exportName}({ element, scope = {}, event }) {\n${initCode}  return (${capturedExpression.code})({ element, event, scope })\n}\n`
    const source_ = isTypeScript
      ? (
          await transformWithEsbuild(raw, `${fileName}.ts`, {
            loader: 'ts',
            treeShaking: false,
          })
        ).code
      : raw
    chunks.push({ fileName, source: source_ })
  }

  // Remove authoring-only binding directives and insert compact SSR binding metadata.
  for (const removal of bindingAttrRemovals.sort((left, right) => right.start - left.start)) {
    magic.remove(removal.start, removal.end)
  }
  // Emit each boundary reference together with its serialized scope payload so
  // the bootstrap can materialize captured signals/stores/actions before the handler runs.
  for (const range of attrRanges) {
    const spec = chunkSpecs[range.specIndex]
    if (!spec) continue
    const reference = `${spec.fileName}#${spec.exportName}`
    const payload = buildScopePayload(capturesBySpec[range.specIndex] ?? [])
    const attribute =
      payload && !hasScopeAttribute(source, range.start, range.end)
        ? `data-nx-on-${range.eventName}="${reference}" data-nx-scope="${toJsonAttribute(payload)}"`
        : `data-nx-on-${range.eventName}="${reference}"`
    magic.overwrite(range.start, range.end, attribute)
  }
  for (const range of bindingRanges) {
    magic.appendLeft(range.offset, range.attribute)
  }

  const mergedCode = mergeScopeAttributes(
    mergeBindingAttributes(mergeEventAttributes(magic.toString())),
  )
  const externalizedScopes =
    options.scopeSerialization === 'external'
      ? externalizeScopeAttributes(mergedCode, id)
      : { code: mergedCode, payloads: [] }
  return {
    code: externalizedScopes.code,
    map: magic.generateMap({ hires: true }),
    chunks,
    css: extractStaticCss(source, id),
    scopeCaptures,
    externalScopePayloads: externalizedScopes.payloads,
    bindings,
    warnings,
  }
}

export function nexil(options: { readonly root?: string } = {}): Plugin {
  const generatedChunks = new Map<string, string>()
  const generatedCss = new Set<string>()
  let hasBindings = false
  let hasNavigation = false
  let hasForms = false
  let storeDescriptors: readonly StoreDescriptor[] = []
  let storeWarnings: readonly string[] = []
  let resolvedRoot = options.root ?? process.cwd()
  const VIRTUAL_NEXIL_STORES = 'virtual:nexil-stores'
  const VIRTUAL_PREFIX = '\0virtual:nexil-stores'
  const STORES_PREFIX = '\0$stores/'

  async function refreshStores(root: string): Promise<void> {
    try {
      const result = await discoverStores(root)
      storeDescriptors = result.descriptors
      storeWarnings = result.warnings
      // Generate .nexil/stores.d.ts — best effort, never fail the build
      try {
        await writeStoresDTS(root, storeDescriptors)
      } catch {}
      for (const w of storeWarnings) {
        // Vite will surface warnings via configResolved/buildStart
        void w
      }
    } catch {
      storeDescriptors = []
      storeWarnings = []
    }
  }

  return {
    name: 'nexil',
    enforce: 'pre',
    config() {
      return {
        esbuild: {
          jsx: 'automatic',
          jsxImportSource: '@nexil/core',
        },
      }
    },
    async configResolved(config) {
      resolvedRoot = options.root ?? config.root ?? process.cwd()
      await refreshStores(resolvedRoot)
      for (const w of storeWarnings) {
        // Use Vite's logger if available, else console.warn
        const logger = (config as unknown as { logger?: { warn?: (msg: string) => void } }).logger
        if (logger?.warn) logger.warn(w)
        else console.warn(`[nexil:stores] ${w}`)
      }
    },
    async buildStart() {
      // Refresh before each build (covers --watch and config change)
      await refreshStores(resolvedRoot)
    },
    resolveId(id) {
      if (id === VIRTUAL_NEXIL_STORES || id === 'virtual:nexil-stores') {
        return VIRTUAL_PREFIX
      }
      if (id.startsWith('$stores/')) {
        const storeId = id.slice('$stores/'.length)
        const descriptor = storeDescriptors.find((d) => d.id === storeId)
        if (descriptor) return descriptor.entry
        // Also handle virtual subpath like $stores/admin/settings
        // Fallback: let Vite try to resolve as file (will fail with clear message)
        return null
      }
      if (id.startsWith(VIRTUAL_PREFIX) || id.startsWith(STORES_PREFIX)) {
        return id
      }
      return null
    },
    load(id) {
      if (id === VIRTUAL_PREFIX) {
        return generateVirtualBarrel(storeDescriptors)
      }
      if (id.startsWith(STORES_PREFIX)) {
        const storeId = id.slice(STORES_PREFIX.length)
        const descriptor = storeDescriptors.find((d) => d.id === storeId)
        if (descriptor) {
          // Re-export the store entry — Vite will then load the real file
          return `export * from '${descriptor.entry.replace(/\\/g, '/')}';\nexport { default } from '${descriptor.entry.replace(/\\/g, '/')}';\n`
        }
        return null
      }
      return null
    },
    configureServer(server) {
      // Serve the resumability runtime and lazily extracted handler chunks under
      // stable URLs so interactive routes work identically in dev and production.
      server.middlewares.use((request, response, next) => {
        if (request.method !== 'GET') return next()
        const url = request.url ?? ''
        if (
          url === '/nexil-bootstrap.js' ||
          url === '/nexil-bindings.js' ||
          url === '/nexil-forms.js' ||
          url === '/nexil-navigation.js'
        ) {
          response.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' })
          if (url === '/nexil-navigation.js') {
            response.end(NEXIL_NAVIGATION_RUNTIME)
          } else if (url === '/nexil-forms.js') {
            response.end(RESUMABILITY_FORMS)
          } else if (url === '/nexil-bindings.js') {
            response.end(RESUMABILITY_BINDINGS)
          } else {
            response.end(RESUMABILITY_BOOTSTRAP)
          }
          return
        }
        const match = /^\/nexil-chunks\/([A-Za-z0-9_.-]+\.js)$/.exec(url)
        const chunkName = match?.[1]
        if (chunkName !== undefined) {
          const source = generatedChunks.get(chunkName)
          if (source === undefined) {
            response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
            response.end(`Unknown Nexil chunk: ${chunkName}`)
            return
          }
          response.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' })
          response.end(source)
          return
        }
        return next()
      })
    },
    async transform(source, id) {
      if (!/\.(tsx|jsx|ts|js)$/.test(id) || id.includes('/node_modules/')) return null
      // Stores: wrap actions with batch() (runtime already batches, but Vite-level ensures consistency)
      const wrapped = wrapActionsWithBatch(source, id)
      const effectiveSource = wrapped.code
      const result = await transformNexilSource(effectiveSource, id)
      hasBindings ||= result.bindings.length > 0
      hasNavigation ||=
        source.includes('data-nx-link') ||
        effectiveSource.includes('data-nx-link') ||
        result.code.includes('data-nx-link')
      hasForms ||=
        source.includes('data-nx-form') ||
        effectiveSource.includes('data-nx-form') ||
        result.code.includes('data-nx-form')
      for (const chunk of result.chunks) {
        const minified = await transformWithEsbuild(chunk.source, chunk.fileName, {
          loader: 'js',
          minify: true,
        })
        generatedChunks.set(chunk.fileName, minified.code)
      }
      for (const css of result.css) generatedCss.add(css)
      // If this was a store file that was batch-wrapped, return the wrapped+transformed code
      if (wrapped.changed) {
        // transformNexilSource already produced `result.code` from wrapped source, so return it
        return { code: result.code, map: result.map }
      }
      return { code: result.code, map: result.map }
    },
    async handleHotUpdate(ctx) {
      // Keep previously emitted chunks available while Vite invalidates modules.
      // The content-addressed filenames prevent stale handlers from colliding with new ones.
      generatedCss.clear()
      // If a store file changed, refresh descriptors and .nexil/stores.d.ts without resetting signals.
      // HMR shape changes (adding/removing state keys) are merged via `mergeStateForHMR` in
      // `@nexil/state` — `useStore()` on next call will preserve live values for existing keys,
      // add new keys with initial values, and remove deleted keys, avoiding full reload.
      // Pure logic changes (actions/getters) are hot-swapped via `__nexil_hmrUpdate` without touching state.
      const isStoreFile =
        ctx.file.includes(`${'/src/stores/'}`) || ctx.file.includes(`\\src\\stores\\`)
      if (isStoreFile) {
        await refreshStores(resolvedRoot)
        // Invalidate virtual modules so new barrel is served
        const mods = [...(ctx.server.moduleGraph.getModulesByFile(ctx.file) ?? [])]
        // Also invalidate virtual:nexil-stores
        const virtualMod = ctx.server.moduleGraph.getModuleById(VIRTUAL_PREFIX)
        if (virtualMod) mods.push(virtualMod)
        // Return mods to let Vite handle HMR — signals are preserved via global registry in @nexil/state
        // and shape changes are merged live (see `packages/state/src/index.ts:mergeStateForHMR`).
        // Full reload is only needed for non-serializable shape changes or store id renames.
        return mods.length > 0 ? mods : undefined
      }
      return undefined
    },
    generateBundle() {
      for (const [fileName, source] of generatedChunks) {
        this.emitFile({ type: 'asset', fileName: `nexil-chunks/${fileName}`, source })
      }
      if (generatedChunks.size > 0 || hasBindings) {
        this.emitFile({
          type: 'asset',
          fileName: 'nexil-bootstrap.js',
          source: RESUMABILITY_BOOTSTRAP,
        })
      }
      if (hasBindings) {
        this.emitFile({
          type: 'asset',
          fileName: 'nexil-bindings.js',
          source: RESUMABILITY_BINDINGS,
        })
      }
      if (hasNavigation) {
        this.emitFile({
          type: 'asset',
          fileName: 'nexil-navigation.js',
          source: NEXIL_NAVIGATION_RUNTIME,
        })
      }
      if (hasForms) {
        this.emitFile({
          type: 'asset',
          fileName: 'nexil-forms.js',
          source: RESUMABILITY_FORMS,
        })
      }
      if (generatedCss.size > 0) {
        this.emitFile({
          type: 'asset',
          fileName: 'assets/nexil.css',
          source: [...generatedCss].join(''),
        })
      }
    },
  }
}

export const nexilPlugin = nexil
export default nexil

export * from './boundaries.js'
export * from './budget.js'
export * from './transform.js'
