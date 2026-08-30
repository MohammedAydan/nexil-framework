import type {
  Child,
  ContextScope,
  ElementNode,
  RenderNode,
  SuspenseNode,
  TextNode,
} from '../core/index.js'
import { getActiveScope, runWithScope } from '../core/index.js'

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

const BOOLEAN_ATTRIBUTES = new Set([
  'allowfullscreen',
  'async',
  'autofocus',
  'autoplay',
  'checked',
  'controls',
  'default',
  'defer',
  'disabled',
  'formnovalidate',
  'hidden',
  'ismap',
  'loop',
  'multiple',
  'muted',
  'nomodule',
  'novalidate',
  'open',
  'playsinline',
  'readonly',
  'required',
  'reversed',
  'selected',
])

const SAFE_ATTRIBUTE = /^[a-zA-Z_:][a-zA-Z0-9:._-]*$/
const EVENT_ATTRIBUTE = /^on[A-Z]/
const RESUMABLE_EVENT_ATTRIBUTE = /^on[A-Z][a-zA-Z0-9]*\$$/

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
  autoCapitalize: 'autocapitalize',
  inputMode: 'inputmode',
  enterKeyHint: 'enterkeyhint',
  formAction: 'formaction',
  formEncType: 'formenctype',
  formMethod: 'formmethod',
  formNoValidate: 'formnovalidate',
  formTarget: 'formtarget',
  popoverTarget: 'popovertarget',
  popoverTargetAction: 'popovertargetaction',
  srcDoc: 'srcdoc',
  allowFullScreen: 'allowfullscreen',
  useMap: 'usemap',
  isMap: 'ismap',
  fetchPriority: 'fetchpriority',
  acceptCharset: 'acceptcharset',
  noModule: 'nomodule',
  playsInline: 'playsinline',
  disablePictureInPicture: 'disablepictureinpicture',
  disableRemotePlayback: 'disableremoteplayback',
  crossOrigin: 'crossorigin',
  autoPlay: 'autoplay',
  referrerPolicy: 'referrerpolicy',
  dateTime: 'datetime',
  // SVG attribute aliases
  strokeWidth: 'stroke-width',
  strokeLinecap: 'stroke-linecap',
  strokeLinejoin: 'stroke-linejoin',
  strokeMiterlimit: 'stroke-miterlimit',
  strokeDasharray: 'stroke-dasharray',
  strokeDashoffset: 'stroke-dashoffset',
  strokeOpacity: 'stroke-opacity',
  fillOpacity: 'fill-opacity',
  fillRule: 'fill-rule',
  clipPath: 'clip-path',
  clipRule: 'clip-rule',
  stopColor: 'stop-color',
  stopOpacity: 'stop-opacity',
  transformOrigin: 'transform-origin',
  textAnchor: 'text-anchor',
  fontSize: 'font-size',
  fontFamily: 'font-family',
  fontWeight: 'font-weight',
  letterSpacing: 'letter-spacing',
  dominantBaseline: 'dominant-baseline',
  gradientTransform: 'gradienttransform',
  gradientUnits: 'gradientunits',
  patternTransform: 'patterntransform',
  patternUnits: 'patternunits',
  patternContentUnits: 'patterncontentunits',
  spreadMethod: 'spreadmethod',
  markerWidth: 'markerwidth',
  markerHeight: 'markerheight',
  markerUnits: 'markerunits',
  refX: 'refx',
  refY: 'refy',
  preserveAspectRatio: 'preserveaspectratio',
  xlinkHref: 'xlink:href',
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

/**
 * Recursively unwrap reactive signals, getters, and Signal objects to their primitive values for SSR.
 */
export function unwrapSignalValue(value: unknown): unknown {
  if (value === null || value === undefined) return value
  if (typeof value === 'function') {
    try {
      return unwrapSignalValue((value as () => unknown)())
    } catch {
      return value
    }
  }
  if (typeof value === 'object') {
    if ('get' in value && typeof (value as { get?: unknown }).get === 'function') {
      try {
        return unwrapSignalValue((value as { get: () => unknown }).get())
      } catch {
        // Fallback
      }
    }
    if (
      'value' in value &&
      !Array.isArray(value) &&
      Object.getPrototypeOf(value) !== Object.prototype
    ) {
      return unwrapSignalValue((value as { value: unknown }).value)
    }
  }
  return value
}

/**
 * Normalizes class declarations (strings, arrays, and boolean object maps) into a space-separated string.
 */
export function normalizeClass(value: unknown): string {
  const unwrapped = unwrapSignalValue(value)
  if (!unwrapped && unwrapped !== 0) return ''
  if (typeof unwrapped === 'string' || typeof unwrapped === 'number') {
    return String(unwrapped).trim()
  }
  if (Array.isArray(unwrapped)) {
    return unwrapped
      .map((item) => normalizeClass(item))
      .filter(Boolean)
      .join(' ')
  }
  if (typeof unwrapped === 'object') {
    return Object.entries(unwrapped as Record<string, unknown>)
      .filter(([, v]) => {
        const val = unwrapSignalValue(v)
        return Boolean(val)
      })
      .map(([k]) => k.trim())
      .filter(Boolean)
      .join(' ')
  }
  return ''
}

/**
 * Serializes CSS style declarations (string or object) into inline style CSS syntax.
 */
