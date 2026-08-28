import type { Child, ElementNode, RenderNode, SuspenseNode, TextNode } from '@nexis/core'

const VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
])

const SAFE_ATTRIBUTE = /^[a-zA-Z_:][a-zA-Z0-9:._-]*$/
const EVENT_ATTRIBUTE = /^on[A-Z]/
const UNITLESS_PROPERTIES = new Set([
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

const ATTRIBUTE_ALIASES: Readonly<Record<string, string>> = {
  className: 'class',
  htmlFor: 'for',
  tabIndex: 'tabindex',
  readOnly: 'readonly',
  srcSet: 'srcset',
  colSpan: 'colspan',
  rowSpan: 'rowspan',
  autoComplete: 'autocomplete',
  autoFocus: 'autofocus',
  contentEditable: 'contenteditable',
  spellCheck: 'spellcheck',
}

function kebabCase(property: string): string {
  return property.startsWith('--')
    ? property
    : property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
}

function formatStyleValue(property: string, value: unknown): string {
  if (typeof value === 'number' && value !== 0 && !UNITLESS_PROPERTIES.has(property))
    return `${value}px`
  return String(value)
}

function normalizeAttributeName(name: string): string {
  if (name.startsWith('aria-') || name.startsWith('data-')) return name
  return ATTRIBUTE_ALIASES[name] ?? name
}

function renderStyle(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const declarations = Object.entries(value as Record<string, unknown>)
    .filter(
      ([, declaration]) =>
        declaration !== undefined && declaration !== null && declaration !== false,
    )
    .map(([property, declaration]) => {
      const cssProperty = kebabCase(property)
      const cssValue = formatStyleValue(property, declaration)
      if (/[;{}<>]/.test(cssValue)) return ''
      return `${cssProperty}:${cssValue};`
    })
    .join('')
  return declarations || undefined
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case '&':
        return '&amp;'
      case '<':
        return '&lt;'
      case '>':
        return '&gt;'
      case '"':
        return '&quot;'
      case "'":
        return '&#39;'
      default:
        return character
    }
  })
}

function isSafeUrl(value: string): boolean {
  const trimmed = value.trim()
  if (/^(?:javascript|vbscript|data):/i.test(trimmed)) return false
  if (trimmed.startsWith('//')) return false
  if (
    trimmed.startsWith('/') ||
    trimmed.startsWith('#') ||
    trimmed.startsWith('./') ||
    trimmed.startsWith('../')
  )
    return true
  try {
    return ['http:', 'https:', 'mailto:', 'tel:'].includes(new URL(trimmed).protocol)
  } catch {
    return false
  }
}

export function renderBindingMarker(scopeId: string, target: DomBindingTarget): string {
  if (!/^nx:(?:signal|store):[A-Za-z0-9_-]+$/.test(scopeId))
    throw new TypeError('Nexis binding scope id must be a stable signal or store id.')
  if (
    !(
      [
        'text',
        'value',
        'checked',
        'disabled',
        'hidden',
        'class',
        'style',
        'href',
        'src',
      ] as string[]
    ).includes(target) &&
    !/^aria-[a-z][a-z0-9-]*$/.test(target)
  )
    throw new TypeError('Nexis binding target is not supported.')
  return `data-nx-bind="${escapeHtml(`${scopeId}#${target}`)}"`
}

function renderAttribute(rawName: string, value: unknown): string {
  const name = normalizeAttributeName(rawName)
  if (!SAFE_ATTRIBUTE.test(name) || EVENT_ATTRIBUTE.test(name)) return ''
  if (name === 'data-nx-bind') {
    const serialized = String(value)
    if (
      !serialized.split(';').every((part) => {
        const separator = part.lastIndexOf('#')
        return (
          separator > 0 &&
          /^nx:(?:signal|store):[A-Za-z0-9_-]+$/.test(part.slice(0, separator)) &&
          ((
            [
              'text',
              'value',
              'checked',
              'disabled',
              'hidden',
              'class',
              'style',
              'href',
              'src',
            ] as string[]
          ).includes(part.slice(separator + 1)) ||
            /^aria-[a-z][a-z0-9-]*$/.test(part.slice(separator + 1)))
        )
      })
    )
      return ''
    return ` data-nx-bind="${escapeHtml(serialized)}"`
  }
  if (value === false || value === null || value === undefined) return ''
  if (name === 'style') {
    const style = renderStyle(value)
    return style === undefined ? '' : ` style="${escapeHtml(style)}"`
  }
  if (['href', 'src', 'action', 'formaction', 'poster', 'cite'].includes(name)) {
    if (!isSafeUrl(String(value))) return ''
  }
  if (value === true) return ` ${name}`
  return ` ${name}="${escapeHtml(String(value))}"`
}

function renderText(node: TextNode): string {
  return escapeHtml(node.value)
}

export function renderElementOpening(node: ElementNode): string {
  const attributes = Object.entries(node.props)
    .map(([name, value]) => renderAttribute(name, value))
    .join('')
  return `<${node.tag}${attributes}>`
}

export function renderElementClosing(node: ElementNode): string {
  return `</${node.tag}>`
}

export function isVoidElement(node: ElementNode): boolean {
  return VOID_ELEMENTS.has(node.tag)
}

function renderElement(node: ElementNode): string {
  const opening = renderElementOpening(node)
  if (isVoidElement(node)) return opening
  return `${opening}${node.children.map(renderChild).join('')}${renderElementClosing(node)}`
}

function renderSuspenseFallback(node: SuspenseNode): string {
  return `<span data-nx-suspense="${escapeHtml(node.id)}">${renderChild(node.fallback)}</span>`
}

function renderNode(node: RenderNode): string {
  if (node.kind === 'text') return renderText(node)
  if (node.kind === 'element') return renderElement(node)
  if (node.kind === 'suspense') return renderSuspenseFallback(node)
  throw new TypeError('Unsupported render node.')
}

export function renderChild(child: Child): string {
  if (child === null || child === undefined || typeof child === 'boolean') return ''
  if (Array.isArray(child)) return child.map(renderChild).join('')
  if (typeof child === 'string' || typeof child === 'number') return escapeHtml(String(child))
  if (typeof (child as unknown as { then?: unknown }).then === 'function')
    throw new TypeError('Async child received by renderToString; use renderToStringAsync.')
  return renderNode(child)
}

export async function renderChildAsync(child: Child | Promise<Child>): Promise<string> {
  const resolved = await child
  if (Array.isArray(resolved)) return (await Promise.all(resolved.map(renderChildAsync))).join('')
  if (resolved && typeof resolved === 'object' && 'then' in resolved)
    return renderChildAsync(resolved as unknown as Promise<Child>)
  if (
    resolved &&
    typeof resolved === 'object' &&
    'kind' in resolved &&
    resolved.kind === 'suspense'
  )
    return renderChildAsync(resolved.content)
  return renderChild(resolved)
}

export function renderToString(root: Child): string {
  return renderChild(root)
}

export async function renderToStringAsync(root: Child | Promise<Child>): Promise<string> {
  return renderChildAsync(root)
}

export type { RenderCache, RenderMode, RenderOutput, RouteRenderInput } from './modes.js'
export { renderRoute } from './modes.js'
export { renderToStream } from './stream.js'
