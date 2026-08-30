# Nexil Framework Documentation

This directory contains the complete English documentation for Nexil Framework `1.3.1`. It is written for developers who need to understand the framework internally, build production applications, test them, optimize them, secure them, and deploy them.

> This documentation describes the behavior implemented in the current repository. When using another version, verify the exact TypeScript declarations and generated `.d.ts` files for that version.

## Start here

| Goal                                           | Recommended document                                                                           |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Understand the framework quickly               | [01-overview.md](./01-overview.md)                                                             |
| Understand the internal architecture           | [02-architecture-and-how-it-works.md](./02-architecture-and-how-it-works.md)                   |
| Create an application with the current release | [03-project-creation.md](./03-project-creation.md)                                             |
| Write pages and components                     | [04-pages-and-components.md](./04-pages-and-components.md)                                     |
| Understand routing and rendering               | [05-routing-and-rendering.md](./05-routing-and-rendering.md)                                   |
| Add resumable interaction                      | [06-interactivity-and-scoperef.md](./06-interactivity-and-scoperef.md)                         |
| Manage state and reactivity                    | [07-state-and-reactivity.md](./07-state-and-reactivity.md)                                     |
| Build secure actions and forms                 | [08-actions-and-forms.md](./08-actions-and-forms.md)                                           |
| Write CSS and use Tailwind                     | [09-css-and-styling.md](./09-css-and-styling.md)                                               |
| Optimize images and media                      | [10-media-and-images.md](./10-media-and-images.md)                                             |
| Implement SEO and metadata                     | [11-seo-and-metadata.md](./11-seo-and-metadata.md)                                             |
| Deploy the framework                           | [12-server-and-deployment.md](./12-server-and-deployment.md)                                   |
| Test and measure performance                   | [13-testing-and-performance.md](./13-testing-and-performance.md)                               |
| Apply production security                      | [14-security-and-operations.md](./14-security-and-operations.md)                               |
| Find an API quickly                            | [15-api-reference.md](./15-api-reference.md)                                                   |
| Diagnose common failures                       | [16-troubleshooting.md](./16-troubleshooting.md)                                               |
| Follow recommended practices                   | [17-best-practices.md](./17-best-practices.md)                                                 |
| Build a complete example                       | [18-complete-example.md](./18-complete-example.md)                                             |
| Upgrade between releases                       | [19-releases-and-upgrades.md](./19-releases-and-upgrades.md)                                   |
| Use the CLI and configuration                  | [20-cli-and-configuration.md](./20-cli-and-configuration.md)                                   |
| Contribute to the framework                    | [21-contributing.md](./21-contributing.md)                                                     |
| Learn the terminology                          | [22-glossary.md](./22-glossary.md)                                                             |
| Add sessions, authorization, and middleware    | [23-security-authentication-and-middleware.md](./23-security-authentication-and-middleware.md) |
| Build a complete production application        | [24-production-workbench.md](./24-production-workbench.md)                                     |
| Manage state with Nexil Stores                 | [25-nexil-stores.md](./25-nexil-stores.md)                                                     |
| Read the v1.1.0 release and migration guide    | [v1.1.0 release notes](../releases/v1.1.0.md)                                                  |
| Review v1.3.0 Link and Context release         | [v1.3.0 release notes](../releases/v1.3.0.md)                                                  |
| Review the v1.3.1 Starter correction           | [next release notes](../releases/next.md)                                                      |

## Recommended reading paths

A new user should start with [24-production-workbench.md](./24-production-workbench.md) and follow its stages in order; each stage points to the normative detailed guide when a contract needs deeper treatment. Alternatively, read documents 01 through 06, then continue with 07 and 08 when state or forms are required. Read 11 and 12 before deploying. A framework contributor should begin with 02, then read 05, 06, 12, 13, and 15.

## Core concepts

Nexil is an HTML-first TypeScript framework built around SSR/SSG, progressive enhancement, resumable interaction, and fine-grained DOM reactivity. A page is rendered on the server into useful HTML. Client JavaScript is emitted only for boundaries that require interaction. When an interaction occurs, the browser loads the smallest relevant chunk and resolves explicitly declared `ScopeRef` values rather than hydrating an entire application. Direct Signal reads and explicit binding directives can update one text node or scalar DOM property through `effect()` without rerunning the component.

| Concept           | Practical meaning                                                   |
| ----------------- | ------------------------------------------------------------------- |
| Route             | A page module under `src/routes` mapped to a URL                    |
| Render mode       | `static`, `server`, `isr`, or `partial` output behavior             |
| Layout            | Recursive `_layout.*` composition and metadata inheritance          |
| Suspense boundary | Fallback-first asynchronous streaming boundary                      |
| Form              | Progressive native form with optional resumable enhancement         |
| ScopeRef          | A safe tagged reference to a value, signal, store, or action        |
| Lazy handler      | An event handler emitted into a separately loaded chunk             |
| DOM binding       | A Signal subscription that updates one text node or scalar property |
| Action            | A server operation invoked through a typed endpoint                 |
| Production server | `@nexil/serve` serving the final build                              |
| Security package  | `@nexil/security` session and authorization primitives              |
| Build artifact    | Generated HTML, CSS, JavaScript, media, and metadata                |

## Example policy

The examples use TypeScript and JSX. Adjust paths to match your application. Never commit API keys or secrets; use environment variables and define an application-specific Origin, CSRF, authorization, and retention policy.

## Internal references

- [Package map](../architecture/package-map.md)
- [Compatibility](../compatibility.md)
- [Release checklist](../release-checklist.md)
- [Security control matrix](../security/control-matrix.md)
- [CLI README](../../packages/cli/README.md)
- [Nexil Core README](../../packages/nexil/README.md)
- [Showcase report](../../examples/nexil-showcase/SHOWCASE-REPORT.md)
- [Practical documentation curriculum](../architecture/practical-documentation-curriculum.md)
- [Nexil Workbench production path](./24-production-workbench.md)
- [v1.1.0 release and migration guide](../releases/v1.1.0.md)
- [v1.3.0 Link and Context release notes](../releases/v1.3.0.md)
- [v1.3.1 Starter correction notes](../releases/next.md)
