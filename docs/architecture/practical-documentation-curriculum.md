# Practical documentation curriculum

> **Status: implementation plan for the current documentation branch.** This curriculum is documentation work, not a claim that Nexis supplies a database, hosted identity provider, payment system, or persistent application storage.

## Outcome

The documentation must allow a developer or an AI agent unfamiliar with Nexis to create, understand, test, deploy, and operate an HTML-first application without guessing at framework behavior. Every lesson leads toward one coherent example application, **Nexis Workbench**: a public knowledge base with static articles, a focused interactive filter, a native-first support form, application-owned session and authorization boundaries, production metadata, and a verifiable release process.

## Lesson contract

Every public capability documented in the framework and on the official site must carry the same six artifacts.

| Artifact            | Requirement                                                                                                 |
| ------------------- | ----------------------------------------------------------------------------------------------------------- |
| Purpose             | State what problem the feature solves and when not to use it.                                               |
| Runnable code       | Provide a minimal, source-verified file or command that can be copied into the current lesson.              |
| HTML-first contract | State exactly what appears before JavaScript and what remains native when enhancement is unavailable.       |
| Safety boundary     | Identify ownership, request isolation, public-browser-data, validation, caching, or secret-handling limits. |
| Verification        | Give the command and observable result, including generated artifact or browser behavior where applicable.  |
| Related source      | Link to the owning package, executable example, and focused test rather than inventing an API.              |

## Progressive curriculum

| Stage             | Workbench capability                                                 | Nexis surface                        | Required proof                                                                     |
| ----------------- | -------------------------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------- |
| 00 — Start        | Create and inspect a project                                         | `create-nexis`, Starter, CLI         | Generated files, lockfile, `pnpm dev`                                              |
| 01 — Document     | Render a public home and shared shell                                | Core, JSX runtime, Renderer, layouts | HTML contains title, heading, navigation, and skip link without JavaScript         |
| 02 — Route        | Add static paths, a 404, render modes, and metadata inheritance      | Router, Renderer, CLI                | Generated directories, correct 404/HEAD, route manifest                            |
| 03 — Navigate     | Enhance eligible internal navigation without breaking anchors        | Router `Link`                        | Link is an anchor; direct `#app` swap, history, bypasses, and no-JS fallback       |
| 04 — Interact     | Add one lazy control and direct scalar binding                       | Reactivity, Client, Vite plugin      | No interaction chunk before intent; only target DOM node changes after intent      |
| 05 — Share safely | Add request-local Context and optional browser-global preference     | Core ContextScope, State             | Independent SSR scopes; explicit Store lifetime and reload limit                   |
| 06 — Mutate       | Add a native-first support request                                   | Form, Actions, Server                | Native submit, invalid input, Origin/CSRF rejection, idempotency policy            |
| 07 — Protect      | Attach application-owned session and resource policy                 | Security, Serve middleware           | Missing/expired/revoked session and denied resource never reach mutation           |
| 08 — Publish      | Add canonical metadata, sitemap, feeds, images, and telemetry policy | SEO, Media, OG image, Telemetry      | Valid absolute URLs, discovery artifacts, image variants, data-minimization review |
| 09 — Operate      | Build, serve, adapt, measure, and release                            | CLI, Serve, Deno/Cloudflare adapters | Production artifact, budget, browser suite, health/redirect/cache checks           |

## Source layout

The framework documentation remains the normative, bilingual reference. The official site is a rendered learning companion, not an independent rewrite. A future content model must support more than one code block per guide: each guide receives **Build**, **Verify**, and **Production boundary** sections plus ordered lab files. The site may summarize prose, but it must preserve every command, caveat, and source link used by the normative guide.

## Example policy

Use real Nexis APIs only. When a complete application needs a persistence layer, email service, identity provider, or deployment secret, expose it as an application-owned interface and explain the integration point. Never represent a placeholder as a shipped framework subsystem. Do not place credentials, personal data, authorization decisions, or request-private values in JSX, generated HTML, `nexis-state.js`, client chunks, examples, or logs.

## Completion criteria

The curriculum is complete only when each public guide has an executable or source-verified snippet, each module has a defined precondition and expected artifact, the Workbench example builds from a clean installation, and the official site mirrors the same current-version contracts. Release review must compare internal guide commands and snippets with the site content and reject stale versions or unsupported claims.
