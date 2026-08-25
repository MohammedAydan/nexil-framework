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
}

export interface RouteMatch {
  readonly route: RouteRecord
  readonly params: Readonly<Record<string, string | string[]>>
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
  if (/\.(?:d|spec|test)\.(?:tsx|ts|jsx|js)$/.test(segments.at(-1) ?? ''))
    throw new TypeError('Declaration and test files cannot define routes.')
  const routesIndex = segments.indexOf('routes')
  if (routesIndex >= 0) segments = segments.slice(routesIndex + 1)
  if (segments.length === 0) throw new TypeError('Route file cannot be empty.')
  const filename = segments.pop() as string
  const stem = filename.replace(/\.(tsx|ts|jsx|js)$/, '')
  if (!stem || stem === 'layout') throw new TypeError('A route file must be a non-layout module.')
  segments.push(stem === 'index' ? '' : stem)

  const params: RouteParam[] = []
  const patternParts = segments.flatMap((segment) => {
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

export function matchRoute(route: RouteRecord, pathname: string): RouteMatch | undefined {
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
  return params ? { route, params } : undefined
}

export function resolveRoute(
  routes: readonly RouteRecord[],
  pathname: string,
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
