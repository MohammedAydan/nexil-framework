import { component, createContext, createContextScope, provideContext } from '@nexil/core'
import { ThemeStore } from '$stores/theme'

const SimpleCtx = createContext<string>('default', 'demo:simple')

export const seo = {
  title: 'Context & StoreContext — Nexil Demo',
  description: 'Hierarchical DI: createContext vs defineStoreContext.',
}

export default component(() => {
  const fallback = ThemeStore.use()
  const simpleFallback = SimpleCtx.use()

  return (
    <div class="space-y-8">
      <header>
        <h1 class="text-3xl font-black tracking-tight text-white">Context Playground</h1>
        <p class="mt-2 text-slate-400">
          React-like `createContext` (value) + Nexil `defineStoreContext` (store).
        </p>
      </header>

      {/* Simple createContext */}
      <section class="rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <h2 class="font-bold text-white">createContext · Simple value</h2>
        <p class="mt-1 text-sm text-slate-400">Nearest Provider wins, fallback is default.</p>
        <p class="mt-3 text-sm text-slate-300">
          Fallback: <b class="text-white">{simpleFallback}</b>
        </p>
        <div class="mt-3 rounded bg-slate-950 p-4 text-sm">
          {(() => {
            const outer = SimpleCtx.Provider({
              value: 'outer',
              children: () => {
                const outerVal = SimpleCtx.use()
                const inner = SimpleCtx.Provider({
                  value: 'inner',
                  children: () => SimpleCtx.use(),
                })
                const after = SimpleCtx.use()
                return `outer=${outerVal} → inner=${inner} → after=${after}`
              },
            })
            return <span class="font-mono text-cyan-400">{String(outer)}</span>
          })()}
        </div>
        <p class="mt-2 text-xs text-slate-500">
          Rendered at SSR time via `Provider` nesting — no JS needed.
        </p>
      </section>

      {/* StoreContext */}
      <section class="rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <h2 class="font-bold text-white">defineStoreContext · Store + Context</h2>
        <p class="mt-1 text-sm text-slate-400">
          `src/stores/theme.ts` — stableId `nexil:store:theme`.
        </p>
        <p class="mt-3 text-sm text-slate-300">
          Fallback mode:{' '}
          <b class={fallback.mode === 'dark' ? 'text-violet-400' : 'text-amber-400'}>
            {fallback.mode}
          </b>{' '}
          · accent {fallback.accent}
        </p>
        <div class="mt-3 flex flex-wrap gap-2">
          <button
            class="rounded bg-white px-3 py-1 text-xs font-bold text-slate-900"
            onClick$={() => fallback.toggle()}
          >
            toggle fallback
          </button>
          <button
            class="rounded bg-cyan-500 px-3 py-1 text-xs font-bold text-slate-950"
            onClick$={() => {
              const custom = ThemeStore.create({ mode: 'dark', accent: 'violet' })
              // Demonstrate Provider with custom value — in real app you'd wrap layout
              console.log('created isolated', custom.mode)
            }}
          >
            create isolated dark
          </button>
        </div>
        <div class="mt-4 rounded bg-slate-950 p-4 text-sm">
          {(() => {
            const outerStore = ThemeStore.create({ mode: 'light', accent: 'cyan' })
            const innerStore = ThemeStore.create({ mode: 'dark', accent: 'pink' })
            const demo = ThemeStore.Provider({
              value: outerStore,
              children: () => {
                const o = ThemeStore.use().mode
                const innerRes = ThemeStore.Provider({
                  value: innerStore,
                  children: () => ThemeStore.use().mode,
                })
                const after = ThemeStore.use().mode
                return `outer=${o} → inner=${innerRes} → after=${after}`
              },
            })
            return <span class="font-mono text-cyan-400">{String(demo)}</span>
          })()}
        </div>
        <p class="mt-2 text-xs text-slate-500">
          `create()` gives a fresh isolated instance per Provider — perfect for per-layout theme.
        </p>
      </section>

      {/* Explicit scope */}
      <section class="rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <h2 class="font-bold text-white">Explicit scope · Edge</h2>
        <pre class="mt-2 overflow-auto rounded bg-slate-950 p-3 text-xs text-cyan-300">
          {`const scope = createContextScope()
const next = provideContext(scope, ThemeStore, ThemeStore.create({mode:'dark'}))
ThemeStore.use(next) // 'dark' — testable without ALS`}
        </pre>
        <p class="mt-2 text-xs text-slate-500">
          For Cloudflare Workers: wrap `fetch` with `runWithScope(ctx.scope, ...)` — see
          `src/stores/theme.ts`.
        </p>
      </section>
    </div>
  )
})