export function renderStyle(value: unknown): string | undefined {
  const unwrapped = unwrapSignalValue(value)
  if (typeof unwrapped === 'string') {
    const trimmed = unwrapped.trim()
    return trimmed || undefined
  }
  if (!unwrapped || typeof unwrapped !== 'object' || Array.isArray(unwrapped)) return undefined
  const declarations = Object.entries(unwrapped as Record<string, unknown>)
    .map(([property, declaration]) => {
      const decl = unwrapSignalValue(declaration)
      if (decl === undefined || decl === null || decl === false || decl === '') return null
      const cssProperty = kebabCase(property)
      const cssValue = formatStyleValue(property, decl)
      if (/[;{}<>]/.test(cssValue)) return null
      return `${cssProperty}:${cssValue};`
    })
    .filter(Boolean)
    .join('')
  return declarations || undefined
}

/**
 * Escapes unsafe HTML characters to prevent XSS attacks.
 */
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
    throw new TypeError('Nexil binding scope id must be a stable signal or store id.')
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
    throw new TypeError('Nexil binding target is not supported.')
  return `data-nx-bind="${escapeHtml(`${scopeId}#${target}`)}"`
}

/**
 * Compiles a single HTML attribute to its string representation.
 */
export function renderAttribute(rawName: string, rawValue: unknown): string {
  // Resumable event handlers: onClick$, onInput$, etc.
  if (RESUMABLE_EVENT_ATTRIBUTE.test(rawName)) {
    const eventName = rawName.slice(2, -1).toLowerCase()
    if (rawValue === false || rawValue === null || rawValue === undefined) return ''
    if (typeof rawValue === 'string') {
      return ` data-nx-on-${eventName}="${escapeHtml(rawValue)}"`
    }
    return ` data-nx-on-${eventName}="true"`
  }

  // Standard in-memory event handlers (onClick, onInput, etc.) -> omitted from SSR
  if (EVENT_ATTRIBUTE.test(rawName)) {
    return ''
  }

  const name = normalizeAttributeName(rawName)
  if (!SAFE_ATTRIBUTE.test(name)) return ''

  if (name === 'data-nx-bind') {
    const serialized = String(unwrapSignalValue(rawValue))
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

  if (name === 'class') {
    const classStr = normalizeClass(rawValue)
    return classStr ? ` class="${escapeHtml(classStr)}"` : ''
  }

  if (name === 'style') {
    const styleStr = renderStyle(rawValue)
    return styleStr !== undefined ? ` style="${escapeHtml(styleStr)}"` : ''
  }

  const value = unwrapSignalValue(rawValue)
  if (value === false || value === null || value === undefined) return ''

  if (['href', 'src', 'action', 'formaction', 'poster', 'cite'].includes(name)) {
    if (!isSafeUrl(String(value))) return ''
  }

  if (BOOLEAN_ATTRIBUTES.has(name)) {
    if (value === true || value === 'true' || value === '') return ` ${name}`
    return ''
  }

  if (value === true) return ` ${name}`

  return ` ${name}="${escapeHtml(String(value))}"`
}

function renderText(node: TextNode): string {
  return escapeHtml(node.value)
}

export function renderElementOpening(node: ElementNode): string {
  const props = node.props
  const attributes: string[] = []

  let mergedClass: unknown = undefined
  if ('class' in props && 'className' in props) {
    mergedClass = [props.class, props.className]
  } else if ('class' in props) {
    mergedClass = props.class
  } else if ('className' in props) {
    mergedClass = props.className
  }

  for (const [rawName, rawValue] of Object.entries(props)) {
    if (rawName === 'className') {
      if ('class' in props) continue
      const rendered = renderAttribute('class', mergedClass)
      if (rendered) attributes.push(rendered)
      continue
    }
    if (rawName === 'class') {
      const rendered = renderAttribute('class', mergedClass)
      if (rendered) attributes.push(rendered)
      continue
    }
    const rendered = renderAttribute(rawName, rawValue)
    if (rendered) attributes.push(rendered)
  }

  return `<${node.tag}${attributes.join('')}>`
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
  if (typeof child === 'function') return renderChild((child as () => Child)())
  if (child === null || child === undefined || typeof child === 'boolean') return ''
  if (Array.isArray(child)) return child.map(renderChild).join('')
  if (typeof child === 'string' || typeof child === 'number') return escapeHtml(String(child))
  if (typeof (child as unknown as { then?: unknown }).then === 'function')
    throw new TypeError('Async child received by renderToString; use renderToStringAsync.')
  return renderNode(child)
}

export async function renderChildAsync(child: Child | Promise<Child>): Promise<string> {
  if (typeof child === 'function') return renderChildAsync((child as unknown as () => Child)())
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

/**
 * Synchronously renders a component / AST tree to an HTML string.
 * Preserves or binds active ContextScope via Node.js AsyncLocalStorage.
 */
export function renderToString(root: Child, scope?: ContextScope): string {
  const activeScope = scope ?? getActiveScope()
  if (activeScope) {
    return runWithScope(activeScope, () => renderChild(root))
  }
  return renderChild(root)
}

/**
 * Asynchronously renders a component / AST tree with Suspense/Promises to an HTML string.
 * Preserves or binds active ContextScope via Node.js AsyncLocalStorage.
 */
export async function renderToStringAsync(
  root: Child | Promise<Child>,
  scope?: ContextScope,
): Promise<string> {
  const activeScope = scope ?? getActiveScope()
  if (activeScope) {
    return runWithScope(activeScope, () => renderChildAsync(root))
  }
  return renderChildAsync(root)
}

export type { RenderCache, RenderMode, RenderOutput, RouteRenderInput } from './modes.js'
export { renderRoute } from './modes.js'
export { renderToStream, renderToAsyncIterable } from './stream.js'
export type { RenderStreamOptions } from './stream.js'
