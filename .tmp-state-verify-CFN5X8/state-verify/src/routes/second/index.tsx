
import { component, state } from "@nexil/core"
export default component(() => {
  const total = state(0)
  if (typeof window !== "undefined") {
    const saved = sessionStorage.getItem("nx-shared-total")
    if (saved) total.set(Number(saved))
  }
  return <main><span data-testid="second-shared">{total()}</span><a href="/" data-nx-link data-testid="link-home">home</a></main>
})
