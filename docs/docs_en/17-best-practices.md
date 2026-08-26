# 17 — Best Practices

## Start with the output contract

Before writing a component, decide whether the route is static, server-rendered, or ISR; whether it needs JavaScript; what must be visible in the first HTML; and what cache policy is safe.

## Prefer HTML-first

Render navigation, headings, descriptions, forms, and primary content on the server. Add client behavior only where it improves the interaction. This improves resilience, accessibility, and the static-route budget.

## Keep boundaries small

A component should have one reason to become interactive. Keep a menu, counter, or form boundary separate from a large content tree. Small boundaries reduce lazy-chunk size and simplify disposal.

## Use explicit state ownership

Local state belongs to the component. Route state belongs to the route or loader. Shared state belongs to a named store with a lifetime. Never use a global singleton for private request data.

## Keep derived data derived

Use `computed` or `store.select` instead of duplicating totals and filtered lists. Keep selectors pure and avoid effects that merely calculate values.

## Treat Actions as public endpoints

Validate all input, check Origin, authorize the user, make important mutations idempotent, and return safe errors. Keep a native form fallback.

## Build SEO as a contract

Every published route should have a title, description, canonical, correct Open Graph data, valid structured data where appropriate, and a sitemap entry. Use one source of truth for metadata.

## Optimize images deliberately

Provide dimensions and correct alt text, generate modern variants, use `pictureMarkup`, lazy-load below-the-fold images, and measure LCP and CLS. Do not create variants that no route uses.

## Accessibility is part of rendering

Use semantic HTML, labels, keyboard support, visible focus, logical direction, live status updates, and reduced-motion support. Test without JavaScript and with RTL content.

## Use safe URLs

Validate canonical URLs, redirects, sitemap entries, image sources, and links. Reject dangerous protocols and avoid accepting arbitrary external hosts.

## Separate local and production claims

Record whether a number is a unit test, local benchmark, Lighthouse lab result, or field measurement. The repository’s Astro-style fixture is an internal comparable baseline, not an official benchmark against an installed Astro application.

## Keep configuration versioned

Commit the lockfile and build configuration. Use environment variables for deployment-specific values, not source changes. Check the exact exported configuration type in the installed release before documenting a new field.

## Make release work reproducible

Use a clean install, deterministic build, recorded commit, explicit test commands, and a rollback artifact. Keep reports with raw artifacts rather than only a headline score.

## Review checklist

- Is the route’s rendering mode deliberate?
- Does initial HTML contain essential content?
- Are interactive handlers lazy and serializable?
- Are signals and stores disposed?
- Are actions validated and authorized?
- Are all URLs safe?
- Are images sized and cached correctly?
- Does the page work with keyboard, RTL, and no JavaScript?
- Are test and performance claims scoped correctly?
