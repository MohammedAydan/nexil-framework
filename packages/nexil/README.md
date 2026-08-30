# nexil

Core engine for the Nexil web framework.

## Features

- **Fine-Grained Reactivity:** Atomic signals, proxies, and derived computeds without a Virtual DOM.
- **Zero-VDOM Rendering:** Streamable, sanitized AST-to-HTML serializer with out-of-order Suspense.
- **Resumability:** Client event delegation and dispatcher that executes lazily on user interaction.
- **Fullstack Primitives:** File-based router, navigation, nested layouts, `routeLoader$`, `serverAction$`, and runtime adapters (`node`, `cloudflare`, `deno`).

## Subpaths

- `nexil` — Reactivity, stores, components, HTML/CSS/Media/SEO/Security primitives
- `nexil/jsx-runtime` & `nexil/jsx-dev-runtime` — JSX runtime and element type declarations
- `nexil/client` — Global event delegator, chunk loader, and resumability bootstrap
- `nexil/server` — SSR streaming, request context, actions, and runtime adapters
- `nexil/router` — File-based routing, layout composition, and navigation hooks

## License

MIT
