import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, win32 } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { createProject, helpText, parseCommand, runCli } from './index'
import { isContainedPath, parseScaffoldArgs, scaffoldProject } from './scaffold'

describe('Nexil CLI', () => {
  it('parses supported commands and help', () => {
    expect(parseCommand(['build'])).toEqual({ command: 'build', args: [] })
    expect(parseCommand(['--help']).command).toBe('help')
    expect(helpText()).toContain('create <name>')
    expect(() => parseCommand(['unknown'])).toThrow(/Unknown/)
  })

  it('creates a one-route project safely', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'nexil-cli-'))
    const directory = await createProject('demo-app', parent)
    expect(await readFile(join(directory, 'src/routes/index.tsx'), 'utf8')).toContain(
      'Rendered via Nexil SSR Engine',
    )
    expect(await readFile(join(directory, 'index.html'), 'utf8')).toContain(
      '<!--nexil-app-outlet-->',
    )
    await expect(createProject('../escape', parent)).rejects.toThrow(/Project name/)
    await expect(runCli(['routes'], directory)).resolves.toContain('index.tsx')
    await expect(runCli(['build'], directory)).resolves.toContain('build completed')
    expect(await readFile(join(directory, 'dist/client/styles.css'), 'utf8')).toContain(
      'Nexil starter design system',
    )
    await expect(runCli(['analyze'], directory)).resolves.toMatch(/\/\s+\d+\s+\d+\s+interactive/)
  }, 30000)

  it('requires a production artifact before start', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'nexil-cli-start-'))
    try {
      const directory = await createProject('start-app', parent)
      await expect(runCli(['start'], directory)).rejects.toThrow(/Run `pnpm build`/)
    } finally {
      await rm(parent, { recursive: true, force: true })
    }
  })

  it('uses optional project configuration for the production origin', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'nexil-cli-config-'))
    try {
      const directory = await createProject('configured-app', parent)
      await writeFile(
        join(directory, 'nexil.config.mjs'),
        "export default { app: { origin: 'https://configured.example.test' } }\n",
        'utf8',
      )
      await runCli(['build'], directory)
      const html = await readFile(join(directory, 'dist/client/index.html'), 'utf8')
      expect(html).toContain('https://configured.example.test/')
    } finally {
      await rm(parent, { recursive: true, force: true })
    }
  }, 30000)

  it('reports oversized static images in the production asset inventory', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'nexil-cli-assets-'))
    try {
      const directory = await createProject('asset-app', parent)
      await mkdir(join(directory, 'public'), { recursive: true })
      await writeFile(join(directory, 'public', 'hero.png'), new Uint8Array(300 * 1024))
      await runCli(['build'], directory)
      const analysis = await runCli(['analyze'], directory)
      expect(analysis).toContain('Static asset delivery')
      expect(analysis).toContain('/hero.png')
      expect(analysis).toContain('warning: consider AVIF/WebP variants')
      const manifest = JSON.parse(
        await readFile(join(directory, 'dist', 'nexil-manifest.json'), 'utf8'),
      ) as { assets?: { count: number; imageBytes: number } }
      expect(manifest.assets?.count).toBeGreaterThan(0)
      expect(manifest.assets?.imageBytes).toBeGreaterThanOrEqual(300 * 1024)
    } finally {
      await rm(parent, { recursive: true, force: true })
    }
  }, 30000)

  it('emits cached AVIF and WebP public-image variants when configured', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'nexil-cli-media-'))
    try {
      const directory = await createProject('media-app', parent)
      await mkdir(join(directory, 'public'), { recursive: true })
      await writeFile(
        join(directory, 'public', 'hero.svg'),
        '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="green" /></svg>',
      )
      await writeFile(
        join(directory, 'nexil.config.mjs'),
        'export default { media: { images: { transform: true, widths: [16] } } }\n',
        'utf8',
      )
      await runCli(['build'], directory)
      expect(
        (await readFile(join(directory, 'dist/client/hero-svg-16.avif'))).byteLength,
      ).toBeGreaterThan(0)
      expect(
        (await readFile(join(directory, 'dist/client/hero-svg-16.webp'))).byteLength,
      ).toBeGreaterThan(0)
      await runCli(['build'], directory)
      const manifest = JSON.parse(
        await readFile(join(directory, 'dist/nexil-manifest.json'), 'utf8'),
      ) as { media?: { images: Array<{ variants: Array<{ cacheHit: boolean }> }> } }
      expect(manifest.media?.images[0]?.variants).toHaveLength(2)
      expect(manifest.media?.images[0]?.variants.every((variant) => variant.cacheHit)).toBe(true)
      expect(await runCli(['analyze'], directory)).toContain('Generated image variants')
    } finally {
      await rm(parent, { recursive: true, force: true })
    }
  }, 30000)

  it('uses local workspace dependencies when scaffolded inside the repository', async () => {
    const parent = await mkdtemp(join(process.cwd(), '.nexil-scaffold-test-'))
    try {
      const result = await scaffoldProject('workspace-app', parent, { yes: true, language: 'ts' })
      const packageJson = JSON.parse(
        await readFile(join(result.directory, 'package.json'), 'utf8'),
      ) as {
        dependencies: { '@nexil/cli': string }
      }
      expect(packageJson.dependencies['@nexil/cli']).toBe('workspace:*')
      expect(await readFile(join(result.directory, 'pnpm-workspace.yaml'), 'utf8')).toContain(
        'onlyBuiltDependencies:',
      )
      expect(await readFile(join(result.directory, 'index.html'), 'utf8')).toContain(
        '<!--nexil-app-outlet-->',
      )
    } finally {
      await rm(parent, { recursive: true, force: true })
    }
  })

  it('configures published scaffolds for GitHub Packages', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'nexil-github-scaffold-'))
    try {
      const result = await scaffoldProject('github-app', parent, { yes: true, language: 'ts' })
      const packageJson = JSON.parse(
        await readFile(join(result.directory, 'package.json'), 'utf8'),
      ) as {
        dependencies: { '@nexil/cli': string }
        nexil: { source: string; registry: string }
      }
      expect(packageJson.dependencies['@nexil/cli']).toBe('^0.2.3')
      expect(packageJson.nexil).toEqual({
        routeExtension: 'tsx',
        source: 'npm',
        registry: 'https://registry.npmjs.org/',
      })
      expect(await readFile(join(result.directory, '.npmrc'), 'utf8')).toBe(
        '@nexil:registry=https://registry.npmjs.org/\n',
      )
    } finally {
      await rm(parent, { recursive: true, force: true })
    }
  })

  it('handles Windows-style path containment without POSIX separators', () => {
    const parent = 'D:\\Projects\\Test\\nexil-framework'
    expect(
      isContainedPath(
        parent,
        `${parent}\\my-nexil-app`,
        { relative: win32.relative, isAbsolute: win32.isAbsolute },
        '\\',
      ),
    ).toBe(true)
    expect(
      isContainedPath(
        parent,
        'D:\\Projects\\Test\\other-app',
        { relative: win32.relative, isAbsolute: win32.isAbsolute },
        '\\',
      ),
    ).toBe(false)
    expect(
      isContainedPath(
        parent,
        'D:\\Projects\\Test\\nexil-framework\\..\\escape',
        { relative: win32.relative, isAbsolute: win32.isAbsolute },
        '\\',
      ),
    ).toBe(false)
  })

  it('supports deterministic TSX and JSX scaffold variants', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'nexil-cli-scaffold-'))
    expect(parseScaffoldArgs(['app', '--yes', '--js', '--tailwind'])).toEqual({
      name: 'app',
      options: { yes: true, language: 'js', tailwind: true },
    })
    expect(() => parseScaffoldArgs(['app', '--ts', '--js'])).toThrow(/only one/)

    const result = await scaffoldProject('js-app', parent, {
      yes: true,
      language: 'js',
      tailwind: true,
    })
    expect(await readFile(join(result.directory, 'src/routes/index.jsx'), 'utf8')).toContain(
      'Rendered via Nexil SSR Engine',
    )
    expect(await readFile(join(result.directory, 'src/routes/counter.jsx'), 'utf8')).toContain(
      'onClick$',
    )
    expect(await readFile(join(result.directory, 'tsconfig.json'), 'utf8')).toContain(
      '"jsxImportSource": "@nexil/core"',
    )
    expect(await readFile(join(result.directory, 'tsconfig.json'), 'utf8')).toContain(
      '"allowJs": true',
    )
    expect(await readFile(join(result.directory, 'src/styles.css'), 'utf8')).toContain(
      'tailwindcss',
    )
    expect(await readFile(join(result.directory, 'vite.config.ts'), 'utf8')).toContain(
      '@tailwindcss/vite',
    )
    expect(await readFile(join(result.directory, '.vscode/extensions.json'), 'utf8')).toContain(
      'bradlc.vscode-tailwindcss',
    )
    expect(await readFile(join(result.directory, '.vscode/settings.json'), 'utf8')).toContain(
      'tailwindCSS.experimental.classRegex',
    )
    await expect(scaffoldProject('js-app', parent, { yes: true })).rejects.toThrow(/not empty/)
  })

  it('builds the practical Tailwind and dynamic SSG fixture end to end', async () => {
    const directory = fileURLToPath(new URL('../../../examples/practical-app', import.meta.url))
    await expect(runCli(['build'], directory)).resolves.toContain('build completed')
    const stylesheet = await readFile(join(directory, 'dist/client/assets/styles.css'), 'utf8')
    const html = await readFile(join(directory, 'dist/client/index.html'), 'utf8')
    const manifest = JSON.parse(
      await readFile(join(directory, 'dist/client/nexil-manifest.json'), 'utf8'),
    ) as { routes: Array<{ route: string }> }
    expect(stylesheet).toContain('.bg-slate-950')
    expect(html.match(/href="\/assets\/styles\.css"/g)).toHaveLength(1)
    expect(
      await readFile(join(directory, 'dist/client/docs/quickstart/index.html'), 'utf8'),
    ).toContain('quickstart')
    expect(manifest.routes.map((route) => route.route)).toEqual(
      expect.arrayContaining(['/docs/quickstart', '/docs/routing', '/docs/styling']),
    )
  }, 30000)

  it('emits and measures bootstrap for an interactive route', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'nexil-cli-interactive-'))
    const directory = await createProject('interactive-app', parent)
    await writeFile(
      join(directory, 'src/routes/index.tsx'),
      `export default function Home() {\n  return <button onClick$={(event) => event.currentTarget}>Increment</button>\n}\n`,
      'utf8',
    )

    await expect(runCli(['check', '--budget'], directory)).resolves.toContain('checks passed')
    const manifest = JSON.parse(
      await readFile(join(directory, 'dist/nexil-manifest.json'), 'utf8'),
    ) as { routes: Array<{ source: string; interactive: boolean; bootstrapGzipBytes: number }> }
    const indexRoute = manifest.routes.find((route) => route.source === 'index.tsx')
    expect(indexRoute?.interactive).toBe(true)
    expect(indexRoute?.bootstrapGzipBytes).toBeGreaterThan(0)
    expect(await readFile(join(directory, 'dist/nexil-bootstrap.js'), 'utf8')).toContain(
      'document.addEventListener',
    )
  })

  it('moves resumability state metadata out of generated HTML', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'nexil-cli-external-state-'))
    try {
      const directory = await createProject('external-state-app', parent)
      await writeFile(
        join(directory, 'src/routes/index.tsx'),
        `import { state } from '@nexil/core'
const accountBalance = state(1200)
export default function Home() { return <button onClick$={() => accountBalance.set((value) => value + 1)}>{accountBalance()}</button> }
`,
        'utf8',
      )
      await runCli(['build'], directory)
      const html = await readFile(join(directory, 'dist/client/index.html'), 'utf8')
      expect(html).toMatch(/data-nx-scope="nx:scope:[a-f0-9]{12}"/)
      expect(html).not.toContain('accountBalance')
      expect(html).not.toContain('&quot;initial&quot;')
      expect(html).toContain('<script type="module" src="/nexil-state.js"></script>')
      const stateRuntime = await readFile(join(directory, 'dist/client/nexil-state.js'), 'utf8')
      expect(stateRuntime).toContain('accountBalance')
      expect(stateRuntime).toContain('1200')
    } finally {
      await rm(parent, { recursive: true, force: true })
    }
  })

  it('emits the direct navigation runtime only for routes that render Link', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'nexil-cli-navigation-'))
    try {
      const staticDirectory = await createProject('navigation-static', parent)
      await writeFile(
        join(staticDirectory, 'src/routes/index.tsx'),
        'export default function Home() { return <main>Static HTML</main> }\n',
        'utf8',
      )
      await runCli(['build'], staticDirectory)
      const staticHtml = await readFile(join(staticDirectory, 'dist/client/index.html'), 'utf8')
      expect(staticHtml).not.toContain('/nexil-navigation.js')
      const staticManifest = JSON.parse(
        await readFile(join(staticDirectory, 'dist/nexil-manifest.json'), 'utf8'),
      ) as { routes: Array<{ navigationGzipBytes: number }> }
      expect(staticManifest.routes[0]?.navigationGzipBytes).toBe(0)
      await expect(
        readFile(join(staticDirectory, 'dist/client/nexil-navigation.js'), 'utf8'),
      ).rejects.toThrow()

      const linkDirectory = await createProject('navigation-link', parent)
      await writeFile(
        join(linkDirectory, 'src/routes/index.tsx'),
        `import { Link } from 'nexil/router'
export default function Home() { return <main><Link href="/about" prefetch="intent">About</Link></main> }
`,
        'utf8',
      )
      await writeFile(
        join(linkDirectory, 'src/routes/about.tsx'),
        'export default function About() { return <main>About Nexil</main> }\n',
        'utf8',
      )
      await runCli(['build'], linkDirectory)
      const linkHtml = await readFile(join(linkDirectory, 'dist/client/index.html'), 'utf8')
      expect(linkHtml).toContain('href="/about"')
      expect(linkHtml).toContain('data-nx-link="push"')
      expect(linkHtml).toContain('data-nx-prefetch="intent"')
      expect(linkHtml).toContain('/nexil-navigation.js')
      expect(
        await readFile(join(linkDirectory, 'dist/client/nexil-navigation.js'), 'utf8'),
      ).toContain('history.pushState')
      const linkManifest = JSON.parse(
        await readFile(join(linkDirectory, 'dist/nexil-manifest.json'), 'utf8'),
      ) as { routes: Array<{ route: string; navigationGzipBytes: number }> }
      expect(
        linkManifest.routes.find((route) => route.route === '/')?.navigationGzipBytes,
      ).toBeGreaterThan(0)
    } finally {
      await rm(parent, { recursive: true, force: true })
    }
  }, 30000)

  it('creates an isolated ContextScope for each statically rendered Route and Layout', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'nexil-cli-context-scope-'))
    try {
      const directory = await createProject('context-scope-app', parent)
      await writeFile(
        join(directory, 'src/routes/_layout.tsx'),
        `import { createContext, provideContext } from '@nexil/core'
const RequestIdentity = createContext('missing')
export default function Layout({ children }: { children: unknown }, context?: { readonly requestId?: string; readonly scope?: unknown }) {
  const scope = provideContext(context?.scope as never, RequestIdentity, context?.requestId ?? 'missing')
  return <main data-request-context={RequestIdentity.use(scope)}>{children}</main>
}
`,
        'utf8',
      )
      await writeFile(
        join(directory, 'src/routes/index.tsx'),
        'export default function Home() { return <h1>Home</h1> }\n',
        'utf8',
      )
      await writeFile(
        join(directory, 'src/routes/about.tsx'),
        'export default function About() { return <h1>About</h1> }\n',
        'utf8',
      )
      await runCli(['build'], directory)
      const home = await readFile(join(directory, 'dist/client/index.html'), 'utf8')
      const about = await readFile(join(directory, 'dist/client/about/index.html'), 'utf8')
      expect(home).toContain('data-request-context="build:/"')
      expect(about).toContain('data-request-context="build:/about"')
      expect(about).not.toContain('data-request-context="build:/"')
    } finally {
      await rm(parent, { recursive: true, force: true })
    }
  }, 30000)
})

