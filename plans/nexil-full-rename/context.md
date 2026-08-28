# Context: Nexil Full Rename

## Files touched (expected)

- packages/cli/package.json (bin)
- packages/cli/src/index.ts (asset names, config discovery, outlet markers, env)
- packages/cli/src/bin.ts / scaffold.ts
- packages/create-nexil/** → packages/create-nexil/** (new canonical)
- packages/starter/src/index.ts (SHELL_HTML, packageJson, secureConfig)
- packages/starter/src/node.ts (scaffold writes)
- packages/starter/src/index.test.ts
- packages/vite-plugin/src/bootstrap.ts, external-bootstrap.ts, external-bindings.ts, index.ts
- packages/router/src/navigation.ts (globals, header already ne xil)
- packages/dev-server/src/index.ts
- packages/serve/src/index.ts
- examples/nexil-showcase/** → examples/nexil-showcase/**
- docs/en/** (03,05,06,08,10,12,15,18,20 + README)
- docs/ar/**
- README.md
- All packages/*/package.json repository.url
- .github/workflows/publish-packages.yml
- pnpm-workspace.yaml, tsconfig.json
- playwright.config.ts, tests/e2e/*

## Deps added

- none expected

## Env vars

- NEXIL_* primary, NEXIL_* fallback (HOST, PORT, ALLOW_ALL_HOSTS, ACTION_ORIGINS, SITE_ORIGIN, TRUST_PROXY)

## Open questions

- Should `nexil.config.*` still be read? Yes, fallback for one version.
- Should `__nexil*` globals keep alias? Dual-write cheap: set both `__nexil*` and `__nexil*`.
- Scope of .gitignore `my-nexil-app/` → `my-nexil-app/` (and keep old for compat)

## Audit snapshot (grep nexil | head 60)

- README: nexil-bootstrap.js, nexil-manifest.json, nexil dev/build, create-nexil, my-nexil-app, <!--nexil-*-outlet-->, __nexilNavigation etc (via navigation)
- docs/en/20-cli-and-configuration.md: nexil.config, nexil dev/build, nexil-bootstrap.js
- packages/starter/src/index.ts: SHELL_HTML with nexil-head/app/scripts, scripts nexil dev/build, nexil key, .npmrc (already @nexil), nexil.config.ts
- packages/cli/src/index.ts: BOOTSTRAP_FILE='nexil-bootstrap.js', CHUNK_DIRECTORY etc, transformWithEsbuild('nexil-navigation.js'), readDocument header X-Nexil already, but still writes nexil-* files
- packages/vite-plugin: nexil-chunks/, __nexilScopeRegistry etc
- packages/router: __nexilNavigationInstalled already nexil? Actually __nexil retained
- examples/nexil-showcase path references
