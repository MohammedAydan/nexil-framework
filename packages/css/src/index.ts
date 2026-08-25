import { twMerge } from 'tailwind-merge'

export type StyleValue = string | number
export type StyleDeclaration = Readonly<Record<string, StyleValue | null | undefined>>

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

export interface ExtractedStyle {
  readonly className: string
  readonly cssText: string
}

export function extractStyle(style: StyleDeclaration, prefix = 'nx'): ExtractedStyle {
  const declarations = Object.entries(style)
    .filter((entry): entry is [string, StyleValue] => entry[1] !== undefined && entry[1] !== null)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([property, value]) => {
      const cssValue = formatValue(property, value)
      if (/[;{}<>]/.test(cssValue)) throw new TypeError(`Unsafe CSS value for ${property}.`)
      return `${kebabCase(property)}:${cssValue};`
    })
    .join('')
  const className = `${prefix}-${hash(declarations)}`
  return { className, cssText: `.${className}{${declarations}}` }
}
