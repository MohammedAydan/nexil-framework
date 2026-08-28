import { useState } from '@nexis/core'
import { cn, cx } from '@nexis/css'

export const seo = {
  title: 'Nexis Practical Lab',
  description: 'A complete Tailwind, SSR, state, and resumability verification app.',
  canonical: 'https://example.test/',
  image: '/social-card.png',
  ogType: 'website',
}

export default function Home() {
  const [count, setCount] = useState(0)
  const featured = true
  return (
    <main className="min-h-screen bg-slate-950 px-6 py-16 text-slate-100 sm:px-10">
      <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <section>
          <p className="mb-4 text-sm font-semibold uppercase tracking-[0.3em] text-cyan-300">
            Practical verification lab
          </p>
          <h1 className="max-w-3xl text-5xl font-black tracking-tight text-white sm:text-7xl">
            Tailwind styles should be visible, not merely suggested.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
            This page verifies that Nexis emits styled SSR HTML, links compiled CSS, and keeps
            interactive handlers resumable.
          </p>
          <div className="mt-8 flex flex-wrap gap-4">
            <button
              className={cx(
                'rounded-xl px-5 py-3 font-bold transition hover:-translate-y-0.5',
                featured ? 'bg-cyan-300 text-slate-950' : 'bg-slate-800 text-white',
              )}
              data-testid="counter"
              onClick$={({ element }) => {
                setCount((value) => value + 1)
                element.textContent = `Clicks: ${count()}`
              }}
            >
              Clicks: {count()}
            </button>
            <a
              className={cn(
                'rounded-xl border border-slate-700 px-5 py-3 font-bold text-slate-200',
                'transition hover:border-cyan-300 hover:text-cyan-200',
              )}
              href="/forms"
            >
              Test generic input events
            </a>
          </div>
        </section>
        <aside
          className="rounded-3xl border border-slate-700 bg-slate-900 p-8 shadow-2xl shadow-cyan-950/30"
          style={{ borderColor: '#155e75' }}
        >
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-cyan-300">
            Runtime matrix
          </p>
          <div className="mt-6 grid gap-3 text-sm">
            {[
              'Tailwind v4 pipeline',
              'SSR class normalization',
              'Lazy click chunk',
              'OpenGraph + Twitter tags',
            ].map((item) => (
              <div
                className="flex items-center gap-3 rounded-xl bg-slate-800/80 px-4 py-3"
                key={item}
              >
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                <span className="text-slate-200">{item}</span>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </main>
  )
}
