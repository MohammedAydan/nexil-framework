# 22 — Glossary

| Term                        | Definition                                                                                                            |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Action**                  | A server-owned operation exposed through a validated request endpoint.                                                |
| **Atom**                    | An XML syndication format emitted by the feed generator.                                                              |
| **Bootstrap**               | The small client entry that discovers Nexis metadata and loads interaction handlers.                                  |
| **Boundary**                | The smallest tree or scope that needs client behavior or a lifecycle owner.                                           |
| **Canonical URL**           | The preferred absolute URL for one page.                                                                              |
| **Computed**                | A memoized reactive value derived from signals or other tracked sources.                                              |
| **Delegated event**         | An event handled at a common ancestor and resolved through Nexis metadata.                                            |
| **Effect**                  | A reactive computation intended for an external side effect and cleanup.                                              |
| **Fetch handler**           | A function receiving a web-standard `Request` and returning a `Response`.                                             |
| **ISR**                     | Incremental Static Regeneration: cached route output revalidated under an explicit policy.                            |
| **Idempotency key**         | A client-provided key used to avoid executing a retryable mutation more than once.                                    |
| **JSON-LD**                 | JSON serialization of structured data using Schema.org-style types and properties.                                    |
| **Lazy handler**            | An interaction function loaded only when the corresponding event occurs.                                              |
| **Manifest**                | Build metadata mapping routes, assets, handlers, scopes, and generated files.                                         |
| **Origin check**            | A server-side comparison of a request’s Origin against an explicit allowlist.                                         |
| **Progressive enhancement** | Building a useful native HTML experience first, then adding client behavior.                                          |
| **Resumability**            | Continuing an interaction from serialized server output without rerunning the entire application during startup.      |
| **RSS**                     | A feed format emitted as `feed.xml` when feed configuration and items exist.                                          |
| **Scope**                   | A lifetime and namespace for captured values, signals, stores, handlers, and cleanup.                                 |
| **ScopeRef**                | A typed reference that identifies a value or resource in a resumable client scope.                                    |
| **Signal**                  | A readable and writable reactive value with subscriptions and disposal.                                               |
| **Store**                   | A serializable state abstraction with `value`, `snapshot`, `set`, selectors, subscriptions, and disposal.             |
| **Static route**            | A route rendered during the build and served without route-specific JavaScript.                                       |
| **Telemetry**               | Optional client and server measurement, including Web Vitals events and a receiver.                                   |
| **Trusted proxy**           | A reverse proxy whose forwarded headers are sanitized before the application trusts them.                             |
| **Web Vitals**              | Browser performance signals such as LCP, CLS, and INP; field collection requires a real telemetry policy.             |
| **Vite plugin**             | The compiler integration that transforms Nexis source and emits route, handler, and manifest metadata.                |
| **Hydration**               | A client startup process that reconstructs behavior from server HTML; Nexis minimizes this work through resumability. |
| **Rendering mode**          | The route policy: static, server, or ISR.                                                                             |
| **Picture markup**          | Responsive HTML using `<picture>`, `<source>`, and a fallback `<img>`.                                                |
| **OG image**                | An Open Graph preview image generated for link sharing.                                                               |
| **Content-addressed cache** | A cache keyed by source bytes and transform options so identical inputs reuse outputs.                                |
| **Runtime parity**          | Evidence that equivalent routes and responses behave consistently across supported runtimes.                          |
| **Lab measurement**         | A controlled local measurement such as Lighthouse, distinct from real-user field data.                                |
| **Internal baseline**       | A checked-in comparable fixture used for an engineering comparison, not an official third-party benchmark.            |

When a term has a version-specific meaning, prefer the current package declarations and release notes over this summary.
