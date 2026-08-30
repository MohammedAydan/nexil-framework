import axios from 'axios'
import { sql } from 'drizzle-orm'
import { z } from 'zod'
import { createDataContext, data } from 'nexil/server'

export const productSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  price: z.number().nonnegative(),
})

export const catalogQuery = sql`select id, name, price from products where id = ${'parameterized'}`

export async function getProduct(request: Request, id: string) {
  const context = createDataContext(request)
  return data(context, `product:${id}`, async () => {
    const response = await axios.get(
      `https://catalog.example.test/products/${encodeURIComponent(id)}`,
    )
    return productSchema.parse(response.data)
  })
}
