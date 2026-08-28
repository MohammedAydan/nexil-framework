# Nexil Practical Lab

This fixture exercises the framework as a real Tailwind-powered application rather than only testing isolated packages.

The home route verifies SSR styling, `className` normalization, `cx`/`cn`, style objects, `useState`, and `onClick$`. The forms route verifies generic `onInput$` and `onSubmit$` boundaries. The dynamic docs route exports `staticPaths` and verifies that `/docs/quickstart`, `/docs/routing`, and `/docs/styling` are generated at build time. `src/shared/actions.ts` verifies the compact server-action API at typecheck time.

Run the fixture from the repository root with:

```bash
pnpm --filter @nexil/example-practical-app build
pnpm --filter @nexil/example-practical-app check
```

The generated output must contain compiled Tailwind utilities under `dist/client/assets/styles.css`, one stylesheet link in each HTML page, and static pages for every entry in `staticPaths`.
