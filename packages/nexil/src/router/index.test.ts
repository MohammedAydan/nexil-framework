import { describe, expect, it } from 'vitest'
import { element } from '../core/index.js'
import {
  composeLayouts,
  Link,
  matchRoute,
  resolveRoute,
  routeFromFile,
  setClientRouteState,
  Slot,
  useLocation,
  useParams,
} from './index'

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

  it('keeps the root index ahead of an optional catch-all', () => {
    const root = routeFromFile('src/routes/index.tsx')
    const fallback = routeFromFile('src/routes/[[...slug]].tsx')
    expect(resolveRoute([fallback, root], '/')?.route).toBe(root)
  })

  it('decodes encoded static segments and handles malformed escapes safely', () => {
    const route = routeFromFile('src/routes/products/red-shoe.tsx')
    expect(matchRoute(route, '/products/red-shoe')).toBeDefined()
    expect(matchRoute(route, '/products/%E0%A4%A')).toBeUndefined()
  })

  it('supports a catch-all before a trailing static segment', () => {
    const route = routeFromFile('src/routes/docs/[...path]/edit.tsx')
    expect(matchRoute(route, '/docs/a/b/edit')?.params).toEqual({ path: ['a', 'b'] })
  })

  it('normalizes Windows-style route file paths', () => {
    expect(routeFromFile('src\\routes\\docs\\index.tsx').pattern).toBe('/docs')
    expect(routeFromFile('src\\routes\\docs\\[slug].tsx').pattern).toBe('/docs/:slug')
  })

  it('rejects traversal, malformed route files, and declaration/test modules', () => {
    expect(() => routeFromFile('src/routes/../server.tsx')).toThrow(/Unsafe/)
    expect(() => routeFromFile('src/routes/[bad!.tsx')).toThrow(/Invalid route segment/)
    expect(() => routeFromFile('src/routes/index.d.ts')).toThrow(/Declaration/)
    expect(() => routeFromFile('src/routes/index.spec.ts')).toThrow(/Declaration/)
  })
})

it('omits route groups from URLs and records nested layouts', () => {
  const route = routeFromFile('src/routes/(dashboard)/settings.tsx')
  expect(route.pattern).toBe('/settings')
  expect(route.layouts).toContain('(dashboard)/_layout.tsx')
})

it('matches URLs while exposing query parameters and hash fragments', () => {
  const route = routeFromFile('src/routes/search.tsx')
  const match = matchRoute(route, '/search?q=nexil&page=2#results')
  expect(match?.query.get('q')).toBe('nexil')
  expect(match?.query.get('page')).toBe('2')
  expect(match?.hash).toBe('results')
})

it('renders safe internal links with prefetch metadata', () => {
  expect(Link({ href: '/docs', prefetch: 'intent', children: 'Docs' })).toMatchObject({
    tag: 'a',
    props: { href: '/docs', 'data-nx-link': 'push', 'data-nx-prefetch': 'intent' },
  })
  expect(
    Link({ href: '/settings', replace: true, scroll: false, transition: false }),
  ).toMatchObject({
    props: {
      href: '/settings',
      'data-nx-link': 'replace',
      'data-nx-scroll': 'false',
      'data-nx-transition': 'false',
    },
  })
  expect(() => Link({ href: 'https://example.com' })).toThrow(/internal/)
})

describe('Nested Layout composition and Slot', () => {
  it('composes nested layouts around child page nodes', () => {
    const rootLayout = ({ children }: { children: any }) =>
      element('div', { class: 'root' }, children)
    const subLayout = ({ children }: { children: any }) =>
      element('main', { class: 'sub' }, children)
    const page = element('h1', {}, 'Hello Page')

    const tree = composeLayouts([rootLayout, subLayout], page) as any
    expect(tree.tag).toBe('div')
    expect(tree.children[0].tag).toBe('main')
    expect(tree.children[0].children[0].tag).toBe('h1')
  })

  it('renders Slot fallback when active child is undefined', () => {
    setClientRouteState({}, undefined)
    const fallback = element('p', {}, 'Fallback Content')
    expect(Slot({ children: fallback })).toBe(fallback)
  })

  it('provides route parameters and location info via hooks', () => {
    setClientRouteState({ slug: 'nexil-guide', tab: 'overview' })
    const params = useParams<{ slug: string; tab: string }>()
    expect(params.slug).toBe('nexil-guide')
    expect(params.tab).toBe('overview')

    const location = useLocation()
    expect(location.pathname).toBeDefined()
  })
})
