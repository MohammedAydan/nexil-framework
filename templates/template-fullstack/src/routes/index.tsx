import { element } from '@nexil/core'
import { state } from '@nexil/reactivity'
import { routeLoader$, serverAction$ } from 'nexil/server'

export const useServerTime = routeLoader$(async (event) => {
  return { time: new Date().toISOString(), host: event.url.host }
})

export const updateName = serverAction$(async (input: { name: string }) => {
  return { success: true, greeting: `Hello, ${input.name}!` }
})

export default function HomePage({ data }: { data?: { time: string; host: string } }) {
  const count = state(0)
  return element(
    'div',
    { class: 'space-y-6' },
    element('h1', { class: 'text-3xl font-bold' }, 'Fullstack Nexil Application'),
    element('p', { class: 'text-slate-300' }, `Server Rendered at: ${data?.time ?? 'Live'}`),
    element(
      'div',
      { class: 'p-4 rounded bg-slate-800 border border-slate-700 space-y-2' },
      element('h2', { class: 'text-xl font-semibold' }, 'Fine-Grained Reactive Counter'),
      element(
        'button',
        {
          class: 'px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded font-medium text-white',
          onClick$: () => {
            count.set(count() + 1)
          },
        },
        `Count: ${count()}`,
      ),
    ),
  )
}
