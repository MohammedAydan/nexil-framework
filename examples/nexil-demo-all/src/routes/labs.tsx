import { component, state, computed, effect, resource, batch, For, Show } from '@nexil/core'

export const seo = { title: 'Labs — Nexil Demo', description: 'Resource, effect, watch, batch, and resumability labs.' }

export default component(() => {
  const count = state(0)
  const doubled = computed(() => count() * 2)
  const logs = state<string[]>([])

  // resource demo (simulated fetch)
  const user = resource<{ name: string }>(async () => {
    await new Promise((r) => setTimeout(r, 300))
    return { name: 'Ada' }
  })

  effect(() => {
    const c = count()
    logs.set((prev) => [...prev.slice(-4), `effect: count=${c} at ${new Date().toLocaleTimeString()}`])
  })

  return (
    <div class="space-y-8">
      <header>
        <h1 class="text-3xl font-black tracking-tight text-white">Labs</h1>
        <p class="mt-2 text-slate-400">Playground for `resource`, `effect`, `batch`, `computed` cycles, and `For`/`Show`.</p>
      </header>

      <section class="rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <h2 class="font-bold text-white">Computed & Batch</h2>
        <p class="mt-2 text-sm text-slate-300">
          count <b bindText$={count}>{String(count())}</b> · doubled{' '}
          <b class="text-cyan-400" bindText$={doubled}>
            {String(doubled())}
          </b>
        </p>
        <div class="mt-3 flex flex-wrap gap-2">
          <button class="rounded bg-cyan-500 px-3 py-1 text-xs font-bold text-slate-950" onClick$={() => count.set((v) => v + 1)}>
            +1
          </button>
          <button
            class="rounded bg-slate-800 px-3 py-1 text-xs text-white"
            onClick$={() =>
              batch(() => {
                count.set(10)
                // second set in same batch coalesces
                count.set((v) => v + 5)
              })
            }
          >
            batch → 15
          </button>
          <button class="rounded bg-slate-800 px-3 py-1 text-xs text-white" onClick$={() => count.set(0)}>
            reset
          </button>
        </div>
        <div class="mt-4 rounded bg-slate-950 p-3 text-xs text-slate-400">
          <p class="font-bold text-slate-200">Effect log (last 5):</p>
          <For each={logs()}>
            {(line: string) => <div class="font-mono text-cyan-300">{line}</div>}
          </For>
        </div>
      </section>

      <section class="rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <h2 class="font-bold text-white">Resource · Async</h2>
        <p class="mt-1 text-sm text-slate-400">`resource(() =&gt; fetch(...))` with `loading`/`error`/`refetch`.</p>
        <div class="mt-3 text-sm">
          <Show when={user.loading()}>
            <p class="text-amber-400">Loading…</p>
          </Show>
          <Show when={user.error()} fallback={<p class="text-slate-300">User: {user()?.name ?? '—'}</p>}>
            <p class="text-red-400">Error: {String(user.error()?.message)}</p>
          </Show>
        </div>
        <button class="mt-3 rounded bg-white px-3 py-1 text-xs font-bold text-slate-900" onClick$={() => user.refetch()}>
          refetch
        </button>
      </section>

      <section class="rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <h2 class="font-bold text-white">For & Show</h2>
        <div class="mt-3 space-y-2 text-sm">
          <For each={['Alpha', 'Beta', 'Gamma']}>
            {(item: string) => <div class="rounded bg-slate-800 px-3 py-2 text-slate-200">{item}</div>}
          </For>
          <Show when={count() > 3} fallback={<p class="text-slate-500">Count ≤ 3 — keep clicking</p>}>
            <p class="text-emerald-400">Count &gt; 3 — condition met!</p>
          </Show>
        </div>
      </section>

      <section class="rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <h2 class="font-bold text-white">Resumability Check</h2>
        <p class="mt-1 text-sm text-slate-400">Every button above is `onClick$` — inspect HTML for `data-nx-scope` and lazy chunks.</p>
        <pre class="mt-3 overflow-auto rounded bg-slate-950 p-3 text-xs text-cyan-300">{`pnpm check
pnpm build
# check dist/client/index.html for <script id="__NEXIL_STORES__"> and data-nx-store-bind`}</pre>
      </section>
    </div>
  )
})
