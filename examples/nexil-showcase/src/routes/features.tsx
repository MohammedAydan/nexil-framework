import { component } from '@nexil/core'

export const seo = {
  title: 'Nexil Features — Runtime surface area',
  description:
    'A route-by-route inventory of the Nexil framework features exercised by the showcase.',
  canonical: 'https://nexil-showcase.example/showcase/features',
  type: 'website' as const,
  jsonLd: { '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Nexil Features' },
}

const features = [
  [
    '01',
    'Core nodes',
    'Validated element and text nodes, safe serialization, request context, and component contracts.',
    '@nexil/core',
  ],
  [
    '02',
    'Fine-grained reactivity',
    'Signals, computed values, batching, effects, scopes, untracking, and explicit disposal.',
    '@nexil/reactivity',
  ],
  [
    '03',
    'File routing',
    'Static, dynamic, optional catch-all, encoded segments, and static path expansion from src/routes.',
    '@nexil/router',
  ],
  [
    '04',
    'HTML rendering',
    'Escaped text and attributes, safe URLs, style serialization, async children, streams, and render modes.',
    '@nexil/renderer',
  ],
  [
    '05',
    'Boundary compiler',
    'Lazy dollar-event extraction, lexical capture rewriting, static CSS extraction, and client/server checks.',
    '@nexil/compiler + vite-plugin',
  ],
  [
    '06',
    'SEO engine',
    'Head tags, canonical and OpenGraph URLs, JSON-LD, sitemap XML, robots directives, and validation.',
    '@nexil/seo',
  ],
  [
    '07',
    'Media pipeline',
    'Responsive image attributes, font-face generation, safe remote font downloading, and image transforms.',
    '@nexil/media',
  ],
  [
    '08',
    'Server and actions',
    'Request data deduplication, cookies, security headers, trusted origins, idempotency, and validated actions.',
    '@nexil/server + actions',
  ],
  [
    '09',
    'Adapters',
    'Portable handler shape and declared capability matrix for Node, Cloudflare, and Deno runtimes.',
    '@nexil/adapters',
  ],
]

export default component(() => (
  <main>
    <section className="shell hero">
      <div>
        <p className="eyebrow">Feature map / 09 systems</p>
        <h1>
          A framework surface you can <em>inspect.</em>
        </h1>
        <p className="lede">
          This page is intentionally plain about the machinery. Each tile maps to a package, an
          observable behavior, and a benchmark target.
        </p>
      </div>
      <div className="console">
        <div className="dim">$ nexil feature-map --all</div>
        <div className="good">09 packages connected</div>
        <div>routes: discovered</div>
        <div>ssr: rendered</div>
        <div>seo: validated</div>
        <div>chunks: lazy</div>
        <div className="warn">audit: see /labs</div>
      </div>
    </section>
    <section className="shell section" aria-labelledby="feature-list">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Inventory</p>
          <h2 id="feature-list">Every layer has a job.</h2>
        </div>
        <p>
          Feature coverage is demonstrated in the running application rather than listed as an
          abstract promise.
        </p>
      </div>
      <div className="grid-3">
        {features.map(([number, name, copy, packageName]) => (
          <article className="card" key={name}>
            <span className="tag">
              {number} / {packageName}
            </span>
            <h3>{name}</h3>
            <p>{copy}</p>
          </article>
        ))}
      </div>
    </section>
    <section className="shell section split">
      <div>
        <p className="eyebrow">Follow the evidence</p>
        <h2>Test the behavior, not the brochure.</h2>
        <p className="small">
          The lab route exposes the actual generated HTML, state payload, security headers, and
          benchmark inputs. The docs route explains the architecture from the perspective of a page
          request.
        </p>
        <a className="button" href="/labs">
          Open evaluation lab
        </a>
      </div>
      <div className="card">
        <span className="pill">Evidence-first</span>
        <ul className="data-list">
          <li>
            <span>Rendered routes</span>
            <strong>6</strong>
          </li>
          <li>
            <span>Interactive boundaries</span>
            <strong>3</strong>
          </li>
          <li>
            <span>SEO artifact types</span>
            <strong>6</strong>
          </li>
          <li>
            <span>Benchmark dimensions</span>
            <strong>12</strong>
          </li>
        </ul>
      </div>
    </section>
  </main>
))