it('generates routes, components, and actions with safe paths', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'nexil-cli-generators-'))
  try {
    const directory = await createProject('generator-app', parent)
    await expect(runCli(['generate', 'route', 'account/settings'], directory)).resolves.toContain(
      'src/routes/account/settings.tsx',
    )
    await expect(runCli(['generate', 'component', 'Button'], directory)).resolves.toContain(
      'src/components/Button.tsx',
    )
    await expect(runCli(['add', 'action', 'saveProfile'], directory)).resolves.toContain(
      'src/actions/saveProfile.ts',
    )
    await expect(runCli(['generate', 'route', '../escape'], directory)).rejects.toThrow(
      /safe relative/,
    )
    await expect(runCli(['doctor'], directory)).resolves.toContain('ok package-json:')
    const report = JSON.parse(await runCli(['doctor', '--json'], directory)) as {
      version: number
      status: string
      checks: Array<{ code: string; level: string }>
    }
    expect(report.version).toBe(1)
    expect(report.checks).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'package-json', level: 'ok' })]),
    )
  } finally {
    await rm(parent, { recursive: true, force: true })
  }
})

it('emits the automatic progressive-form runtime only for Form routes', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'nexil-cli-forms-'))
  try {
    const directory = await createProject('forms-app', parent)
    await writeFile(
      join(directory, 'src/routes/index.tsx'),
      `import { Form, SubmitButton } from '@nexil/core'\nexport default function Home() { return <Form action="/save"><input name="name" /><SubmitButton loadingText="Saving">Save</SubmitButton></Form> }\n`,
      'utf8',
    )
    await runCli(['build'], directory)
    const html = await readFile(join(directory, 'dist/client/index.html'), 'utf8')
    expect(html).toContain('data-nx-form="progressive"')
    expect(html).toContain('/nexil-forms.js')
    expect(await readFile(join(directory, 'dist/client/nexil-forms.js'), 'utf8')).toContain(
      'Idempotency-Key',
    )
  } finally {
    await rm(parent, { recursive: true, force: true })
  }
}, 30000)

