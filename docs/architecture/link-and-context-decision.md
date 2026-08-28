# Link and Context architecture decision

> **Status: released in v1.3.0.** The foundational Link and Context work merged through [PR #16](https://github.com/MohammedAydan/nexil-framework/pull/16), and the v1.3.0 release passed its quality and package-publication workflows. This record defines the deliberately narrow contract, including the prefetch-deduplication regression repair. The subsequent v1.3.1 patch corrects Starter's default dependency pin only; it does not change this contract.

## Problem and current baseline

`@nexil/router` renders `Link` as a semantic internal `<a href>`, adds the `data-nx-link` marker, and exposes a `data-nx-prefetch` hint. The conditional browser runtime consumes those markers only as a progressive enhancement; an ordinary link still follows native full-document navigation when JavaScript is unavailable or the request is ineligible. `@nexil/core` exposes `createContext` and explicit `ContextScope` helpers; its synchronous Provider convenience must not be described as a general async ambient request-isolation mechanism.

The framework must add useful in-app navigation and dependency injection without introducing a virtual tree, reconciliation pass, synthetic event layer, or a client-side rendering requirement for SSR/SSG pages.

## Link contract

`Link` remains an anchor in all output modes. It retains its `href`, supports only local absolute paths, and adds an explicit `data-nx-link` marker that opts a page into a small delegated navigation runtime. With JavaScript unavailable, malformed, delayed, or deliberately bypassed, browsers continue normal anchor navigation and crawlers continue receiving complete server-rendered documents.

The runtime will intercept only an unmodified primary click on a same-origin marked anchor. It must bypass modified clicks, middle clicks, `target` links, `download`, `rel="external"`, hash-only navigation, external origins, previously prevented events, and unsupported response types. Any failed fetch, missing `#app` outlet, non-success response, or navigation interruption falls back to `location.assign()` rather than presenting partial or stale content.

For an accepted navigation, it fetches a normal HTML document with an explicit navigation request header, parses it in memory, validates the expected outlet, updates carefully owned document metadata, and uses `replaceChildren()` on the current `#app` outlet. This is a direct, whole-outlet replacement rather than a virtual-DOM diff or a broad DOM morph. It preserves semantic SSR/SSG output, makes failure behavior native, and avoids ambiguous identity retention between pages. The runtime uses `history.pushState`, `popstate`, hash targeting, scroll restoration, request cancellation through `AbortController`, and `document.startViewTransition()` only as a supported enhancement.

`prefetch="intent"` means a single idle-safe in-memory request after hover or focus. `prefetch="viewport"` means an `IntersectionObserver` hint. Responses with `private` or `no-store` cache directives are never retained by the navigation cache. The cache is bounded, same-origin, session-memory only, and is not a replacement for HTTP caching policy.

## State and Context contract

Signals and stores remain the state update mechanism. They notify only subscribers and bindings that explicitly consume them; they never re-run a component tree or diff a virtual tree. Context is dependency injection for passing a public value, including a Signal or Store, through an explicit lifetime. It does not by itself make arbitrary state globally persistent or serializable.

An explicitly captured `createStore(initial, 'global')` keeps its serializable browser entry across successful Link outlet replacements within the current document. Other captured Store lifetimes are disposed with the outgoing route bindings. This is not server-global state, session persistence, data privacy, or request isolation; refresh clears it unless an application deliberately persists and validates safe public data.

The public API keeps `createContext(defaultValue)` and offers a concise `use()` alias alongside the existing `useContext()`. `Provider` remains a structural function that scopes a value for its child computation. The explicit `ContextScope` contract allows an adapter or test to create a scope, derive a nested scope, and execute a computation against that scope without a process-global stack.

The synchronous `Provider` convenience is valid only for synchronous child resolution. Async SSR must run through a request-owned context scope supplied by the renderer or server adapter. Current CLI SSR/SSG wiring creates and passes that scope explicitly; other adapters must pass an equivalent isolated scope explicitly. No request-private context value may be serialized to a browser boundary.

## Runtime coordination

The build emits the navigation runtime only if output contains `data-nx-link`. Existing delegated resumability events continue working after an outlet swap. A build aggregates opaque ScopeRef payloads into one common `nexil-state.js` asset, which is loaded before its relevant runtime; opaque scope keys remain opaque in the live DOM. The bindings runtime exposes a narrow refresh/dispose hook so an outlet replacement removes old Signal subscriptions before binding the incoming subtree. The progressive Form event listener remains delegated and does not need a per-page reinstallation.

## Evidence recorded for v1.3.0

| Area                 | Local evidence before review                                                                                                                                                            |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Semantic fallback    | SSR/SSG HTML contains ordinary internal anchors; Playwright verifies native navigation with JavaScript disabled.                                                                        |
| Interception rules   | Playwright verifies modifier, middle, external-origin, download, target, and hash-only clicks do not issue a delegated navigation fetch.                                                |
| Navigation lifecycle | Playwright verifies push/back/forward, top-scroll behavior, aborted stale requests, non-HTML fallback, and synthetic persisted `pageshow` cleanup.                                      |
| Rendering            | Playwright verifies a direct `#app` replacement while a window value survives, with no client component renderer or VDOM runtime introduced.                                            |
| State                | Core, CLI, Vite, and browser tests prove explicit scope nesting, per-route SSG scope isolation, direct bindings after a swap, and explicit Store `global` persistence across that swap. |
| Performance          | Static routes without Link receive no navigation runtime; the build records 1,864 gzip bytes for the current runtime and `nexil check` enforces a 6 KiB limit.                          |

## Non-goals for the first release

This work does not introduce a client-side component renderer, route loaders that replace HTML navigation, arbitrary DOM morphing, offline navigation, persistent global state across sessions, automatic store serialization, server authorization, or a claim that a Context value is private merely because it is scoped.
