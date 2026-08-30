import { component } from 'nexil'
import { createSecurityHeaders } from 'nexil/server'
import { renderTelemetryScript } from 'nexil'

export const seo = {
  title: 'Nexil Showcase Status — Runtime health',
  description: 'Health and coverage status for the Nexil showcase application.',
  canonical: 'https://nexil-showcase.example/showcase/status',
  type: 'website' as const,
  jsonLd: { '@context': 'https://schema.org', '@type': 'WebPage', name: 'Nexil Showcase Status' },
}

const headers = createSecurityHeaders()
const telemetryDisabledBytes = renderTelemetryScript({ endpoint: '/__nexil/telemetry' }).length

export default component(() => (
  <>
    <main className="shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Status / local evaluation</p>
          <h1>
            All systems <em>observable.</em>
          </h1>
          <p className="lede">
            This route is intentionally boring: it makes the health contract legible and keeps the
            details in the document for crawlers and operators.
          </p>
        </div>
        <div className="hero-aside">
          <p className="aside-label">Current state</p>
          <div className="metric">
            <span>route graph</span>
            <strong>healthy</strong>
          </div>
          <div className="metric">
            <span>SSR output</span>
            <strong>healthy</strong>
          </div>
          <div className="metric">
            <span>security policy</span>
            <strong>{headers.has('Content-Security-Policy') ? 'present' : 'missing'}</strong>
          </div>
          <div className="metric">
            <span>benchmark harness</span>
            <strong>ready</strong>
          </div>
        </div>
      </section>
      <section className="section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Coverage</p>
            <h2>
              Ready to <em>measure.</em>
            </h2>
          </div>
          <p>
            See the generated benchmark report in the repository after running{' '}
            <code>pnpm bench</code> and <code>pnpm evaluate</code>.
          </p>
        </div>
        <div className="grid-3">
          <article className="card">
            <span className="tag">HTTP</span>
            <h3>200 / 404 behavior</h3>
            <p>
              Static, dynamic, nested, and missing routes are tested against expected response
              classes.
            </p>
          </article>
          <article className="card">
            <span className="tag">SEO</span>
            <h3>Head completeness</h3>
            <p>
              Title, description, canonical, OpenGraph, Twitter, JSON-LD, sitemap, and robots
              outputs are checked.
            </p>
          </article>
          <article className="card">
            <span className="tag">Security</span>
            <h3>Output safety</h3>
            <p>
              Dangerous URL protocols, CSS delimiters, cookie injection, and untrusted origins are
              exercised.
            </p>
          </article>
          <article className="card">
            <span className="tag">Telemetry</span>
            <h3>Opt-in only</h3>
            <p>
              Disabled by default: emitted telemetry script bytes{' '}
              <strong>{telemetryDisabledBytes}</strong>.
            </p>
          </article>
        </div>
      </section>
    </main>
  </>
))
