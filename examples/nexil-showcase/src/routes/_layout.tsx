import type { Child } from 'nexil'

export const metadata = {
  title: 'Nexil / field guide',
  titleTemplate: '%s · Nexil',
  openGraph: { siteName: 'Nexil / field guide' },
}

export default function RootLayout({ children }: { readonly children?: Child }) {
  return (
    <>
      <header className="shell site-header">
        <a className="wordmark" href="/">
          <span className="mark">N</span>
          <span>Nexil / field guide</span>
        </a>
        <nav className="nav" aria-label="Primary navigation">
          <a href="/">Home</a>
          <a href="/features">Features</a>
          <a href="/labs">Labs</a>
          <a href="/docs/architecture">Docs</a>
          <a href="/status">Status</a>
        </nav>
      </header>
      {children}
      <footer className="shell site-footer">
        <span>Built with Nexil / no hydration required</span>
        <span>
          <a href="/">Return home</a>
        </span>
      </footer>
    </>
  )
}
