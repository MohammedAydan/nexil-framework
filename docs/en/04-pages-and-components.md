# 04 — Pages and Components

## A route page

A page is a URL unit responsible for composing content, data, metadata, and interaction boundaries. Keep routes thin: load data, pass validated results to components, and define the page metadata and render mode.

```tsx
// src/routes/products.tsx
import { ProductGrid } from '../components/ProductGrid.js'
import { getProducts } from '../lib/server/products.js'

export default async function ProductsPage() {
  const products = await getProducts()
  return (
    <main>
      <h1>Products</h1>
      <ProductGrid products={products} />
    </main>
  )
}
```

## Static components

A static component has no events, signals, or browser APIs. Keep it focused and reusable.

```tsx
interface CardProps {
  readonly title: string
  readonly description: string
  readonly href: string
}

export function Card({ title, description, href }: CardProps) {
  return (
    <article className="card">
      <h2>
        <a href={href}>{title}</a>
      </h2>
      <p>{description}</p>
    </article>
  )
}
```

## Interactive components

An interactive component should be small and focused. Do not make an entire layout interactive because one button needs state. Extract the button into its own component and use a lazy handler.

```tsx
import { state } from '@mohammedaydan/reactivity'

export function Counter() {
  const count = state(0)
  return (
    <button
      data-nx-state={count.value}
      onClick$={() => {
        count.set((previous) => previous + 1)
      }}
    >
      Count: {count.value}
    </button>
  )
}
```

The `$` suffix signals that the behavior should be analyzed and emitted as a lazy chunk. Keep the handler small and pass values that can be classified and serialized.

## Props

Define props with an interface and use `readonly` for values the component does not mutate. Validate data from users or APIs before putting it into markup.

```tsx
interface UserBadgeProps {
  readonly name: string
  readonly role?: string
}

export function UserBadge({ name, role = 'member' }: UserBadgeProps) {
  return (
    <span aria-label={`User ${name}`}>
      {name} — {role}
    </span>
  )
}
```

## Async components

A route or server component may be `async` when it needs data. Do not pass unresolved promises directly to the DOM; let the renderer handle asynchronous children.

```tsx
export async function LatestPosts() {
  const posts = await loadLatestPosts()
  return (
    <ul>
      {posts.map((post) => (
        <li key={post.id}>{post.title}</li>
      ))}
    </ul>
  )
}
```

## Composition

Divide a page into meaningful regions such as Header, Navigation, Main, Sidebar, and Footer. Do not turn every `div` into a file. A good component isolates a clear responsibility and owns a stable props interface.

## Recommended rules

| Rule                | Application                                           |
| ------------------- | ----------------------------------------------------- |
| HTML first          | Emit essential content without waiting for JavaScript |
| Local interaction   | Put `$` on the smallest possible handler              |
| Validated data      | Type API results before rendering them                |
| No secrets in props | Never pass keys or tokens into JSX                    |
| Accessibility       | Use semantic elements and keyboard support            |
| Real links          | Use `<a href>` for navigation and enhancement         |
| Performance         | Do not ship a large library for a small control       |

## Accessibility

Use `button` for actions and `a` for navigation. Give every input a label, use `aria-live` for asynchronous result messages, and do not communicate state through color alone. Test keyboard navigation and narrow viewports in Playwright.

## Common mistakes

- Making the entire page interactive because a small region needs state.
- Putting database access inside a component that may enter the client bundle.
- Passing a complex object or closure into `ScopeRef` and expecting it to be reconstructed.
- Using `innerHTML` with user-provided text.
- Replacing real links with navigation that works only after JavaScript loads.
