import { createHash } from 'node:crypto'
import { parse } from '@babel/parser'
import traverseModule from '@babel/traverse'
import MagicString from 'magic-string'

const traverse = ((traverseModule as unknown as { default?: typeof traverseModule }).default ??
  traverseModule) as typeof traverseModule

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
  readonly initial?: ScopeCaptureInitial
  readonly endpoint?: string
  readonly lifetime?: ScopeCaptureLifetime
  readonly storeId?: string
  readonly storePath?: string
}

export interface ResumableChunk {
  readonly fileName: string
  readonly exportName: string
  readonly source: string
  readonly captures: readonly ScopeCapture[]
}

export interface CompilerTransformOptions {
  readonly filename?: string
  readonly sourcemap?: boolean
  readonly scopeSerialization?: 'inline' | 'external'
}

export interface CompilerTransformResult {
  readonly code: string
  readonly map: ReturnType<MagicString['generateMap']>
  readonly chunks: readonly ResumableChunk[]
  readonly scopeCaptures: readonly ScopeCapture[]
  readonly warnings: readonly string[]
}

function stableHash(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 12)
}

function toJsonAttribute(value: unknown): string {
  return JSON.stringify(value).replace(/"/g, '&quot;')
}

interface ChunkSpec {
  readonly fileName: string
  readonly exportName: string
  readonly expressionSource: string
  readonly eventName: string
}

interface AttrRange {
  readonly start: number
  readonly end: number
  readonly specIndex: number
  readonly eventName: string
}

interface ImportBinding {
  readonly importedName: string
  readonly source: string
  readonly isDefault: boolean
  readonly isNamespace: boolean
}

function collectImportMap(source: string): Map<string, ImportBinding> {
  const map = new Map<string, ImportBinding>()
  let ast: ReturnType<typeof parse>
  try {
    ast = parse(source, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript'],
    })
  } catch {
    return map
  }

  traverse(ast, {
    ImportDeclaration(path) {
      const src = path.node.source.value
      for (const spec of path.node.specifiers) {
        if (spec.type === 'ImportDefaultSpecifier') {
          map.set(spec.local.name, {
            importedName: 'default',
            source: src,
            isDefault: true,
            isNamespace: false,
          })
        } else if (spec.type === 'ImportNamespaceSpecifier') {
          map.set(spec.local.name, {
            importedName: '*',
            source: src,
            isDefault: false,
            isNamespace: true,
          })
        } else if (spec.type === 'ImportSpecifier') {
          const imported =
            spec.imported.type === 'Identifier' ? spec.imported.name : spec.imported.value
          map.set(spec.local.name, {
            importedName: imported,
            source: src,
            isDefault: false,
            isNamespace: false,
          })
        }
      }
    },
  })

  return map
}

function analyzeClosureScope(
  expressionSource: string,
  importMap: Map<string, ImportBinding>,
  parentSource: string,
): {
  readonly scopeNames: readonly string[]
  readonly importNames: readonly string[]
  readonly code: string
} {
  let ast: ReturnType<typeof parse>
  const wrapped = `const __fn = (${expressionSource})`
  try {
    ast = parse(wrapped, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript'],
    })
  } catch {
    return { scopeNames: [], importNames: [], code: expressionSource }
  }

  const freeIdentifiers = new Set<string>()
  const declaredLocals = new Set<string>()

  traverse(ast, {
    Function(path) {
      for (const param of path.node.params) {
        if (param.type === 'Identifier') declaredLocals.add(param.name)
        else if (param.type === 'ObjectPattern') {
          for (const prop of param.properties) {
            if (prop.type === 'ObjectProperty' && prop.value.type === 'Identifier') {
              declaredLocals.add(prop.value.name)
            }
          }
        }
      }
    },
    VariableDeclarator(path) {
      if (path.node.id.type === 'Identifier') {
        declaredLocals.add(path.node.id.name)
      }
    },
    Identifier(path) {
      const name = path.node.name
      if (path.key === 'property' && !path.parentPath.isMemberExpression({ computed: true })) return
      if (path.key === 'key' && !path.parentPath.isObjectProperty({ computed: true })) return
      if (
        ['__fn', 'element', 'event', 'scope', 'console', 'window', 'document', 'fetch'].includes(
          name,
        )
      )
        return
      if (!declaredLocals.has(name)) {
        freeIdentifiers.add(name)
      }
    },
  })

  const importNames: string[] = []
  const scopeNames: string[] = []

  for (const ident of freeIdentifiers) {
    if (importMap.has(ident)) {
      importNames.push(ident)
    } else {
      scopeNames.push(ident)
    }
  }

  return { scopeNames, importNames, code: expressionSource }
}

