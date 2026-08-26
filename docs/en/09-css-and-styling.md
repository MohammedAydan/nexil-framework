# 09 — CSS, Tailwind, and Styling

## CSS in Nexis

Static pages should receive their styles without depending on JavaScript. Prefer build-time extraction so static routes remain zero-client-JavaScript routes.

## Recommended structure

```text
src/styles/
├── reset.css
├── tokens.css
├── base.css
├── components.css
└── utilities.css
```

Start with design tokens, then base styles, components, and utilities. Avoid broad global selectors that allow one route to affect another unintentionally.

```css
:root {
  --color-bg: #ffffff;
  --color-text: #172033;
  --space-2: 0.5rem;
}

.card {
  padding: var(--space-2);
  color: var(--color-text);
  background: var(--color-bg);
}
```

## Tailwind

If you use Tailwind, include all relevant `src` and example paths in its content configuration. Class names must be discoverable at build time; constructing arbitrary class names from runtime strings may prevent Tailwind from emitting them.

```tsx
<div className="grid gap-4 md:grid-cols-2">
  <Card />
</div>
```

The repository’s CSS package includes class-merging utilities. If a temporary fixture leaves a broken `tailwind-merge` workspace link, repair the installation with `pnpm install` rather than changing source imports.

## Naming and scoping

Use CSS Modules, BEM, or another consistent naming strategy. The important property is that component and route styles have predictable scope.

```css
.product-card__title {
  font-weight: 700;
}
.product-card--featured {
  border-color: var(--color-accent);
}
```

## RTL and Arabic

Prefer logical properties over left/right-specific properties:

```css
.panel {
  padding-inline: 1rem;
  margin-block: 1rem;
  border-inline-start: 3px solid var(--color-accent);
}
```

Set `dir="rtl"` on the HTML document or application region and test Arabic and English together. Do not rely on a single visual direction for icons or chevrons.

## Reduce CSS

- Do not import an entire UI library for a few controls.
- Separate global CSS from page-specific CSS.
- Track stylesheet size in benchmark artifacts.
- Minify in production.
- Do not make CSS changes require runtime JavaScript.

## Critical CSS

Critical shell styles may be placed in the head, but do not duplicate a complete stylesheet inside every HTML response. For larger applications, use extraction or bundling with an explicit strategy.

## Accessibility

Keep visible focus, adequate contrast, and a logical reading order. Do not use `display: none` to hide meaningful text unless intentional. Respect reduced-motion preferences:

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms;
    transition-duration: 0.01ms;
    scroll-behavior: auto;
  }
}
```

## Testing

Test narrow viewports, RTL, and 200% zoom. In E2E, check for horizontal overflow, keyboard access, visible focus, and clickable controls even before JavaScript enhancement.
