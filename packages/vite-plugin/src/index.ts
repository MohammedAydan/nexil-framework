import { createHash } from 'node:crypto'
import { parse } from '@babel/parser'
import MagicString from 'magic-string'
import type { Plugin } from 'vite'
import { findSecretExposure, validateImport } from '@nexis/compiler'

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

export interface NexisTransformResult {
  readonly code: string
  readonly map: ReturnType<MagicString['generateMap']>
  readonly chunks: readonly LazyChunk[]
  readonly css: readonly string[]
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 12)
}

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
        if (separator < 1) throw new Error(`[NEXIS_CSS] Invalid static style in ${id}.`)
        const property = entry
          .slice(0, separator)
          .trim()
          .replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
        const value = entry
          .slice(separator + 1)
          .trim()
          .replace(/^['\"`]|['\"`]$/g, '')
        if (!/^[a-z-]+$/.test(property) || /[;{}]/.test(value))
          throw new Error(`[NEXIS_CSS] Unsafe static style in ${id}.`)
        return `${property}:${value};`
      })
      .sort()
      .join('')
    styles.push(`.nx-${hash(declarations)}{${declarations}}`)
  }
  return styles
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
      `Nexis compiler could not parse ${id}: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

export function transformNexisSource(source: string, id: string): NexisTransformResult {
  const ast = parseSource(source, id)
  const moduleDiagnostics: string[] = []
  const chunks: LazyChunk[] = []
  const css: string[] = []
  const magic = new MagicString(source)

  walk(ast, (node) => {
    if (node.type === 'ImportDeclaration' && typeof node.source?.value === 'string') {
      const diagnostic = validateImport(id, node.source.value)
      if (diagnostic) moduleDiagnostics.push(`[${diagnostic.code}] ${diagnostic.message}`)
    }

    if (
      node.type === 'JSXAttribute' &&
      typeof node.name?.name === 'string' &&
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
          `[NEXIS_LAZY_BOUNDARY] ${node.name.name} must contain a serializable expression.`,
        )
        return
      }
      const expressionSource = source.slice(expression.start, expression.end)
      const idHash = hash(`${id}:${start}:${expressionSource}`)
      const exportName = `handler_${idHash}`
      const fileName = `chunk_${idHash}.js`
      chunks.push({
        fileName,
        source: `export async function ${exportName}(event) { return (${expressionSource})(event) }\n`,
      })
      magic.overwrite(start, end, `data-nx-on-click="${fileName}#${exportName}"`)
    }

    if (node.type === 'CallExpression') {
      const callee = node as AstNode & { readonly callee?: AstNode }
      if (callee.callee?.type === 'Identifier' && callee.callee.name?.name === 'component$') {
        moduleDiagnostics.push(
          '[NEXIS_COMPONENT_BOUNDARY] component$ extraction requires an explicit serializable boundary in this baseline.',
        )
      }
    }

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

  const secretDiagnostic = findSecretExposure(id, source)
  if (secretDiagnostic)
    moduleDiagnostics.push(`[${secretDiagnostic.code}] ${secretDiagnostic.message}`)
  if (moduleDiagnostics.length > 0) throw new Error(moduleDiagnostics.join('\n'))

  return {
    code: magic.toString(),
    map: magic.generateMap({ hires: true }),
    chunks,
    css: extractStaticCss(source, id),
  }
}

export function nexis(options: { readonly root?: string } = {}): Plugin {
  const generatedChunks = new Map<string, string>()
  const generatedCss = new Set<string>()
  return {
    name: 'nexis',
    enforce: 'pre',
    configResolved(config) {
      void options.root
      void config.root
    },
    transform(source, id) {
      if (!/\.(tsx|jsx|ts|js)$/.test(id) || id.includes('/node_modules/')) return null
      const result = transformNexisSource(source, id)
      for (const chunk of result.chunks) generatedChunks.set(chunk.fileName, chunk.source)
      for (const css of result.css) generatedCss.add(css)
      return { code: result.code, map: result.map }
    },
    generateBundle() {
      for (const [fileName, source] of generatedChunks) {
        this.emitFile({ type: 'asset', fileName, source })
      }
      if (generatedCss.size > 0) {
        this.emitFile({
          type: 'asset',
          fileName: 'assets/nexis.css',
          source: [...generatedCss].join(''),
        })
      }
    },
  }
}

export default nexis
