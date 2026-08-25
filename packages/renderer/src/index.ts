import type { Child, ElementNode, RenderNode, TextNode } from '@mohammedaydan/core'

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
const EVENT_ATTRIBUTE = /^(?:on|on[a-z])/i

function kebabCase(property: string): string {
  return property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
}

function normalizeAttributeName(name: string): string {
  if (name === 'className') return 'class'
  if (name === 'htmlFor') return 'for'
  if (name.startsWith('aria-') || name.startsWith('data-')) return name
  return name
}

function renderStyle(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const declarations = Object.entries(value as Record<string, unknown>)
    .filter(
      ([, declaration]) =>
        declaration !== undefined && declaration !== null && declaration !== false,
    )
    .map(([property, declaration]) => `${kebabCase(property)}:${String(declaration)};`)
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

function renderAttribute(rawName: string, value: unknown): string {
  const name = normalizeAttributeName(rawName)
  if (!SAFE_ATTRIBUTE.test(name) || EVENT_ATTRIBUTE.test(name)) return ''
  if (value === false || value === null || value === undefined) return ''
  if (name === 'style') {
    const style = renderStyle(value)
    return style === undefined ? '' : ` style="${escapeHtml(style)}"`
  }
  if (value === true) return ` ${name}`
  return ` ${name}="${escapeHtml(String(value))}"`
}

function renderText(node: TextNode): string {
  return escapeHtml(node.value)
}

function renderElement(node: ElementNode): string {
  const attributes = Object.entries(node.props)
    .map(([name, value]) => renderAttribute(name, value))
    .join('')
  const opening = `<${node.tag}${attributes}>`
  if (VOID_ELEMENTS.has(node.tag)) return opening
  return `${opening}${node.children.map(renderChild).join('')}</${node.tag}>`
}

function renderNode(node: RenderNode): string {
  return node.kind === 'text' ? renderText(node) : renderElement(node)
}

export function renderChild(child: Child): string {
  if (child === null || child === undefined || typeof child === 'boolean') return ''
  if (Array.isArray(child)) return child.map(renderChild).join('')
  if (typeof child === 'string' || typeof child === 'number') return escapeHtml(String(child))
  return renderNode(child)
}

export function renderToString(root: Child): string {
  return renderChild(root)
}

export type { RenderCache, RenderMode, RenderOutput, RouteRenderInput } from './modes.js'
export { renderRoute } from './modes.js'
export { renderToStream } from './stream.js'
