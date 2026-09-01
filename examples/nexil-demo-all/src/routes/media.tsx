import { component } from '@nexil/core'
import { Link } from '@nexil/core/router'

export const seo = {
  title: 'Media — Nexil Demo',
  description: 'Image optimization, responsive, and CSS.',
}

export default component(() => (
  <div class="space-y-8">
    <header>
      <h1 class="text-3xl font-black tracking-tight text-white">Media & Styling</h1>
      <p class="mt-2 text-slate-400">Tailwind v4 + Nexil CSS + sharp image pipeline.</p>
    </header>

    <section class="rounded-2xl border border-slate-800 bg-slate-900 p-6">
      <h2 class="font-bold text-white">CSS · Tailwind</h2>
      <p class="mt-1 text-sm text-slate-400">
        `src/styles.css` → `@import "tailwindcss"` · `vite.config.ts` has `tailwindcss()`.
      </p>
      <div class="mt-4 grid gap-3 sm:grid-cols-3">
        <div class="rounded-xl bg-gradient-to-br from-cyan-500 to-blue-500 p-4 text-white">
          <p class="text-sm font-bold">Gradient</p>
          <p class="text-xs opacity-80">Tailwind utilities work with SSR class normalization.</p>
        </div>
        <div class="rounded-xl border border-slate-700 bg-slate-800 p-4">
          <p class="text-sm font-bold text-white">Border</p>
          <p class="text-xs text-slate-400">`cn`/`cx` helpers merge classes.</p>
        </div>
        <div class="rounded-xl bg-slate-800 p-4 shadow-lg shadow-cyan-500/10">
          <p class="text-sm font-bold text-white">Shadow</p>
          <p class="text-xs text-slate-400">Shadow + backdrop-blur.</p>
        </div>
      </div>
      <p class="mt-3 text-xs text-slate-500">
        Check <code>pnpm check --budget</code> for CSS budget.
      </p>
    </section>

    <section class="rounded-2xl border border-slate-800 bg-slate-900 p-6">
      <h2 class="font-bold text-white">Images · sharp</h2>
      <p class="mt-1 text-sm text-slate-400">
        Place images in `public/` — build emits WebP/AVIF variants via `sharp` (` vite-plugin` +
        `cli`).
      </p>
      <div class="mt-4 flex flex-wrap gap-4">
        <div class="h-32 w-48 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-500 p-4 text-white">
          <p class="text-xs font-bold uppercase tracking-widest">Demo Image</p>
          <p class="mt-1 text-sm">
            Replace with `&lt;img src="/hero.jpg" /&gt;` — will be optimized.
          </p>
        </div>
        <div class="rounded-xl border border-slate-700 bg-slate-800 p-4 text-sm text-slate-300">
          <p class="font-bold text-white">Pipeline</p>
          <ul class="mt-2 list-disc pl-4 text-xs text-slate-400">
            <li>AVIF + WebP @ requested widths</li>
            <li>Cached in `dist/`</li>
            <li>Budget: `nexil check` warns if oversized</li>
          </ul>
        </div>
      </div>
      <p class="mt-3 text-xs text-slate-500">
        See `examples/nexil-showcase/benchmarks/` for lighthouse + media build.
      </p>
    </section>

    <section class="rounded-2xl border border-slate-800 bg-slate-900 p-6">
      <h2 class="font-bold text-white">SEO</h2>
      <p class="mt-1 text-sm text-slate-400">Each route exports `seo`.</p>
      <pre class="mt-3 overflow-auto rounded bg-slate-950 p-4 text-xs text-cyan-300">
        {`export const seo = { title: 'Media — Nexil Demo', description: '...' }
renderHead(seo) → <title>, <meta name="description">, og:`}
      </pre>
      <p class="mt-2 text-xs text-slate-500">
        Try{' '}
        <Link href="/shop/42" class="underline">
          shop item
        </Link>{' '}
        — has dynamic SEO via loader.
      </p>
    </section>
  </div>
))
