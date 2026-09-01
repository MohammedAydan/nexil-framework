import { component } from '@nexil/core'
import { Link } from '@nexil/core/router'

export const seo = { title: 'About — Nexil Demo', description: 'What Nexil is and why HTML-first.' }

export default component(() => (
  <div class="space-y-8">
    <header>
      <h1 class="text-3xl font-black tracking-tight text-white">About Nexil</h1>
      <p class="mt-2 max-w-2xl text-slate-400">
        Nexil is an <strong class="text-white">HTML-first, resumable</strong> TypeScript framework. Server renders streaming HTML with fine-grained signals; browser wakes only the button you click — zero hydration.
      </p>
    </header>

    <section class="grid gap-6 lg:grid-cols-2">
      <div class="rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <h2 class="font-bold text-white">Four Principles</h2>
        <ul class="mt-3 space-y-2 text-sm text-slate-300">
          <li>
            <span class="font-bold text-cyan-400">Fine-Grained</span> — O(1) DOM via `Signal` + `lens` + `Proxy`, no VDOM
          </li>
          <li>
            <span class="font-bold text-cyan-400">Zero-Hydration</span> — `__NEXIL_STORES__` snapshot, `data-nx-store-bind` bindings, lazy chunks on `onClick$`
          </li>
          <li>
            <span class="font-bold text-cyan-400">Serializable</span> — `isSerializable` guards at every `set`/proxy
          </li>
          <li>
            <span class="font-bold text-cyan-400">Isolated</span> — `AsyncLocalStorage` + explicit `ContextScope` for Cloudflare/Deno
          </li>
        </ul>
      </div>

      <div class="rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <h2 class="font-bold text-white">Stack</h2>
        <pre class="mt-3 overflow-auto rounded bg-slate-950 p-4 text-xs text-cyan-300">
          {`nexil (core) — @nexil/core, @nexil/vite-plugin, @nexil/cli, create-nexil
TypeScript 5.8 · Vite 7 · Tailwind 4 · pnpm 10
Build: tsc -b + vite + esbuild chunks`}
        </pre>
        <div class="mt-4 flex gap-2">
          <Link href="/" class="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-bold text-slate-950">
            ← Home
          </Link>
          <Link href="/stores" class="rounded-lg border border-slate-700 px-4 py-2 text-sm font-bold text-slate-200">
            Stores →
          </Link>
        </div>
      </div>
    </section>

    <section class="rounded-2xl border border-slate-800 bg-slate-900 p-6">
      <h2 class="font-bold text-white">Docs</h2>
      <div class="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        <a href="https://github.com/MohammedAydan/nexil-framework" class="rounded-xl border border-slate-700 bg-slate-800 p-4 hover:border-cyan-400">
          <p class="font-bold text-white">GitHub</p>
          <p class="text-xs text-slate-400">Source, issues, and releases</p>
        </a>
        <div class="rounded-xl border border-slate-700 bg-slate-800 p-4">
          <p class="font-bold text-white">Local Guides</p>
          <p class="text-xs text-slate-400">See `NEXIL-STATE-INTERNALS.md` & `GUIDE-PROGRAMMEUR-ETAT.md` in repo</p>
        </div>
      </div>
    </section>
  </div>
))
