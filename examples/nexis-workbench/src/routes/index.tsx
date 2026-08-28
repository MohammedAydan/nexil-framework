import { Link } from '@nexil/router'
import { ArticleFilter } from '../components/article-filter'

export const seo = {
  title: 'Nexil Workbench',
  description:
    'A production-oriented Nexil example with server-rendered HTML and narrow browser boundaries.',
}

export default function Home() {
  return (
    <section>
      <p>HTML-first production example</p>
      <h1>Useful documentation before JavaScript.</h1>
      <p>
        Read articles without a client app, then use one focused interactive boundary when it helps.
      </p>
      <Link href="/articles/">Read the articles</Link>
      <ArticleFilter />
    </section>
  )
}
