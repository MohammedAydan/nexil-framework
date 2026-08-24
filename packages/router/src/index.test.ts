import { describe, expect, it } from 'vitest'
import { matchRoute, resolveRoute, routeFromFile } from './index'

describe('routeFromFile and matching', () => {
  it('creates a root route and matches static paths', () => {
    const route = routeFromFile('src/routes/index.tsx')
    expect(route.pattern).toBe('/')
    expect(matchRoute(route, '/')?.params).toEqual({})
  })

  it('matches decoded dynamic parameters', () => {
    const route = routeFromFile('src/routes/products/[slug].tsx')
    expect(matchRoute(route, '/products/red%20shoe')?.params).toEqual({ slug: 'red shoe' })
  })

  it('matches required and optional catch-all routes', () => {
    const required = routeFromFile('src/routes/docs/[...path].tsx')
    const optional = routeFromFile('src/routes/docs/[[...path]].tsx')
    expect(matchRoute(required, '/docs/a/b')?.params).toEqual({ path: ['a', 'b'] })
    expect(matchRoute(required, '/docs')).toBeUndefined()
    expect(matchRoute(optional, '/docs')?.params).toEqual({ path: [] })
  })

  it('prefers static routes over dynamic routes', () => {
    const staticRoute = routeFromFile('src/routes/products/featured.tsx')
    const dynamicRoute = routeFromFile('src/routes/products/[slug].tsx')
    expect(resolveRoute([dynamicRoute, staticRoute], '/products/featured')?.route).toBe(staticRoute)
  })

  it('rejects traversal and malformed route files', () => {
    expect(() => routeFromFile('src/routes/../server.tsx')).toThrow(/Unsafe/)
    expect(() => routeFromFile('src/routes/[bad!.tsx')).toThrow(/Invalid route segment/)
  })
})