function classifyScopeCaptures(
  source: string,
  scopeNames: readonly string[],
  id: string,
  importMap: Map<string, ImportBinding>,
): ScopeCapture[] {
  const captures: ScopeCapture[] = []
  for (const name of scopeNames) {
    if (importMap.has(name)) continue
    // Check if declared as signal / store / action in source
    const signalRegex = new RegExp(
      `(?:const|let)\\s+${name}\\s*=\\s*(?:state|signal)\\s*\\(([^)]*)\\)`,
    )
    const storeRegex = new RegExp(
      `(?:const|let)\\s+${name}\\s*=\\s*(?:store|defineStore|defineStoreContext)\\s*\\(([^)]*)\\)`,
    )
    const actionRegex = new RegExp(`(?:const|let)\\s+${name}\\s*=\\s*action\\s*\\(([^)]*)\\)`)

    const signalMatch = source.match(signalRegex)
    if (signalMatch && signalMatch[1] !== undefined) {
      let initial: ScopeCaptureInitial = null
      const rawInitial = signalMatch[1].trim()
      try {
        initial = JSON.parse(rawInitial)
      } catch {
        initial = rawInitial
      }
      captures.push({
        name,
        kind: 'signal',
        id: `nx:signal:${stableHash(`${id}#${name}`)}`,
        initial,
      })
      continue
    }

    const storeMatch = source.match(storeRegex)
    if (storeMatch) {
      captures.push({
        name,
        kind: 'store',
        id: `nx:store:${stableHash(`${id}#${name}`)}`,
        initial: {},
      })
      continue
    }

    const actionMatch = source.match(actionRegex)
    if (actionMatch) {
      captures.push({
        name,
        kind: 'action',
        id: `nx:action:${stableHash(`${id}#${name}`)}`,
        endpoint: `/__nexil/actions/${name}`,
      })
      continue
    }

    captures.push({
      name,
      kind: 'value',
      data: null as unknown as ScopeCaptureInitial,
    } as unknown as ScopeCapture)
  }
  return captures
}

function buildScopePayload(captures: readonly ScopeCapture[]): Record<string, unknown> | null {
  if (captures.length === 0) return null
  const payload: Record<string, unknown> = {}
  for (const cap of captures) {
    if (cap.kind === 'signal') {
      payload[cap.name] = { kind: 'signal', id: cap.id, initial: cap.initial }
    } else if (cap.kind === 'store') {
      payload[cap.name] = { kind: 'store', id: cap.id, initial: cap.initial, storeId: cap.storeId }
    } else if (cap.kind === 'action') {
      payload[cap.name] = { kind: 'action', id: cap.id, endpoint: cap.endpoint }
    } else if (cap.kind === 'value') {
      payload[cap.name] = { kind: 'value', data: (cap as { data?: unknown }).data ?? null }
    }
  }
  return Object.keys(payload).length > 0 ? payload : null
}

function buildImportHeader(
  importNames: readonly string[],
  importMap: Map<string, ImportBinding>,
): string {
  const bySource = new Map<string, string[]>()
  for (const name of importNames) {
    const binding = importMap.get(name)
    if (!binding) continue
    const list = bySource.get(binding.source) ?? []
    if (binding.isDefault) list.push(name)
    else if (binding.isNamespace) list.push(`* as ${name}`)
    else if (binding.importedName === name) list.push(name)
    else list.push(`${binding.importedName} as ${name}`)
    bySource.set(binding.source, list)
  }

  const lines: string[] = []
  for (const [source, list] of bySource) {
    lines.push(`import { ${list.join(', ')} } from ${JSON.stringify(source)}`)
  }
  return lines.join('\n')
}

