export const seo = {
  title: 'Nexil Forms Lab',
  description: 'Generic resumable input and submit event verification.',
}

export default function Forms() {
  return (
    <main className="min-h-screen bg-slate-900 px-6 py-16 text-slate-100">
      <div className="mx-auto max-w-2xl">
        <a className="text-sm font-semibold text-cyan-300 hover:text-cyan-200" href="/">
          ← Back to lab
        </a>
        <h1 className="mt-8 text-4xl font-black tracking-tight">Generic event lab</h1>
        <p className="mt-3 text-slate-300">
          Input and submit handlers are extracted just like click handlers.
        </p>
        <form
          className="mt-8 rounded-3xl border border-slate-700 bg-slate-950 p-6 shadow-xl"
          onSubmit$={({ element, event }) => {
            event.preventDefault()
            element.dataset.submitted = 'true'
            element.querySelector('[data-result]')!.textContent = 'Submitted without hydration'
          }}
        >
          <label className="block text-sm font-bold text-slate-200" htmlFor="message">
            Message
          </label>
          <input
            className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none focus:border-cyan-300"
            id="message"
            name="message"
            placeholder="Type to test onInput$"
            onInput$={({ element, event }) => {
              const input = event.currentTarget as HTMLInputElement
              element.parentElement!.querySelector('[data-preview]')!.textContent = input.value
            }}
          />
          <p className="mt-3 text-sm text-slate-400">
            Preview: <span className="text-cyan-200" data-preview />
          </p>
          <button
            className="mt-6 rounded-xl bg-cyan-300 px-5 py-3 font-bold text-slate-950 hover:bg-cyan-200"
            type="submit"
          >
            Submit
          </button>
          <p className="mt-4 text-sm text-emerald-300" data-result>
            Waiting for submit
          </p>
        </form>
      </div>
    </main>
  )
}
