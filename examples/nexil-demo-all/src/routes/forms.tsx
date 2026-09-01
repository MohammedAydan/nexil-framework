import { component, state } from '@nexil/core'
import { Form, SubmitButton } from '@nexil/core'
import { newsletter } from '../actions/newsletter'

export const seo = { title: 'Forms — Nexil Demo', description: 'Progressive forms with server actions and resumability.' }

export default component(() => {
  const email = state('')
  const result = state('')

  return (
    <div class="space-y-8">
      <header>
        <h1 class="text-3xl font-black tracking-tight text-white">Forms & Actions</h1>
        <p class="mt-2 text-slate-400">Progressive enhancement: works without JS, enhanced with `nexil-forms.js`.</p>
      </header>

      <section class="rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <h2 class="font-bold text-white">Newsletter · Server Action</h2>
        <p class="mt-1 text-sm text-slate-400">`src/actions/newsletter.ts` — validates, then `handle`.</p>
        <Form
          action={newsletter}
          class="mt-4 space-y-3"
          onSubmit$={({ element, event }: any) => {
            // Demo: prevent real submit, show resumable handler
            event.preventDefault()
            const fd = new FormData(element as HTMLFormElement)
            const em = String(fd.get('email') ?? '')
            result.set(`Resumable: ${em} (action would POST to /api/newsletter)`)
          }}
        >
          <div>
            <label class="text-sm font-bold text-slate-200">Email</label>
            <input
              name="email"
              type="email"
              required
              placeholder="you@nexil.dev"
              class="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder:text-slate-500"
              bindValue$={email}
            />
            <p class="mt-1 text-xs text-slate-500">Bound via `bindValue$` — signal → input, input → signal.</p>
          </div>
          <SubmitButton class="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-bold text-slate-950 hover:bg-cyan-400" loadingText="Sending…">
            Subscribe
          </SubmitButton>
        </Form>
        <p class="mt-3 text-sm text-cyan-400" bindText$={result}>
          {result()}
        </p>
        <p class="mt-2 text-xs text-slate-500">
          Without JS: form POSTs to `newsletter` endpoint. With JS: `enhanceForms()` intercepts, adds `aria-busy`, `Idempotency-Key`, handles JSON.
        </p>
      </section>

      <section class="rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <h2 class="font-bold text-white">Resumable Inputs</h2>
        <div class="mt-3 space-y-3">
          <input
            placeholder="Type — updates signal"
            class="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
            bindValue$={email}
          />
          <p class="text-sm text-slate-300">
            You typed: <b class="text-white" bindText$={email}>{email()}</b>
          </p>
        </div>
      </section>
    </div>
  )
})
