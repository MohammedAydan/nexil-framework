import type { Child, ElementNode, RenderNode, TextNode } from '@nexis/core'

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

function renderAttribute(name: string, value: unknown): string {
  if (!SAFE_ATTRIBUTE.test(name) || name.toLowerCase().startsWith('on')) return ''
  if (value === false || value === null || value === undefined) return ''
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
