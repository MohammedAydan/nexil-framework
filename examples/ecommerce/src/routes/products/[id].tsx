/** @jsxImportSource nexil */

import { z } from 'zod'
import { action, assertTrustedOrigin } from 'nexil/server'
import { element } from '@nexil/core'
import { getProduct } from '../../server/catalog.js'

export const render = { mode: 'isr' as const, revalidate: 30 }

export const addToCart = action({
  validate: (input: unknown) => z.object({ productId: z.string().min(1) }).parse(input),
  authorize: async (context) => assertTrustedOrigin(context.request),
  handle: async (_context, input) => ({ ok: true, productId: input.productId }),
})

export const load = async ({ request, params }: { request: Request; params: { id: string } }) => ({
  product: await getProduct(request, params.id),
})

export const seo = {
  title: 'Nexil Product',
  description: 'An ecommerce compatibility fixture.',
  canonical: '/products/example',
  image: '/images/product.webp',
}

export default function Product({
  product,
}: {
  product: { id: string; name: string; price: number }
}) {
  return element(
    'article',
    {},
    element('h1', {}, product.name),
    element('p', {}, `$${product.price.toFixed(2)}`),
    element('form', { method: 'post' }, element('button', { type: 'submit' }, 'Add to cart')),
  )
}
