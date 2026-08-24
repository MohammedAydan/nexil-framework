/** @jsxImportSource @mohammedaydan/jsx-runtime */

import { z } from 'zod'
import { element } from '@mohammedaydan/core'

export const render = { mode: 'isr' as const, revalidate: 60 }

const articleSchema = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  body: z.string().min(1),
})

export const load = async ({ params }: { params: { slug: string } }) => {
  const article = articleSchema.parse({
    slug: params.slug,
    title: `Article: ${params.slug}`,
    description: `An ISR article for ${params.slug}`,
    body: 'This fixture proves dynamic content can remain HTML-first.',
  })
  return { article }
}

export const seo = {
  title: 'Nexis Blog Article',
  description: 'A dynamic ISR blog fixture.',
  canonical: '/blog/example',
  image: '/images/blog-card.webp',
  ogType: 'article',
  jsonLd: { '@type': 'Article', headline: 'Nexis Blog Article' },
}

export default function Article({ article }: { article: z.infer<typeof articleSchema> }) {
  return element('article', {}, element('h1', {}, article.title), element('p', {}, article.body))
}
