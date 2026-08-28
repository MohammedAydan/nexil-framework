# Nexis v1.3.2: Named resumable handler correction

## Fixed

`onClick$={increment}` now works when `increment` is a direct local arrow function, function expression, or function declaration that closes over supported resumable values. Previously the Vite transform emitted an unavailable `scope.increment(...)` call instead of lowering the handler body and capturing values such as a Signal. The same source works as an inline callback and is now supported as a named local handler too.

The interactive Starter now demonstrates the supported named-handler form and defaults generated projects to the coordinated `^1.3.2` package range. All public Nexis packages are released as one coordinated set.

## Upgrade

Upgrade the coordinated Nexis packages to `1.3.2` together, regenerate the lockfile, and build from a clean `dist` directory. Existing inline handlers require no migration. You may replace an inline handler with a direct local named declaration when it improves clarity, provided all captures remain supported ScopeRef values.

```bash
pnpm dlx @mohammedaydan/create-nexis@1.3.2 portal --yes --ts
pnpm install
pnpm build
```

## Compatibility

This is a backward-compatible patch correction. It does not alter the semantic `Link` contract, direct `#app` replacement behavior, SSR/SSG rendering, ContextScope model, browser-global Store limits, or the rule that secrets and server-only resources cannot be captured by a client handler.
