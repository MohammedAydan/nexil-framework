import { component, state } from '@nexil/core'

export const seo = { title: 'Scope State Proof', description: 'Resumable closure state' }

export default component(() => {
  const count = state(0)
  const increment = () => {
    count.set((current) => current + 1)
  }
  return (
    <main className="scope-proof">
      <h1 id="engine-stamp">Rendered via Nexil SSR Engine</h1>
      <output id="scope-value">{count()}</output>
      <button
        id="scope-btn"
        onClick$={increment}
      >
        increment
      </button>
    </main>
  )
})
