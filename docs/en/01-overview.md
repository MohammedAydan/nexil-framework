# 01 — Nexil Framework Overview

## What is Nexil?

Nexil Framework is a TypeScript web framework for applications that render useful HTML on the server and ship JavaScript only to the parts that require interaction. Its central design is to separate **content output** from **behavior execution**: a page remains indexable and useful without JavaScript, while interactive behavior is loaded when the user actually needs it.

This model fits marketing sites, blogs, documentation, dashboards, stores, product pages, and content applications where first HTML, JavaScript size, and server control matter.

## Request lifecycle

For an HTTP request, the Router selects a route, the Renderer receives the requested render mode, and the result becomes HTML. The Compiler records interaction boundaries, binding markers, and `ScopeRef` metadata. The CLI writes the final files. In the browser, the event bootstrap delegates events and loads required chunks, while the isolated binding runtime subscribes Signals and updates only their target DOM nodes or properties.

```text
Request
  │
  ▼
Router ──► Route module ──► Renderer ──► HTML + metadata
                                  │
                                  ▼
                           Compiler / Vite plugin
                                  │
                                  ▼
             static files, bootstrap, lazy chunks, assets
                                  │
                                  ▼
Browser event ──► event bootstrap ──► lazy chunk ──► handler
                   │
                   └── binding runtime ──► Signal effect ──► target DOM node/property
```

## Main capabilities

| Capability         | Benefit                                                             |
| ------------------ | ------------------------------------------------------------------- |
| SSR, SSG, and ISR  | Choose output behavior per page                                     |
| Resumability       | Load interaction instead of hydrating the whole app                 |
| Fine-grained DOM   | Update one text node or scalar property without rerendering         |
| ScopeRef           | Transfer state and action references through a safe ABI             |
| Typed actions      | Process forms with validation, origin checks, and replay protection |
| File-based routing | Map `src/routes` modules to predictable URLs                        |
| CSS extraction     | Keep static pages independent from runtime JavaScript               |
| SEO APIs           | Head, canonical, JSON-LD, sitemap, robots, and feeds                |
| Production server  | Node server with 404, 405, HEAD, and cache semantics                |
| Runtime parity     | Fetch-compatible Deno and Cloudflare handlers                       |
| Performance gates  | Bootstrap, chunk, Lighthouse, and client-budget checks              |

## When to use Nexil

Use Nexil when first HTML, indexing, JavaScript size, or server control is important. It is particularly effective for sites with many static or semi-static pages and a limited number of interactive islands.

It can also support browser-heavy applications, but the architecture should still define clear interactive boundaries. For a canvas-heavy application or a full client application with no useful pre-JavaScript content, the benefits of an HTML-first design may be smaller.

## The right design question

Do not begin with, “How do I make the entire page a client application?” Begin with:

1. Which content must arrive as HTML?
2. What is the smallest part that needs browser code?

The smaller the interaction boundary, the more value you get from Nexil. Static content should remain JSX/HTML; buttons, search controls, forms, and individual bound properties should own focused client behavior.

## What Nexil does not do automatically

Nexil does not convert arbitrary closures into transferable data, infer every piece of application state, provide a database or authentication system, or make a process-local store suitable for multi-instance production. Those responsibilities belong to the application and infrastructure design.

## Summary

Nexil is neither a traditional SSR-only framework nor a conventional SPA. It combines **HTML-first output, selective interaction, tagged state references, and measurable client budgets**. Successful applications make the boundary between static content and interactive behavior explicit.
