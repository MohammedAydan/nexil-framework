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
  if (file.includes('\\') || file.split('/').includes('..')) throw new TypeError('Unsafe route file path.')
  return file.replace(/^\.?\//, '').split('/').filter(Boolean)
}

export function routeFromFile(file: string): RouteRecord {
  const segments = normalizeFile(file)
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
    if (segment.includes('[') || segment.includes(']')) throw new TypeError(`Invalid route segment: ${segment}`)
    params.push({ name: segment, kind: 'static' })
    return [segment]
  })

  return {
    file,
    pattern: `/${patternParts.join('/')}` || '/',
    params,
    score: params.reduce((total, param) => total + (param.kind === 'static' ? 10 : param.kind === 'dynamic' ? 5 : 1), 0),
  }
}

export function matchRoute(route: RouteRecord, pathname: string): RouteMatch | undefined {
  const pathSegments = pathname.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean)
  const routeSegments = route.pattern.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean)
  const params: Record<string, string | string[]> = {}
  let pathIndex = 0

  for (let index = 0; index < routeSegments.length; index += 1) {
    const segment = routeSegments[index]
    if (!segment) continue
    if (segment.endsWith('*?')) {
      params[segment.slice(1, -2)] = pathSegments.slice(pathIndex)
      pathIndex = pathSegments.length
      continue
    }
    if (segment.endsWith('*')) {
      if (pathIndex === pathSegments.length) return undefined
      params[segment.slice(1, -1)] = pathSegments.slice(pathIndex)
      pathIndex = pathSegments.length
      continue
    }
    const value = pathSegments[pathIndex]
    if (!value) return undefined
    if (segment.startsWith(':')) params[segment.slice(1)] = decodeURIComponent(value)
    else if (segment !== value) return undefined
    pathIndex += 1
  }

  if (pathIndex !== pathSegments.length) return undefined
  return { route, params }
}

export function resolveRoute(routes: readonly RouteRecord[], pathname: string): RouteMatch | undefined {
  return [...routes]
    .sort((left, right) => right.score - left.score || right.pattern.length - left.pattern.length)
    .map((route) => matchRoute(route, pathname))
    .find((match): match is RouteMatch => match !== undefined)
}
