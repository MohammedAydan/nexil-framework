# Tasks: Link Navigation Runtime Fix

- [x] Task 1: Update client router runtime `NEXIL_NAVIGATION_RUNTIME` & `useNavigate` (`packages/nexil/src/router/navigation.ts` and `packages/nexil/src/router/index.ts`)
- [x] Task 2: Update Vite plugin dev middleware & bundle asset emission to serve and emit `nexil-navigation.js` and `nexil-forms.js` (`packages/vite-plugin/src/index.ts`)
- [x] Task 3: Update Dev Server SSR rendering to inject `/nexil-navigation.js` when `data-nx-link` is present and `/nexil-forms.js` when progressive forms are present (`packages/cli/src/dev-server.ts`)
- [x] Task 4: Add unit and integration tests verifying dev server script injection and link navigation runtime serving (`packages/cli/src/dev-server.test.ts` & `packages/vite-plugin/src/index.test.ts`)
- [x] Task 5: Verify entire test suite (`pnpm build`, `pnpm typecheck`, `pnpm test`, `playwright test`) and format check
