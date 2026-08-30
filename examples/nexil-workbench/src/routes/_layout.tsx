import { Link } from 'nexil/router'

export default function WorkbenchLayout({ children }: { readonly children: unknown }) {
  return (
    <>
      <a className="skip-link" href="#content">
        Skip to content
      </a>
      <header>
        <Link href="/">Nexil Workbench</Link>
        <nav aria-label="Primary navigation">
          <Link href="/articles/" prefetch="intent">
            Articles
          </Link>
          <Link href="/support/">Support</Link>
        </nav>
      </header>
      <main id="content">{children}</main>
      <footer>Useful server-rendered HTML first.</footer>
    </>
  )
}
