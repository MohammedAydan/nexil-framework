import { component, state } from 'nexil'

export const seo = { title: 'engine-test — Nexil', description: 'An HTML-first Nexil starter with one resumable interaction boundary.' }

export default component(() => {
  const count = state(0)
  const increment = ({ element }: { element: HTMLElement }) => {
    const next = count() + 1
    count.set(next)
    element.textContent = 'Count: ' + String(next)
    element.setAttribute('aria-label', 'Incremented counter')
  }

  return (
    <main className="shell">
      <p className="eyebrow">NEXIL · INTERACTIVE STARTER</p>
      <section className="hero"><h1>Ship HTML.<br />Wake only the button.</h1><p id="engine-stamp">Rendered via Nexil SSR Engine. This page is useful before JavaScript; the counter below is a focused resumable boundary.</p></section>
      <section className="panel"><p className="eyebrow">STATE BOUNDARY</p><p><button id="counter-btn" className="button" onClick$={increment}>Count: 0</button></p></section>
    </main>
  )
})