/**
 * Transforms JSX/TSX source code by locating `$` resumable closures,
 * extracting them into standalone hoisted chunk modules, and rewriting
 * the JSX AST with serialized symbol references and scope metadata.
 */
export function transformResumableJSX(
  source: string,
  id: string,
  options: CompilerTransformOptions = {},
): CompilerTransformResult {
  const magic = new MagicString(source)
  const warnings: string[] = []
  const scopeCaptures: ScopeCapture[] = []
  const chunks: ResumableChunk[] = []

  let ast: ReturnType<typeof parse>
  try {
    ast = parse(source, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript'],
    })
  } catch (error) {
    return {
      code: source,
      map: magic.generateMap({ hires: true }),
      chunks: [],
      scopeCaptures: [],
      warnings: [`Failed to parse AST: ${String(error)}`],
    }
  }

  const chunkSpecs: ChunkSpec[] = []
  const attrRanges: AttrRange[] = []
  const importMap = collectImportMap(source)

  traverse(ast, {
    JSXAttribute(path) {
      const nameNode = path.node.name
      if (nameNode.type !== 'JSXIdentifier') return
      const attrName = nameNode.name

      // Check if attribute ends in $ (e.g. onClick$, onInput$, component$)
      if (!/^on([A-Z][a-zA-Z0-9]*)\$$/.test(attrName) && attrName !== 'component$') return

      const valueNode = path.node.value
      if (!valueNode || valueNode.type !== 'JSXExpressionContainer') return
      const expr = valueNode.expression
      if (expr.type === 'JSXEmptyExpression') return

      const eventName = attrName === 'component$' ? 'mount' : attrName.slice(2, -1).toLowerCase()
      const start = expr.start!
      const end = expr.end!
      const expressionSource = source.slice(start, end)

      const hash = stableHash(`${id}:${start}:${expressionSource}`)
      const fileName = `chunk_${hash}.js`
      const exportName = `__nexil_action_${hash}`

      const specIndex = chunkSpecs.length
      chunkSpecs.push({
        fileName,
        exportName,
        expressionSource,
        eventName,
      })

      attrRanges.push({
        start: path.node.start!,
        end: path.node.end!,
        specIndex,
        eventName,
      })
    },
  })

  for (const { fileName, exportName, expressionSource, eventName } of chunkSpecs) {
    const analysis = analyzeClosureScope(expressionSource, importMap, source)
    const captures = classifyScopeCaptures(source, analysis.scopeNames, id, importMap)
    scopeCaptures.push(...captures)

    const importHeader = buildImportHeader(analysis.importNames, importMap)
    const header = importHeader ? `${importHeader}\n` : ''
    const chunkSource = `${header}export async function ${exportName}({ element, scope = {}, event }) {\n  return (${expressionSource})({ element, event, scope })\n}\n`

    chunks.push({
      fileName,
      exportName,
      source: chunkSource,
      captures,
    })
  }

  for (const range of attrRanges) {
    const spec = chunkSpecs[range.specIndex]
    if (!spec) continue
    const reference = `${spec.fileName}#${spec.exportName}`
    const captures = chunks[range.specIndex]?.captures ?? []
    const payload = buildScopePayload(captures)

    const attribute = payload
      ? `data-nx-on-${range.eventName}="${reference}" data-nx-scope="${toJsonAttribute(payload)}"`
      : `data-nx-on-${range.eventName}="${reference}"`

    magic.overwrite(range.start, range.end, attribute)
  }

  return {
    code: magic.toString(),
    map: magic.generateMap({ hires: true }),
    chunks,
    scopeCaptures,
    warnings,
  }
}
