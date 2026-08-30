# 18 — Complete Example

This chapter assembles the patterns from the previous guides into a small documentation site with a home page, article route, interactive search, contact Action, media variants, SEO output, and runtime deployment.

## 1. Create the project

```bash
pnpm dlx create-nexil@0.2.0 my-docs --yes --ts
cd my-docs
pnpm install
```

Use the current release selected by the project generator and commit the generated lockfile. Check the generated package scripts before changing them.

## 2. Suggested structure

```text
my-docs/
├── src/
│   ├── routes/
│   │   ├── index.tsx
│   │   └── docs/[slug].tsx
│   ├── components/
│   │   ├── Header.tsx
│   │   └── SearchBox.tsx
│   ├── actions/
│   │   └── contact.ts
│   ├── styles/
│   └── app.config.ts
├── public/
│   └── images/
└── package.json
```

## 3. Server-rendered page

```tsx
export default function Home() {
  return (
    <main>
      <h1>Product documentation</h1>
      <p>HTML-first documentation with small interactive boundaries.</p>
      <a href="/docs/getting-started">Read the guide</a>
    </main>
  )
}
```

The heading, description, and link exist in the initial HTML. A visitor can read and navigate without JavaScript.

## 4. Interactive search

```tsx
import { state } from '@nexil/core'

export function SearchBox({ initialQuery = '' }: { readonly initialQuery?: string }) {
  const query = state(initialQuery)
  const searching = state(false)

  return (
    <form action="/search" method="get" onSubmit$={() => searching.set(true)}>
      <label for="q">Search</label>
      <input id="q" name="q" bindValue$={query} aria-describedby="search-status" />
      <button type="submit" bindDisabled$={searching}>
        Search
      </button>
      <p id="search-status" aria-live="polite">
        {searching() ? 'Searching…' : 'Enter a term'}
      </p>
    </form>
  )
}
```

The native GET form remains the fallback. `bindValue$` keeps the input property synchronized with the Signal, `bindDisabled$` updates only the button property, and the direct `{searching()}` read becomes a fine-grained text binding. No component rerender or virtual-DOM reconciliation is needed.

## 5. Article route

The article route should validate `slug`, load only the requested article, and render a canonical URL based on the actual pathname. Unknown slugs should return a real 404 rather than an empty success page.

```tsx
export async function DocsPage({ params }: { readonly params: { slug: string } }) {
  const article = await getPublishedArticle(params.slug)
  if (!article) return notFound()

  return (
    <article>
      <h1>{article.title}</h1>
      <p>{article.description}</p>
      <div>{article.html}</div>
    </article>
  )
}
```

Escape or sanitize `article.html` according to its trusted-source policy. Do not treat Markdown supplied by an arbitrary user as safe HTML.

## 6. Contact Action

```ts
export const submitContact = action(async ({ request }) => {
  const form = await request.formData()
  const email = String(form.get('email') ?? '')
  const message = String(form.get('message') ?? '')

  if (!email.includes('@') || message.length < 10) {
    return { ok: false, errors: [{ field: 'form', message: 'Check the form fields.' }] }
  }

  await saveContactMessage({ email, message })
  return { ok: true, data: { received: true } }
})
```

In production, add Origin validation, authentication or rate limits as required, an idempotency policy where retries can duplicate work, and a safe error boundary.

## 7. Media

Generate variants during the build and render them with `pictureMarkup` or equivalent markup. Keep source files under version control and generated files in the build output or a cache.

```tsx
<picture>
  <source srcSet="/images/team-640.avif" type="image/avif" />
  <source srcSet="/images/team-640.webp" type="image/webp" />
  <img src="/images/team-640.jpg" width="640" height="360" alt="The documentation team" />
</picture>
```

## 8. SEO configuration

```ts
export const metadata = {
  title: 'Product documentation',
  description: 'Guides for building with Nexil.',
  canonical: 'https://docs.example.com/',
}
```

Generate sitemap, robots, RSS, and Atom from the same published route inventory. Add JSON-LD only when it describes visible content.

## 9. Deployment

```bash
pnpm build
pnpm typecheck
pnpm test
pnpm test:e2e
```

For Node, run `@nexil/serve`. For Deno or Cloudflare, use the corresponding Fetch adapter. Set `NEXIL_TRUST_PROXY=1` only when the deployment has a trusted header-sanitizing proxy.

## 10. Verification matrix

| Area        | Verification                                                        |
| ----------- | ------------------------------------------------------------------- |
| Rendering   | Home and article HTML contain essential content                     |
| Interaction | Search loads its handler and updates status                         |
| Forms       | Contact works with and without JavaScript                           |
| Routing     | Unknown slug returns 404; unsupported method returns 405            |
| SEO         | Head, canonical, sitemap, robots, RSS, and Atom are valid           |
| Media       | Variants exist, dimensions are present, and fallback works          |
| Security    | Invalid input, Origin, redirects, and traversal are rejected        |
| Performance | Client budget and Lighthouse gates pass in the recorded environment |
| Operations  | Logs omit secrets and health checks work                            |

This example is a pattern, not a claim that every generated project has these exact helper names. Always inspect the current release declarations and generated template.
