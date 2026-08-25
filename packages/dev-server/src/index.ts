import { readFile, readdir } from 'node:fs/promises'
import { join, relative } from 'node:path'
import type { Plugin } from 'vite'
import { renderToString } from '@mohammedaydan/renderer'
import { renderHead } from '@mohammedaydan/seo'
import { routeFromFile, resolveRoute, matchRoute } from '@mohammedaydan/router'
import type { NexisHandler } from '@mohammedaydan/adapters'

function injectStylesheetLink(template: string, href: string): string {
  const link = `<link rel="stylesheet" href="${href}">`
  if (template.includes(`href="${href}"`) || template.includes(`href='${href}'`)) return template
  if (template.includes('</head>')) return template.replace('</head>', `  ${link}\n</head>`)
  return `${link}${template}`
}

export interface DevServer {
  readonly handle: NexisHandler
  readonly revision: () => number
  readonly invalidate: () => number
}

export function createDevServer(handler: NexisHandler): DevServer {
  let currentRevision = 0
  return {
    handle: handler,
    revision: () => currentRevision,
    invalidate: () => {
      currentRevision += 1
      return currentRevision
    },
  }
}

async function discoverRouteRecords(root: string) {
  const routeRoot = join(root, 'src', 'routes')
  async function walk(dir: string, base: string): Promise<string[]> {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return []
    }
    const files: string[] = []
    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        files.push(...(await walk(full, base)))
      } else if (/\.(tsx|jsx|ts|js)$/.test(entry.name) && !entry.name.startsWith('layout.')) {
        files.push(relative(base, full))
      }
    }
    return files
  }
  try {
    const files = await walk(routeRoot, routeRoot)
    return files
      .map((file) => {
        try {
          return routeFromFile(`src/routes/${file.replace(/\\/g, '/')}`)
        } catch {
          return null
        }
      })
      .filter(Boolean) as ReturnType<typeof routeFromFile>[]
  } catch {
    return []
  }
}

export function nexisSSRPlugin(root: string): Plugin {
  return {
    name: 'nexis-ssr',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        try {
          const url = req.url || '/'
          const pathname = new URL(url, 'http://localhost').pathname
          const accept = req.headers.accept || ''

          const isHtmlRequest =
            accept.includes('text/html') || (!pathname.includes('.') && !pathname.startsWith('/@'))

          if (!isHtmlRequest) return next()
          if (
            pathname.startsWith('/@') ||
            pathname.startsWith('/__') ||
            pathname.startsWith('/node_modules')
          )
            return next()
          if (/\.(js|css|json|png|jpg|svg|webp|avif|woff|woff2|ico)$/.test(pathname)) return next()

          const routes = await discoverRouteRecords(root)
          if (routes.length === 0) return next()

          const sorted = [...routes].sort((a, b) => b.score - a.score)
          const matched = resolveRoute(sorted, pathname)
          if (!matched) return next()

          const filePath = matched.route.file
          const modulePath = `/${filePath}`

          let routeModule: any
          try {
            routeModule = await server.ssrLoadModule(modulePath)
          } catch {
            return next()
          }

          const seo = routeModule.seo as { title?: string; description?: string } | undefined
          const head = (() => {
            try {
              if (seo?.title) return renderHead(seo as any)
            } catch {}
            if (seo?.title) return `<title>${seo.title}</title>`
            return '<title>Nexis App</title>'
          })()

          const Component = routeModule.default
          let renderedHtml = ''
          if (typeof Component === 'function') {
            const result = await Component(matched.params ?? {})
            renderedHtml = renderToString(result)
          } else if (Component) {
            renderedHtml = renderToString(Component)
          }

          const hasInteractive =
            renderedHtml.includes('data-nx-on') || renderedHtml.includes('data-nx-on-click')
          const scripts = hasInteractive
            ? '<script type="module" src="/nexis-bootstrap.js"></script>'
            : ''

          let template: string
          try {
            template = await readFile(join(root, 'index.html'), 'utf-8')
          } catch {
            template = `<!DOCTYPE html><html lang="en"><head><!--nexis-head-outlet--></head><body><div id="app"><!--nexis-app-outlet--></div><!--nexis-scripts-outlet--></body></html>`
          }

          template = await server.transformIndexHtml(url, template)
          try {
            await readFile(join(root, 'src', 'styles.css'), 'utf8')
            template = injectStylesheetLink(template, '/src/styles.css')
          } catch {
            // Applications without a source stylesheet remain CSS-free by design.
          }

          const html = template
            .replace('<!--nexis-head-outlet-->', head)
            .replace('<!--nexis-app-outlet-->', renderedHtml)
            .replace('<!--nexis-scripts-outlet-->', scripts)

          res.statusCode = 200
          res.setHeader('Content-Type', 'text/html; charset=utf-8')
          res.end(html)
        } catch (err) {
          server.ssrFixStacktrace(err as Error)
          next(err)
        }
      })
    },
  }
}

export async function createNexisDevMiddleware(root: string) {
  const { createServer } = await import('vite')
  const vite = await createServer({
    root,
    server: { middlewareMode: true },
    appType: 'custom',
  })
  const plugin = nexisSSRPlugin(root)
  if (plugin.configureServer) {
    // @ts-ignore
    await (plugin.configureServer as any)(vite)
  }
  return vite.middlewares
}
