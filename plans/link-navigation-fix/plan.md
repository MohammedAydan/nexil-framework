# Feature Plan: Link Navigation Runtime Fix

## Goal

Ensure the client-side `<Link>` navigation runtime (`nexil-navigation.js`) is correctly injected, served in dev mode (`nexil dev` & Vite plugin), emitted in bundles, and seamlessly intercepts link clicks without triggering unintended full-page refreshes.

## Acceptance Criteria

1. **Dev Server Script Injection:** `packages/cli/src/dev-server.ts` checks for `data-nx-link` (and progressive forms) and injects `<script type="module" src="/nexil-navigation.js"></script>` into the rendered HTML.
2. **Vite Plugin Dev Middleware:** `packages/vite-plugin/src/index.ts` serves `NEXIL_NAVIGATION_RUNTIME` under `GET /nexil-navigation.js` and `RESUMABILITY_FORMS` under `GET /nexil-forms.js`.
3. **Vite Plugin Asset Emission:** `packages/vite-plugin/src/index.ts` emits `nexil-navigation.js` and `nexil-forms.js` during `generateBundle`.
4. **Resilient Click Interception:** `packages/nexil/src/router/navigation.ts` resolves links even when `event.target` is a text/nested child node, safely inspects `rel` attributes, and avoids crashing when optional destination scripts cannot be dynamically imported.
5. **Programmatic Navigation Compatibility:** `useNavigate` in `packages/nexil/src/router/index.ts` delegates directly to `globalThis.__nexilNavigate` when installed for seamless SPA transitions.
6. **Zero Regressions:** All unit tests, integration tests, and E2E tests (including `link-navigation.spec.ts`) pass cleanly.

## Scope

- **IN:**
  - Dev server HTML script injection in `packages/cli/src/dev-server.ts`.
  - Vite dev server middleware & bundle emissions in `packages/vite-plugin/src/index.ts`.
  - Robustness enhancements in `packages/nexil/src/router/navigation.ts` and `packages/nexil/src/router/index.ts`.
  - Unit and integration tests covering dev server injection and link navigation runtime serving.
- **OUT:**
  - Redesigning the resumability or VDOM-less architecture.

## Dependencies

- `@nexil/core`
- `@nexil/vite-plugin`
- `@nexil/cli`

## Estimated Complexity

- **S (Small)**
