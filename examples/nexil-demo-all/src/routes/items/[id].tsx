import { element } from '@nexil/core'
import { routeLoader$ } from '@nexil/core/server'

export const useItem = routeLoader$(async (event) => {
  const id = event.params.id as string
  return { id, title: `Product Item #${id}`, inStock: true }
})

export default function ItemPage({ data }: { data?: { id: string; title: string; inStock: boolean } }) {
  return element(
    'div',
    { class: 'space-y-4' },
    element('h1', { class: 'text-2xl font-bold text-indigo-300' }, data?.title ?? 'Product Details'),
    element('p', { class: 'text-slate-300' }, `Status: ${data?.inStock ? 'In Stock' : 'Out of Stock'}`),
  )
}
