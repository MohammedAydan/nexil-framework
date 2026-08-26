import { createHash } from 'node:crypto'
import { parse } from '@babel/parser'
import traverseModule from '@babel/traverse'
import MagicString from 'magic-string'
import { transformWithEsbuild } from 'vite'
import type { Plugin } from 'vite'
import { findSecretExposure, validateImport } from '@mohammedaydan/compiler'
import { RESUMABILITY_BINDINGS, RESUMABILITY_BOOTSTRAP } from './bootstrap.js'

const traverse = ((traverseModule as unknown as { default?: typeof traverseModule }).default ??
  traverseModule) as typeof traverseModule

export { RESUMABILITY_BINDINGS, RESUMABILITY_BOOTSTRAP }

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

export type ScopeCaptureKind = 'value' | 'signal' | 'store' | 'action' | 'unsupported'

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
}

export type DomBindingTarget = 'text' | 'value' | 'checked' | 'disabled' | 'hidden'

export interface DomBinding {
  readonly id: string
  readonly scopeId: string
  readonly target: DomBindingTarget
  readonly source: string
  readonly automatic: boolean
}

export interface NexisTransformResult {
  readonly code: string
  readonly map: ReturnType<MagicString['generateMap']>
  readonly chunks: readonly LazyChunk[]
  readonly css: readonly string[]
  readonly scopeCaptures: readonly ScopeCapture[]
  readonly bindings: readonly DomBinding[]
  readonly warnings: readonly string[]
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
])

