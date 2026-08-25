import { action, assertTrustedOrigin } from '@mohammedaydan/actions'
import { adapterCapabilities, createNodeAdapter } from '@mohammedaydan/adapters'
import {
  createHandlerReference,
  createResumeAttribute,
  serializeResumeState,
  serializeScopeRefs,
} from '@mohammedaydan/client'
import { component, computed, state } from '@mohammedaydan/core'
import { cn, extractStyle } from '@mohammedaydan/css'
import { imageAttributes, fontFace } from '@mohammedaydan/media'
import { batch } from '@mohammedaydan/reactivity'
import { buildRobots, buildSitemap } from '@mohammedaydan/seo'
import { createStateRegistry } from '@mohammedaydan/state'
import {
  createDataContext,
  createSecurityHeaders,
  data,
  serializeCookie,
} from '@mohammedaydan/server'

export const seo = {
  title: 'Nexis Showcase — HTML-first, resumable applications',
  description:
    'A complete, runnable feature showcase for the Nexis HTML-first and resumable web framework.',
  canonical: 'https://nexis-showcase.example/showcase',
  image: 'https://nexis-showcase.example/og.png',
  type: 'website' as const,
  jsonLd: { '@context': 'https://schema.org', '@type': 'WebSite', name: 'Nexis Showcase' },
}

const score = state(8)
const count = state(0)
const countScope = serializeScopeRefs({
  count: { kind: 'signal', id: 'nx:signal:showcase-count', initial: 0 },
})
const doubledScore = computed(() => score() * 2)
const registry = createStateRegistry()
const preferences = registry.getOrCreate('global', 'showcase-preferences', {
  theme: 'deep-sea',
  reducedMotion: false,
})
const extracted = extractStyle({ borderRadius: 12, '--signal': '#63e6d2', opacity: 0.94 })
const heroImage = imageAttributes({
  src: '/nexis-showcase.svg',
  width: 960,
  height: 540,
  alt: 'A cyan signal wave crossing a dark grid',
  priority: true,
  sizes: '(max-width: 820px) 100vw, 45vw',
})
const typeCss = fontFace({
  family: 'Nexis Serif',
  weight: [400, 700],
  source: '/fonts/nexis-serif.woff2',
})
const resumabilityState = serializeResumeState({ route: '/', theme: 'deep-sea', score: 8 })
const handlerReference = createHandlerReference('chunk_showcase.js', 'toggleSignal')
const resumeAttribute = createResumeAttribute('signal-boundary', handlerReference)
const sitemapPreview = buildSitemap([
  { url: 'https://nexis-showcase.example/showcase', priority: 1, changeFrequency: 'weekly' },
  { url: 'https://nexis-showcase.example/showcase/labs', priority: 0.7 },
])
const robotsPreview = buildRobots('https://nexis-showcase.example/sitemap.xml', [
  '/private',
  '/admin',
])
const securityHeaders = createSecurityHeaders('showcaseNonce123')
const cookiePreview = serializeCookie('nexis_demo', 'feature-tour', {
  maxAge: 3600,
  sameSite: 'Lax',
})
const requestData = createDataContext(new Request('https://nexis-showcase.example/showcase'))
const requestTrace = requestData.request.url
const serverAction = action({
  validate: (input: unknown) => {
    if (!input || typeof input !== 'object' || !('email' in input))
      throw new TypeError('Email required')
    return input as { email: string }
  },
  authorize: (context) => assertTrustedOrigin(context.request, ['https://nexis-showcase.example']),
  handle: (_context, input) => ({ accepted: input.email.endsWith('.test') }),
})
const nodeAdapter = createNodeAdapter(async () => new Response('Nexis adapter ready'))
const metricCards = [
  ['HTML first', 'The initial document is rendered on the server, not assembled after hydration.'],
  ['Resumable', 'Event boundaries become tiny validated chunks that load only when needed.'],
  ['Composable', 'Routing, SEO, media, state, server utilities, and adapters share one contract.'],
] as const

