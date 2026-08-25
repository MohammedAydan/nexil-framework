import { twMerge } from 'tailwind-merge'

export type StyleValue = string | number
export type StyleDeclaration = Readonly<Record<string, StyleValue | undefined>>

export type ClassValue =
  | string
  | false
  | null
  | undefined
  | Readonly<Record<string, boolean | null | undefined>>
  | readonly ClassValue[]

function flattenClasses(value: ClassValue): string[] {
  if (typeof value === 'string') return value.trim() ? [value.trim()] : []
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

function kebabCase(property: string): string {
  return property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
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
    .filter((entry): entry is [string, StyleValue] => entry[1] !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([property, value]) => `${kebabCase(property)}:${value};`)
    .join('')
  const className = `${prefix}-${hash(declarations)}`
  return { className, cssText: `.${className}{${declarations}}` }
}
