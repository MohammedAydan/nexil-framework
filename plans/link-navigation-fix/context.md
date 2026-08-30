# Context: Link Navigation Runtime Fix

## Files to modify

- `packages/nexil/src/router/navigation.ts`: Robust text-node target traversal in `findLink`, safe `rel` parsing in `canIntercept`, error containment in `loadDestinationRuntime`, and destination state/stores `<script>` synchronization on `swap`.
- `packages/nexil/src/router/index.ts`: Update `useNavigate` to directly call `globalThis.__nexilNavigate` when available.
- `packages/vite-plugin/src/index.ts`: Serve `/nexil-navigation.js` and `/nexil-forms.js` in `configureServer` middleware, emit them in `generateBundle`.
- `packages/cli/src/dev-server.ts`: Inject `/nexil-navigation.js` when `html.includes('data-nx-link')` and `/nexil-forms.js` when `html.includes('data-nx-form="progressive"')`.
- `packages/cli/src/dev-server.test.ts`: Add test asserting `/nexil-navigation.js` is injected when Link is present.
- `packages/vite-plugin/src/index.test.ts`: Add test asserting `/nexil-navigation.js` is served by Vite middleware.

## Dependencies Added

- None

## Env Vars Needed

- None

## Open Questions

- None