function captureExpression(expressionSource: string): {
  readonly code: string
  readonly names: readonly string[]
} {
  const prefix = 'const __nexisHandler = '
  const ast = parse(`${prefix}${expressionSource}`, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx', 'topLevelAwait'],
  })
  const replacements: Array<{ start: number; end: number; name: string }> = []
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
      const start = path.node.start
      const end = path.node.end
      replacements.push({
        start: start - prefix.length,
        end: end - prefix.length,
        name,
      })
    },
  })
  const magic = new MagicString(expressionSource)
  for (const replacement of replacements.sort((left, right) => right.start - left.start)) {
    if (replacement.start >= 0)
      magic.overwrite(replacement.start, replacement.end, `scope.${replacement.name}`)
  }
  return {
    code: magic.toString(),
    names: [...new Set(replacements.map((replacement) => replacement.name))],
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Extracts a JSON-literal initializer for a named signal/store/action
 * declaration so the compiled page can serialize it into `data-nx-scope`.
 * Returns undefined when the initializer is not a pure JSON literal.
 */
function extractStaticInitial(source: string, name: string): ScopeCaptureInitial | undefined {
  const compact = source.replace(/\s+/g, ' ')
  const namePattern = escapeRegExp(name)
  const patterns = [
    `(?:const|let|var) ${namePattern} = (?:state|createStore|computed)\\(`,
    `(?:const|let|var) \\[\\s*${namePattern}\\s*,[^\\]]*\\]\\s*=\\s*useState\\(`,
    `(?:const|let|var) \\[\\s*[A-Za-z_$][\\w$]*\\s*,\\s*${namePattern}\\s*\\]\\s*=\\s*useState\\(`,
  ]
  for (const pattern of patterns) {
    const match = new RegExp(pattern).exec(compact)
    if (!match) continue
    const open = match.index + match[0].length - 1
    let depth = 0
    let close = -1
    for (let index = open; index < compact.length; index += 1) {
      const character = compact[index]
      if (character === '(') depth += 1
      else if (character === ')') {
        depth -= 1
        if (depth === 0) {
          close = index
          break
        }
      }
    }
    if (close < 0) continue
    try {
      return JSON.parse(compact.slice(open + 1, close)) as ScopeCaptureInitial
    } catch {
      return undefined
    }
  }
  return undefined
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

function classifyScopeCaptures(source: string, names: readonly string[]): ScopeCapture[] {
  const captures: ScopeCapture[] = []
  const compactSource = source.replace(/\s+/g, ' ')
  for (const name of names) {
    const namePattern = escapeRegExp(name)
    const declares = (candidate: string): boolean =>
      new RegExp(`(?:const|let|var) ${namePattern} = ${candidate}\\(`).test(compactSource)
    const declaresStateTuple =
      new RegExp(`(?:const|let|var) \\[\\s*${namePattern}\\s*,[^\\]]*\\]\\s*=\\s*useState\\(`).test(
        compactSource,
      ) ||
      new RegExp(
        `(?:const|let|var) \\[\\s*[A-Za-z_$][\\w$]*\\s*,\\s*${namePattern}\\s*\\]\\s*=\\s*useState\\(`,
      ).test(compactSource)

    const kind: 'signal' | 'store' | 'action' | undefined = declares('createStore')
      ? 'store'
      : declares('action')
        ? 'action'
        : declares('state') || declares('computed') || declaresStateTuple
          ? 'signal'
          : undefined

    if (kind === 'signal' || kind === 'store') {
      const initial = extractStaticInitial(source, name)
      if (initial === undefined) {
        captures.push({
          name,
          kind: 'unsupported',
          reason: `Capture "${name}" needs a JSON-literal initial value to resume in the browser.`,
        })
        continue
      }
      captures.push({ name, kind, id: `nx:${kind}:${hash(`${name}:${source}`)}`, initial })
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
    if (/^(?:true|false|null|undefined|NaN)$/.test(name)) {
      captures.push({ name, kind: 'value' })
      continue
    }
    captures.push({
      name,
      kind: 'unsupported',
      reason: `Capture "${name}" is not a serializable Nexis signal, store, action, or plain value.`,
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
  return undefined
}

function bindingExpressionIdentifier(expression: AstNode | undefined): string | undefined {
  return expression?.type === 'Identifier' ? astIdentifierName(expression) : undefined
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

function mergeBindingAttributes(code: string): string {
  let merged = code
  let previous = ''
  while (merged !== previous) {
    previous = merged
    merged = merged.replace(
      /data-nx-bind="([^"]+)"(\s+)data-nx-bind="([^"]+)"/g,
      (_match, first: string, spacing: string, second: string) =>
        `data-nx-bind="${first};${second}"${spacing}`,
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
        if (separator < 1) throw new Error(`[NEXIS_CSS] Invalid static style in ${id}.`)
        const rawProperty = entry.slice(0, separator).trim()
        const property = rawProperty.startsWith('--')
          ? rawProperty
          : rawProperty.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
        let value = entry
          .slice(separator + 1)
          .trim()
          .replace(/^['"`]|['"`]$/g, '')
        if (!/^(?:--)?[a-zA-Z][a-zA-Z0-9-]*$/.test(property) || /[;{}<>]/.test(value))
          throw new Error(`[NEXIS_CSS] Unsafe static style in ${id}.`)
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
      `Nexis compiler could not parse ${id}: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

export async function transformNexisSource(
  source: string,
  id: string,
): Promise<NexisTransformResult> {
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
          `[NEXIS_LAZY_BOUNDARY] ${node.name.name} must contain a serializable expression.`,
        )
        return
      }
      const expressionSource = source.slice(expression.start, expression.end)
      const idHash = hash(`${normalizeIdForHash(id)}:${start}:${expressionSource}`)
      const exportName = `handler_${idHash}`
      const fileName = `chunk_${idHash}.js`
      const eventName = node.name.name.slice(2, -1).toLowerCase()
      if (!/^[a-z][a-z0-9-]*$/.test(eventName)) {
        moduleDiagnostics.push(
          `[NEXIS_LAZY_BOUNDARY] ${node.name.name} must use an event name such as onClick$ or onInput$.`,
        )
        return
      }
      chunkSpecs.push({ fileName, exportName, expressionSource })
      attrRanges.push({ start, end, eventName, specIndex: chunkSpecs.length - 1 })
    }

    if (node.type === 'JSXOpeningElement') {
      const opening = node as AstNode & {
        readonly attributes?: readonly AstNode[]
      }
      const attributes = opening.attributes ?? []
      const explicitBindings = attributes.filter((attribute) => {
        const name = attribute.name?.name
        return (
          typeof name === 'string' && /^bind(?:Text|Value|Checked|Disabled|Hidden)\$$/.test(name)
        )
      })
      const addBinding = (
        attribute: AstNode,
        target: DomBindingTarget,
        sourceName: string,
        automatic: boolean,
        removeAttribute: boolean,
      ): void => {
        const capture = classifyScopeCaptures(source, [sourceName])[0]
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
          .replace(/^[A-Z]/, (letter) => letter.toLowerCase()) as DomBindingTarget
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
      const capture = sourceName ? classifyScopeCaptures(source, [sourceName])[0] : undefined
      if (!sourceName && !hasExplicitTextBinding && expression) {
        for (const name of identifierNamesInAst(expression)) {
          const candidate = classifyScopeCaptures(source, [name])[0]
          if (candidate?.kind === 'signal') {
            warnings.push(
              `Automatic binding for ${name} was skipped because the JSX expression is dynamic; use bindText$ for a direct binding.`,
            )
          }
        }
      }
      if (sourceName && capture) {
        if (capture.kind === 'signal' && capture.id && capture.initial !== undefined) {
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

  const secretDiagnostic = findSecretExposure(id, source)
  if (secretDiagnostic)
    moduleDiagnostics.push(`[${secretDiagnostic.code}] ${secretDiagnostic.message}`)
  if (moduleDiagnostics.length > 0) throw new Error(moduleDiagnostics.join('\n'))

  // Route modules may be TypeScript: strip annotations so emitted chunks are
  // always plain JavaScript, regardless of the authoring language.
  const isTypeScript = /\.tsx?$/.test(id)
  const chunks: LazyChunk[] = []
  const capturesBySpec: ScopeCapture[][] = []
  for (const { fileName, exportName, expressionSource } of chunkSpecs) {
    const capturedExpression = captureExpression(expressionSource)
    const captures = classifyScopeCaptures(source, capturedExpression.names)
    capturesBySpec.push(captures)
    scopeCaptures.push(...captures)
    for (const capture of captures) {
      if (capture.kind === 'unsupported')
        warnings.push(capture.reason ?? `Unsupported capture: ${capture.name}`)
    }
    const raw = `export async function ${exportName}({ element, scope = {}, event }) { return (${capturedExpression.code})({ element, event, scope }) }\n`
    const source_ = isTypeScript
      ? (
          await transformWithEsbuild(raw, `${fileName}.ts`, {
            loader: 'ts',
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

  return {
    code: mergeScopeAttributes(mergeBindingAttributes(mergeEventAttributes(magic.toString()))),
    map: magic.generateMap({ hires: true }),
    chunks,
    css: extractStaticCss(source, id),
    scopeCaptures,
    bindings,
    warnings,
  }
}

export function nexis(options: { readonly root?: string } = {}): Plugin {
  const generatedChunks = new Map<string, string>()
  const generatedCss = new Set<string>()
  let hasBindings = false
  return {
    name: 'nexis',
    enforce: 'pre',
    configResolved(config) {
      void options.root
      void config.root
    },
    configureServer(server) {
      // Serve the resumability runtime and lazily extracted handler chunks under
      // stable URLs so interactive routes work identically in dev and production.
      server.middlewares.use((request, response, next) => {
        if (request.method !== 'GET') return next()
        const url = request.url ?? ''
        if (url === '/nexis-bootstrap.js') {
          response.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' })
          response.end(RESUMABILITY_BOOTSTRAP)
          return
        }
        const match = /^\/nexis-chunks\/([A-Za-z0-9_.-]+\.js)$/.exec(url)
        const chunkName = match?.[1]
        if (chunkName !== undefined) {
          const source = generatedChunks.get(chunkName)
          if (source === undefined) {
            response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
            response.end(`Unknown Nexis chunk: ${chunkName}`)
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
      const result = await transformNexisSource(source, id)
      hasBindings ||= result.bindings.length > 0
      for (const chunk of result.chunks) generatedChunks.set(chunk.fileName, chunk.source)
      for (const css of result.css) generatedCss.add(css)
      return { code: result.code, map: result.map }
    },
    handleHotUpdate() {
      // Keep previously emitted chunks available while Vite invalidates modules.
      // The content-addressed filenames prevent stale handlers from colliding with new ones.
      generatedCss.clear()
    },
    generateBundle() {
      for (const [fileName, source] of generatedChunks) {
        this.emitFile({ type: 'asset', fileName: `nexis-chunks/${fileName}`, source })
      }
      if (generatedChunks.size > 0 || hasBindings) {
        this.emitFile({
          type: 'asset',
          fileName: 'nexis-bootstrap.js',
          source: RESUMABILITY_BOOTSTRAP,
        })
      }
      if (hasBindings) {
        this.emitFile({
          type: 'asset',
          fileName: 'nexis-bindings.js',
          source: RESUMABILITY_BINDINGS,
        })
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
