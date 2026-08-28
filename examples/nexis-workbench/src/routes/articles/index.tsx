import { Link } from '@nexis/router'
import { articles } from '../../lib/articles'

export const seo = {
  title: 'Workbench articles',
  description: 'Public Nexis Workbench articles.',
}

export default function ArticlesIndex() {
  return (
    <section>
      <h1>Articles</h1>
      <ul>
        {articles.map((article) => (
          <li>
            <Link href={`/articles/${article.slug}/`}>{article.title}</Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
