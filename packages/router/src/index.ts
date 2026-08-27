import { element } from '@mohammedaydan/core'
import type { Child, ElementNode } from '@mohammedaydan/core'
export { NEXIS_NAVIGATION_RUNTIME } from './navigation.js'

export interface RouteParam {
  readonly name: string
  readonly kind: 'static' | 'dynamic' | 'catch-all' | 'optional-catch-all'
  readonly value?: string
}

export interface RouteRecord {
  readonly file: string
  readonly pattern: string
  readonly params: readonly RouteParam[]
  readonly score: number
  readonly layouts: readonly string[]
}

export interface RouteMatch {
  readonly route: RouteRecord
  readonly params: Readonly<Record<string, string | string[]>>
  readonly query: URLSearchParams
  readonly hash: string
}

export interface LinkProps {
  readonly href: string
  readonly prefetch?: 'intent' | 'viewport' | 'none'
  readonly replace?: boolean
  readonly scroll?: boolean
  readonly transition?: boolean
  readonly children?: Child | readonly Child[]
  readonly [key: string]: unknown
}

/** Render a framework-aware anchor. Prefetch intent/viewport is consumed by the client runtime. */
export function Link({
  href,
  prefetch = 'none',
  replace = false,
  scroll = true,
  transition = true,
  children,
  ...props
}: LinkProps): ElementNode {
  if (!href.startsWith('/') || href.startsWith('//'))
    throw new TypeError('Nexis Link href must be an internal absolute path.')
  const linkChildren: Child[] =
    children === undefined
      ? []
      : Array.isArray(children)
        ? [...(children as readonly Child[])]
        : [children as Child]
  return element(
    'a',
    {
      ...props,
      href,
      'data-nx-link': replace ? 'replace' : 'push',
      ...(prefetch !== 'none' ? { 'data-nx-prefetch': prefetch } : {}),
      ...(scroll ? {} : { 'data-nx-scroll': 'false' }),
      ...(transition ? {} : { 'data-nx-transition': 'false' }),
    },
    ...linkChildren,
  )
}

function normalizeFile(file: string): string[] {
  const normalized = file.replace(/\\/g, '/')
  if (normalized.split('/').includes('..')) throw new TypeError('Unsafe route file path.')
  return normalized
    .replace(/^\.?\//, '')
    .split('/')
    .filter(Boolean)
}

function decodeSegment(value: string): string | undefined {
  try {
    return decodeURIComponent(value)
  } catch {
    return undefined
  }
}

export function routeFromFile(file: string): RouteRecord {
  let segments = normalizeFile(file)
  if (/(?:^|\/)(?:[^/]+\.)?(?:d|spec|test)\.(?:tsx|ts|jsx|js)$/.test(segments.at(-1) ?? ''))
    throw new TypeError('Declaration and test files cannot define routes.')
  const routesIndex = segments.indexOf('routes')
  if (routesIndex >= 0) segments = segments.slice(routesIndex + 1)
  if (segments.length === 0) throw new TypeError('Route file cannot be empty.')
  const filename = segments.pop() as string
  const stem = filename.replace(/\.(tsx|ts|jsx|js)$/, '')
  if (!stem || stem === 'layout' || stem === '_layout')
    throw new TypeError('A route file must be a non-layout module.')

  const pathSegments = segments.filter((segment) => !/^\(.+\)$/.test(segment))
  const routeSegments = [...pathSegments, stem === 'index' ? '' : stem]
  const layouts = segments.map((_, index, values) =>
    [...values.slice(0, index + 1), '_layout.tsx'].join('/'),
  )
  const params: RouteParam[] = []
  const patternParts = routeSegments.flatMap((segment) => {
    if (!segment) return []
    if (/^\[\.\.\.([\w-]+)\]$/.test(segment)) {
      const name = segment.slice(4, -1)
      params.push({ name, kind: 'catch-all' })
      return [`:${name}*`]
    }
    if (/^\[\[\.\.\.([\w-]+)\]\]$/.test(segment)) {
      const name = segment.slice(5, -2)
      params.push({ name, kind: 'optional-catch-all' })
      return [`:${name}*?`]
    }
    if (/^\[([\w-]+)\]$/.test(segment)) {
      const name = segment.slice(1, -1)
      params.push({ name, kind: 'dynamic' })
      return [`:${name}`]
    }
    if (segment.includes('[') || segment.includes(']'))
      throw new TypeError(`Invalid route segment: ${segment}`)
    params.push({ name: segment, kind: 'static', value: segment })
    return [segment]
  })

  return {
    file,
    pattern: `/${patternParts.join('/')}` || '/',
    params,
    layouts,
    score: params.reduce(
      (total, param) =>
        total +
        (param.kind === 'static'
          ? 20
          : param.kind === 'dynamic'
            ? 10
            : param.kind === 'catch-all'
              ? 2
              : 1),
      patternParts.length === 0 ? 100 : 0,
    ),
  }
}

function splitUrl(input: string | URL): { pathname: string; query: URLSearchParams; hash: string } {
  const url = input instanceof URL ? input : new URL(input, 'http://nexis.invalid')
  return { pathname: url.pathname, query: url.searchParams, hash: url.hash.slice(1) }
}

export function matchRoute(route: RouteRecord, input: string | URL): RouteMatch | undefined {
  const { pathname, query, hash } = splitUrl(input)
  const pathSegments = pathname
    .replace(/^\/+|\/+$/g, '')
    .split('/')
    .filter(Boolean)
  const routeSegments = route.pattern
    .replace(/^\/+|\/+$/g, '')
    .split('/')
    .filter(Boolean)

  function matchAt(
    routeIndex: number,
    pathIndex: number,
    params: Record<string, string | string[]>,
  ): Record<string, string | string[]> | undefined {
    if (routeIndex === routeSegments.length)
      return pathIndex === pathSegments.length ? params : undefined
    const segment = routeSegments[routeIndex]
    if (!segment) return matchAt(routeIndex + 1, pathIndex, params)

    if (segment.endsWith('*?') || segment.endsWith('*')) {
      const name = segment.slice(1, segment.endsWith('*?') ? -2 : -1)
      const minimum = segment.endsWith('*?') ? pathIndex : pathIndex + 1
      for (let end = pathSegments.length; end >= minimum; end -= 1) {
        const values = pathSegments.slice(pathIndex, end).map(decodeSegment)
        if (values.some((value) => value === undefined)) continue
        const next = { ...params, [name]: values as string[] }
        const matched = matchAt(routeIndex + 1, end, next)
        if (matched) return matched
      }
      return undefined
    }

    const value = pathSegments[pathIndex]
    if (value === undefined) return undefined
    const decoded = decodeSegment(value)
    if (decoded === undefined) return undefined
    if (segment.startsWith(':')) {
      return matchAt(routeIndex + 1, pathIndex + 1, {
        ...params,
        [segment.slice(1)]: decoded,
      })
    }
    if (segment !== decoded) return undefined
    return matchAt(routeIndex + 1, pathIndex + 1, params)
  }

  const params = matchAt(0, 0, {})
  return params ? { route, params, query, hash } : undefined
}

export function resolveRoute(
  routes: readonly RouteRecord[],
  pathname: string | URL,
): RouteMatch | undefined {
  const sorted = [...routes].sort(
    (left, right) => right.score - left.score || right.pattern.length - left.pattern.length,
  )
  for (const route of sorted) {
    const match = matchRoute(route, pathname)
    if (match) return match
  }
  return undefined
}