it('isolates the binding runtime to binding-enabled routes', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'nexil-cli-bindings-'))
  try {
    const staticDirectory = await createProject('static-app', parent)
    await writeFile(
      join(staticDirectory, 'src/routes/index.tsx'),
      'export default function Home() { return <main>Static HTML</main> }\n',
      'utf8',
    )
    await runCli(['build'], staticDirectory)
    const staticHtml = await readFile(join(staticDirectory, 'dist/client/index.html'), 'utf8')
    expect(staticHtml).not.toContain('/nexil-bindings.js')
    await expect(
      readFile(join(staticDirectory, 'dist/client/nexil-bindings.js'), 'utf8'),
    ).rejects.toThrow()

    const bindingDirectory = await createProject('binding-app', parent)
    await writeFile(
      join(bindingDirectory, 'src/routes/index.tsx'),
      `import { state } from '@nexil/core'
const count = state(0)
export default function Home() { return <output>{count()}</output> }
`,
      'utf8',
    )
    await runCli(['build'], bindingDirectory)
    const bindingHtml = await readFile(join(bindingDirectory, 'dist/client/index.html'), 'utf8')
    expect(bindingHtml).toContain('/nexil-bindings.js')
    expect(
      await readFile(join(bindingDirectory, 'dist/client/nexil-bindings.js'), 'utf8'),
    ).toContain('data-nx-bind')
  } finally {
    await rm(parent, { recursive: true, force: true })
  }
}, 30000)
