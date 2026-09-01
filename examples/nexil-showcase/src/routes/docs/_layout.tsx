import type { Child } from '@nexil/core'

export const metadata = {
  titleTemplate: '%s · Docs · Nexil',
  openGraph: { siteName: 'Nexil / field guide' },
}

export default function DocsLayout({ children }: { readonly children?: Child }) {
  return (
    <div className="shell docs-layout">
      <aside className="docs-sidebar" aria-label="Documentation navigation">
        <p className="eyebrow">Documentation</p>
        <nav className="docs-nav">
          <a href="/docs/architecture">Architecture</a>
          <a href="/docs/resumability">Resumability</a>
          <a href="/docs/performance">Performance</a>
        </nav>
      </aside>
      <div className="docs-content">{children}</div>
    </div>
  )
}
