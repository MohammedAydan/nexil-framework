import { component } from '@mohammedaydan/core'

export const staticPaths = ['architecture', 'resumability', 'performance']
export const seo = {
  title: 'Nexis Documentation — Architecture note',
  description: 'Static documentation generated from a dynamic Nexis route.',
  canonical: 'https://nexis-showcase.example/showcase/docs',
  type: 'article' as const,
  jsonLd: { '@context': 'https://schema.org', '@type': 'TechArticle', name: 'Nexis Documentation' },
}

const notes: Record<string, { title: string; copy: string; signal: string }> = {
  architecture: {
    title: 'The request is the composition root',
    copy: 'A request enters the route graph, resolves a page, renders its document, and leaves a small resumability boundary behind.',
    signal: 'route → render → document',
  },
  resumability: {
    title: 'Interaction is a file, not a framework boot',
    copy: 'A dollar event becomes a validated import reference. The browser fetches the chunk after intent, then runs it against the matched element.',
    signal: 'attribute → chunk → action',
  },
  performance: {
    title: 'Measure bytes at the boundary',
    copy: 'The useful performance unit is not a framework score. It is the HTML, CSS, bootstrap, and event chunk a reader actually receives.',
    signal: 'HTML → CSS → intent',
  },
}

export default component(({ slug }: { slug?: string }) => {
  const note = notes[slug ?? 'architecture'] ?? notes.architecture
  return (
    <>
      <header className="shell site-header">
        <a className="wordmark" href="/">
          <span className="mark">N</span>
          <span>Nexis / field guide</span>
        </a>
        <nav className="nav" aria-label="Primary navigation">
          <a href="/">Home</a>
          <a href="/features">Features</a>
          <a href="/labs">Labs</a>
        </nav>
      </header>
      <main className="shell">
        <section className="hero">
          <div>
            <p className="eyebrow">Docs / {slug ?? 'architecture'}</p>
            <h1>{note.title}</h1>
            <p className="lede">{note.copy}</p>
            <div className="button-row">
              <a className="button" href="/labs">
                Run the lab
              </a>
              <a className="button secondary" href="/">
                Back to showcase
              </a>
            </div>
          </div>
          <div className="console">
            <div className="dim">$ nexis route inspect</div>
            <div className="good">pattern: /docs/:slug</div>
            <div>static path: {slug ?? 'architecture'}</div>
            <div>render mode: SSG + SSR</div>
            <div className="warn">signal: {note.signal}</div>
          </div>
        </section>
      </main>
      <footer className="shell site-footer">
        <span>Dynamic route / static path expansion</span>
        <span>
          <a href="/features">Feature map</a>
        </span>
      </footer>
    </>
  )
})
