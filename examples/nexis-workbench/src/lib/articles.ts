export const articles = [
  {
    slug: 'first-boundary',
    title: 'Find the first boundary',
    summary: 'Keep browser behavior limited to the smallest control that needs it.',
  },
  {
    slug: 'release-check',
    title: 'Prove the release',
    summary: 'Treat generated output, tests, and deploy configuration as one release artifact.',
  },
] as const

export function getArticle(slug: string) {
  return articles.find((article) => article.slug === slug)
}
