import { twMerge } from 'tailwind-merge'

export type StyleValue = string | number
export interface StyleDeclaration {
  readonly [property: string]: StyleValue | null | undefined | StyleDeclaration
}

export type ClassValue =
  | string
  | number
  | false
  | null
  | undefined
  | Readonly<Record<string, boolean | null | undefined>>
  | readonly ClassValue[]

function flattenClasses(value: ClassValue): string[] {
  if (typeof value === 'string' || typeof value === 'number') return [String(value)]
  if (Array.isArray(value)) return value.flatMap(flattenClasses)
  if (!value || typeof value !== 'object') return []
  return Object.entries(value)
    .filter(([, enabled]) => Boolean(enabled))
    .map(([name]) => name)
}

/** Merge conditional Tailwind classes while preserving the last intentional utility. */
export function cx(...values: ClassValue[]): string {
  return twMerge(flattenClasses(values))
}

/** Familiar alias for teams that use the cn naming convention. */
export const cn = cx

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

const BREAKPOINTS: Readonly<Record<string, string>> = {
  '@sm': '640px',
  '@md': '768px',
  '@lg': '1024px',
  '@xl': '1280px',
}

function kebabCase(property: string): string {
  return property.startsWith('--')
    ? property
    : property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
}

function formatValue(property: string, value: StyleValue): string {
  if (typeof value === 'number' && value !== 0 && !UNITLESS_PROPERTIES.has(property))
    return `${value}px`
  return String(value)
}

function hash(value: string): string {
  let result = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index)
    result = Math.imul(result, 16777619)
  }
  return (result >>> 0).toString(36)
}

function serializeDeclarations(style: StyleDeclaration): string {
  return Object.entries(style)
    .filter(
      (entry): entry is [string, StyleValue] =>
        entry[1] !== undefined && entry[1] !== null && typeof entry[1] !== 'object',
    )
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([property, value]) => {
      const cssValue = formatValue(property, value)
      if (/[;{}<>]/.test(cssValue)) throw new TypeError(`Unsafe CSS value for ${property}.`)
      return `${kebabCase(property)}:${cssValue};`
    })
    .join('')
}

export interface ExtractedStyle {
  readonly className: string
  readonly cssText: string
}

export function extractStyle(style: StyleDeclaration, prefix = 'nx'): ExtractedStyle {
  const base = serializeDeclarations(style)
  const nested = Object.entries(style)
    .filter(([, value]) => value && typeof value === 'object' && !Array.isArray(value))
    .map(([selector, value]) => {
      const declarations = serializeDeclarations(value as StyleDeclaration)
      if (selector.startsWith(':')) return { media: undefined, selector, declarations }
      if (BREAKPOINTS[selector]) return { media: BREAKPOINTS[selector], selector: '', declarations }
      throw new TypeError(`Unsupported nested CSS selector: ${selector}`)
    })
  const className = `${prefix}-${hash(`${base}${JSON.stringify(nested)}`)}`
  const rules = [`.${className}{${base}}`]
  for (const rule of nested) {
    if (!rule.declarations) continue
    if (rule.media)
      rules.push(`@media (min-width:${rule.media}){.${className}{${rule.declarations}}}`)
    else rules.push(`.${className}${rule.selector}{${rule.declarations}}`)
  }
  return { className, cssText: rules.join('') }
}

export interface CssTemplateResult extends ExtractedStyle {
  toString(): string
}

/** Create a deterministic extracted class from a CSS tagged template. */
export function css(
  strings: TemplateStringsArray,
  ...values: readonly unknown[]
): CssTemplateResult {
  const source = strings.reduce(
    (result, part, index) =>
      `${result}${part}${index < values.length ? String(values[index]) : ''}`,
    '',
  )
  if (/[<>]/.test(source)) throw new TypeError('Unsafe CSS template content.')
  const className = `nx-${hash(source)}`
  const cssText = `.${className}{${source.trim()}}`
  return { className, cssText, toString: () => className }
}
