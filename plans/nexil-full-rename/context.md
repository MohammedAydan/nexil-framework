# Context: Nexil Full Rename

## Files touched (expected)

- packages/cli/package.json (bin)
- packages/cli/src/index.ts (asset names, config discovery, outlet markers, env)
- packages/cli/src/bin.ts / scaffold.ts
- packages/create-nexis/** → packages/create-nexil/** (new canonical)
- packages/starter/src/index.ts (SHELL_HTML, packageJson, secureConfig)
- packages/starter/src/node.ts (scaffold writes)
- packages/starter/src/index.test.ts
- packages/vite-plugin/src/bootstrap.ts, external-bootstrap.ts, external-bindings.ts, index.ts
- packages/router/src/navigation.ts (globals, header already ne xil)
- packages/dev-server/src/index.ts
- packages/serve/src/index.ts
- examples/nexis-showcase/** → examples/nexil-showcase/**
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

- NEXIL_* primary, NEXIS_* fallback (HOST, PORT, ALLOW_ALL_HOSTS, ACTION_ORIGINS, SITE_ORIGIN, TRUST_PROXY)

## Open questions

- Should `nexis.config.*` still be read? Yes, fallback for one version.
- Should `__nexis*` globals keep alias? Dual-write cheap: set both `__nexil*` and `__nexis*`.
- Scope of .gitignore `my-nexis-app/` → `my-nexil-app/` (and keep old for compat)

## Audit snapshot (grep nexis | head 60)

- README: nexis-bootstrap.js, nexis-manifest.json, nexis dev/build, create-nexis, my-nexis-app, <!--nexis-*-outlet-->, __nexisNavigation etc (via navigation)
- docs/en/20-cli-and-configuration.md: nexis.config, nexis dev/build, nexis-bootstrap.js
- packages/starter/src/index.ts: SHELL_HTML with nexis-head/app/scripts, scripts nexis dev/build, nexis key, .npmrc (already @nexil), nexis.config.ts
- packages/cli/src/index.ts: BOOTSTRAP_FILE='nexis-bootstrap.js', CHUNK_DIRECTORY etc, transformWithEsbuild('nexis-navigation.js'), readDocument header X-Nexil already, but still writes nexis-* files
- packages/vite-plugin: nexis-chunks/, __nexisScopeRegistry etc
- packages/router: __nexisNavigationInstalled already nexis? Actually __nexis retained
- examples/nexis-showcase path references