export default component(() => {
  const signalClass = cn(
    'button',
    'secondary',
    preferences.snapshot().theme === 'deep-sea' && 'active',
  )
  batch(() => score.set((value) => value + 1))
  void serverAction
  void nodeAdapter
  void data(requestData, 'showcase:request', () => requestTrace)

  return (
    <>
      <style>{typeCss}</style>
      <header className="shell site-header">
        <a className="wordmark" href="/">
          <span className="mark">N</span>
          <span>Nexis / field guide</span>
        </a>
        <nav className="nav" aria-label="Primary navigation">
          <a href="/features">Features</a>
          <a href="/labs">Labs</a>
          <a href="/docs/architecture">Docs</a>
          <a href="/status">Status</a>
        </nav>
      </header>

      <main>
        <section className="shell hero">
          <div>
            <p className="eyebrow">A complete framework specimen / v1.0</p>
            <h1>
              Build pages that arrive <em>already alive.</em>
            </h1>
            <p className="lede">
              Nexis treats the document as the product: render useful HTML first, serialize only the
              state that matters, and load interaction at the exact boundary where a reader asks for
              it.
            </p>
            <div className="button-row">
              <a className="button" href="/features">
                Explore the system
              </a>
              <a className="button secondary" href="/labs">
                Open the lab
              </a>
            </div>
          </div>
          <aside className="hero-aside" aria-label="Live framework metrics">
            <p className="aside-label">Runtime signal / observed locally</p>
            <div className="metric">
              <span>SSR document</span>
              <strong>ready</strong>
            </div>
            <div className="metric">
              <span>Hydration payload</span>
              <strong>0 B</strong>
            </div>
            <div className="metric">
              <span>Interactive boundary</span>
              <strong>&lt; 1 KB</strong>
            </div>
            <div className="metric">
              <span>SEO head output</span>
              <strong>complete</strong>
            </div>
          </aside>
        </section>

        <section className="shell section" aria-labelledby="why-nexis">
          <div className="section-heading">
            <div>
              <p className="eyebrow">The thesis</p>
              <h2 id="why-nexis">
                Less runtime. <em>More surface.</em>
              </h2>
            </div>
            <p>
              Every example below is produced by the same route graph and evaluated by the benchmark
              suite that ships with this project.
            </p>
          </div>
          <div className="grid-3">
            {metricCards.map(([label, copy], index) => (
              <article className="card" key={label}>
                <span className="tag">0{index + 1} / principle</span>
                <h3>{label}</h3>
                <p>{copy}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="shell section split" aria-labelledby="resumability">
          <div>
            <p className="eyebrow">Resumability boundary</p>
            <h2 id="resumability">The page waits. The button does not.</h2>
            <p className="small">
              This button is a real <code>onClick$</code> boundary. The server emits the attribute
              and the browser fetches a tiny chunk only after the click.
            </p>
            <button
              id="signal-button"
              className={signalClass}
              data-nx-state="0"
              data-nx-scope={countScope}
              onClick$={({ element }) => {
                const next = count() + 1
                count.set(next)
                element.textContent = `Signal acknowledged / ${next}`
                element.dataset.nxState = String(next)
              }}
            >
              Trigger the signal
            </button>
            <p className="small">
              Computed proof: score <strong>{score()}</strong> × 2 ={' '}
              <strong>{doubledScore()}</strong>
            </p>
          </div>
          <div className="console" aria-label="Resumability payload preview">
            <div className="dim">$ nexis inspect boundary</div>
            <div className="good">boundary: {resumeAttribute}</div>
            <div>state: {resumabilityState}</div>
            <div className="warn">startup: delegated / lazy / validated</div>
          </div>
        </section>

        <section className="shell section" aria-labelledby="media">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Media and CSS contracts</p>
              <h2 id="media">
                Assets with <em>guardrails.</em>
              </h2>
            </div>
            <p>
              Responsive image attributes, font-face rules, numeric CSS units, custom properties,
              and safe style extraction stay explicit and inspectable.
            </p>
          </div>
          <div className="grid-2">
            <article className="card">
              <span className="tag">media / imageAttributes</span>
              <img {...heroImage} className="showcase-image" />
              <p>
                Generated srcset: <code>{heroImage.srcset.slice(0, 92)}…</code>
              </p>
            </article>
            <article className="card" style={{ borderColor: '#63e6d2', padding: 22 }}>
              <span className="tag">css / extractStyle</span>
              <p>
                Class: <code>{extracted.className}</code>
              </p>
              <pre className="console">{extracted.cssText}</pre>
              <p>
                Font rule: <code>{typeCss.slice(0, 112)}…</code>
              </p>
            </article>
          </div>
        </section>

        <section className="shell section" aria-labelledby="platform">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Platform layer</p>
              <h2 id="platform">
                One route graph, <em>many edges.</em>
              </h2>
            </div>
            <p>
              The server utilities and adapters make the same request model portable across Node,
              Cloudflare, and Deno-style environments.
            </p>
          </div>
          <div className="grid-3">
            <article className="card">
              <span className="tag">server</span>
              <h3>Security headers</h3>
              <p>
                <code>{securityHeaders.get('Content-Security-Policy')}</code>
              </p>
              <p>
                Cookie: <code>{cookiePreview}</code>
              </p>
            </article>
            <article className="card">
              <span className="tag">adapters</span>
              <h3>Runtime capability</h3>
              <p>
                Node adapter: <strong>{nodeAdapter.name}</strong>
              </p>
              <p>
                Streaming: <strong>{String(adapterCapabilities.node.streaming)}</strong>
              </p>
            </article>
            <article className="card">
              <span className="tag">SEO artifacts</span>
              <h3>Discovery-ready</h3>
              <p>
                Sitemap bytes: <strong>{sitemapPreview.length}</strong>
              </p>
              <p>
                Robots lines: <strong>{robotsPreview.split('\n').length - 1}</strong>
              </p>
            </article>
          </div>
        </section>
      </main>

      <footer className="shell site-footer">
        <span>Built with Nexis / no hydration required</span>
        <span>HTML → boundary → edge</span>
      </footer>
    </>
  )
})
