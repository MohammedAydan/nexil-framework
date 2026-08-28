export const staticPaths = ['quickstart', 'routing', 'styling']

export default function Documentation({ slug }: { slug?: string }) {
  return (
    <main className="min-h-screen bg-white px-6 py-16 text-slate-950">
      <article className="mx-auto max-w-3xl">
        <p className="text-sm font-bold uppercase tracking-[0.25em] text-indigo-600">Nexil docs</p>
        <h1 className="mt-4 text-5xl font-black tracking-tight">{slug}</h1>
        <p className="mt-6 text-lg leading-8 text-slate-600">
          This page was generated statically from a dynamic route and its params were passed to the
          component.
        </p>
        <a className="mt-8 inline-block font-bold text-indigo-600 hover:text-indigo-500" href="/">
          Return to the practical lab
        </a>
      </article>
    </main>
  )
}
