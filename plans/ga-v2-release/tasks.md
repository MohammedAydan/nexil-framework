# Tasks

- [x] Unify resumability bootstrap: vite-plugin dev middleware + stable /nexil-bootstrap.js + /nexil-chunks/* URLs; cli emits matching static paths; shared bootstrap constant
- [x] Scaffold: real working counter route, bootstrap script tag in index.html, tsconfig DOM libs, reactivity dep
- [x] Strip TS annotations from emitted handler chunks (esbuild) + regression test
- [x] Version 2.0.0 across public packages
- [x] create-nexil-app bin alias; non-interactive exec form verified live
- [x] README overhaul (truthful APIs only)
- [x] tests/e2e/deno-runtime.spec.ts + playwright testIgnore + CI wiring (+ --allow-env, zero-dep bootstrap module)
- [x] Local gates: build/typecheck/lint/format/test/e2e/smokes/security/budget all green
- [x] Commit + push main; tag v2.0.0; publish workflow SUCCESS
- [x] External consumer validation at 2.0.0 (dlx → install 2.0.0 → build → budget → start 200)
- [x] CI green on final HEAD (da94162), incl. Deno spec
