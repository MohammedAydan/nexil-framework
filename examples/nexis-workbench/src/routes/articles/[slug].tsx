import { notFound } from '@mohammedaydan/server'
import { getArticle, articles } from '../../lib/articles'

export async function getStaticPaths() {
  return articles.map((article) => ({ params: { slug: article.slug } }))
}

export default function Article({ slug }: { readonly slug?: string }) {
  // The CLI also inspects the route template itself. Real matched requests always provide params.
  if (!slug)
    return (
      <article>
        <h1>Article route</h1>
        <p>A matched article renders from a validated static slug.</p>
      </article>
    )
  const article = getArticle(slug)
  if (!article) return notFound('Article not found')
  return (
    <article>
      <h1>{article.title}</h1>
      <p>{article.summary}</p>
    </article>
  )
}
