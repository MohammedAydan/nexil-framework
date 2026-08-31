
import { component, state, createContext } from "@nexil/core"

const ThemeCtx = createContext("light", "verify:theme")

export default component(() => {
  const local = state(0)
  const local2 = state(5)
  const resValue = state("pending")
  const loadRes = () => {
    resValue.set("loaded")
  }
  const count = state(0)
  const doubled = state(0)
  const inc = () => { const n = count() + 1; count.set(n); doubled.set(n * 2) }
  const dec = () => { const n = count() - 1; count.set(n); doubled.set(n * 2) }
  const reset = () => { count.set(0); doubled.set(0) }
  const total = state(0)
  const withTax = state(0)
  const add = () => { const n = total() + 1; total.set(n); withTax.set(Number((n * 1.1).toFixed(2))) }
  // persist total for shared navigation via sessionStorage
  if (typeof window !== "undefined") {
    const saved = sessionStorage.getItem("nx-shared-total")
    if (saved) { total.set(Number(saved)); withTax.set(Number((Number(saved)*1.1).toFixed(2))) }
  }
  const addShared = () => { total.set(1); withTax.set(1.1); if (typeof window !== "undefined") sessionStorage.setItem("nx-shared-total", "1") }
  const incLocal = () => local.set(v => v + 1)
  const incBatch = () => { local2.set(v => v + 1); local2.set(v => v + 1) }
  return (
    <main>
      <section data-testid="local">
        <span data-testid="local-value">{local()}</span>
        <button data-testid="local-inc" onClick$={incLocal}>inc local</button>
        <button data-testid="local-batch" onClick$={incBatch}>batch</button>
        <span data-testid="local2-value">{local2()}</span>
      </section>
      <section data-testid="store">
        <span data-testid="counter-value">{count()}</span>
        <span data-testid="counter-doubled">{doubled()}</span>
        <button data-testid="counter-inc" onClick$={inc}>inc counter</button>
        <button data-testid="counter-dec" onClick$={dec}>dec</button>
        <button data-testid="counter-reset" onClick$={reset}>reset</button>
      </section>
      <section data-testid="shared">
        <span data-testid="shared-value">{total()}</span>
        <span data-testid="shared-tax">{withTax()}</span>
        <button data-testid="shared-add" onClick$={addShared}>add shared</button>
      </section>
      <section data-testid="resource">
        <button data-testid="resource-load" onClick$={loadRes}>load</button>
        <span data-testid="resource-value">{resValue()}</span>
      </section>
      <section data-testid="context">
        <span data-testid="ctx-default">{ThemeCtx.use()}</span>
        {ThemeCtx.Provider({ value: "dark", children: () => <span data-testid="ctx-value">{ThemeCtx.use()}</span> })}
      </section>
      <a href="/second" data-nx-link data-testid="link-second">about</a>
    </main>
  )
})
