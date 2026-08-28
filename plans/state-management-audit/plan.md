# Plan: State Management Audit & Repair

## Goal

Make the documented state-management model (signals → scope captures → resumable
handlers) actually work end-to-end, and fix the reactive-engine bugs found during
audit — without breaking any existing behavior, API, or test.

## Acceptance criteria

1. A route declaring `const count = state(0)` and a lazy handler closing over
   `count` increments correctly in the browser on first click (chunk loads,
   scope materializes from `data-nx-scope`, value persists across clicks).
2. Same works for `const [n, setN] = useState(0)` tuple form.
3. Captures whose initial value cannot be safely serialized statically degrade to
   `unsupported` diagnostics — never silent undefined crashes.
4. Computeds created inside effects stay reactive after the effect re-runs.
5. `effect`, `watch`, `untrack`, `createRoot`, `onCleanup` importable from
   `@nexis/core`.
6. Generated apps can `import { createStore } from '@nexis/state'`
   without manual dependency edits.
7. All existing gates stay green: build, typecheck, unit (135+), e2e (13+),
   format, budget checks.

## Approach

- vite-plugin: extend ScopeCapture with static `initial` extraction (JSON-literal
  balanced-paren scan); classify useState tuples; emit `data-nx-scope` attribute
  alongside `data-nx-on-*` during the JSX rewrite; harden minified bootstrap
  shim (.value/subscribe, guarded import).
- reactivity: remove the cleanup-hoisting block in `computed` finally (stale-dep
  root cause).
- core: widen reactivity re-export surface.
- create-nexis (+cli/create-nexis-app copies): add `@nexis/state` dep.
- client: unify exported `bootstrapResumability` with the shipped contract
  (unified attrs + scope materialization via global registry); dispose-on-overwrite
  in ScopeRegistry.register.
- e2e: new `tests/e2e/state-scope.spec.ts` proving criterion 1–3 in a real browser.

## Out of scope

- Publishing (user decides when to run the 1.0.0 refresh cycle).
- Rewriting Store snapshot strategy; selector-set GC; error-isolation semantics
  for listener loops (would change documented fail-fast cycle errors).

## Dependencies

None external. All packages internal.

## Estimated complexity

M — cross-package but surgical; compiler change is the riskiest part.
