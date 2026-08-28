# Tasks: create-nexil v2

[x] T0 — Scaffolding
  [x] Create plans/create-nexil-v2/{plan.md,tasks.md,context.md}
  [x] Read current packages/create-nexil/src/{bin.ts,scaffold.ts} + package.json + README + docs/en/03
  [x] Baseline `pnpm --filter @nexil/create-nexil build && pnpm --filter @nexil/create-nexil test` (if tests exist)

[x] T1 — Version bump (only this package)
  [x] packages/create-nexil/package.json version stays 0.0.1 per user request (was 0.0.2 in plan, reverted — no bump needed, other packages remain 0.0.1)

[x] T2 — CLI hardening (packages/create-nexil/src/bin.ts)
  [x] Add --help text (usage, args, flags, templates, examples for npx/pnpm dlx/npm create/pnpm create/nexil create, invokedAs)
  [x] Add --version (read package.json version)
  [x] Add --dry-run (list files, no FS writes)
  [x] Extend parse to handle --dry-run, --help/-h, --version/-v, unknown-option errors
  [x] Correct exit codes (0/1), no stack traces for user errors (TypeError/Error with known messages) → stderr concise, actionable
  [x] Handle invokedAs create-nexil vs create-nexil-app (both via basename)
  [x] Support npm/pnpm create (they invoke bin with same args, no special handling needed beyond name)

[x] T3 — Validation hardening (via starter APIs, not modifying starter)
  [x] Project name: assertStarterProjectName (a-z start, 1-64, alphanum _-)
  [x] Destination: isContainedPath (parent/child), absolute-path escape, traversal .., existing/non-empty (readdir), wx race, EACCES/EPERM, ENOSPC
  [x] Wrap scaffoldProject with rollback: track createdDirectory + writtenFiles, on failure rm directory if we created it and it was empty before
  [x] Distinguish fatal vs warnings (install failures not in scope — scaffold only)

[x] T4 — Template validation
  [x] minimal/interactive/secure-node each has contract (secure-node → nexil.config.ts, interactive → counter.tsx, minimal → no extra)
  [x] Ensure each produces valid runnable project (package.json scripts nexil dev/build, index.html outlets, src/routes/index.{tsx,jsx})

[x] T5 — Publish artifact check (no workspace:* leak)
  [x] Verify pnpm pack --dry-run tarball contents (dist/*, README.md, package.json) and packed package.json dependencies
  [x] If workspace:* leaks, change packages/create-nexil/package.json dependency @nexil/starter from workspace:* to ^0.0.1 (only this file) and re-verify

[x] T6 — Docs (only allowed 2 files)
  [x] packages/create-nexil/README.md update flags/examples to 0.0.2
  [x] docs/en/03-project-creation.md update initializer version + flags + error handling note

[x] T7 — Tests (packages/create-nexil only)
  [x] src/bin.test.ts: parsing (--help, --version, --dry-run, --yes, --ts/--js, --template, unknown, missing name, exit codes)
  [x] src/scaffold.test.ts or src/index.test.ts: name validation, isContainedPath, existing dir, traversal, absolute escape, race EEXIST, permission, ENOSPC, rollback, dry-run file list, template files
  [x] Keep tests co-located, vitest, no other packages

[x] T8 — Verification (isolated, no workspace-wide build)
  [x] pnpm --filter @nexil/create-nexil build
  [x] pnpm --filter @nexil/create-nexil test
  [x] pnpm --filter @nexil/create-nexil pack --dry-run (inspect)
  [x] node packages/create-nexil/dist/bin.js --help / --version / --dry-run
  [x] node packages/create-nexil/dist/bin.js my-nexil-app --yes --ts --template {minimal,interactive,secure-node} × language ts/js (6 combos) → verify package.json, outlets, required files, no workspace:*
  [x] Verify generated project not just unit tests (check dist/client build would need install — skip, but verify scaffold files valid)
  [x] Confirm no other packages/* modified via git status --porcelain (only create-nexil + 2 docs)

[x] T9 — Close
  [x] Update tasks.md, write review.md, update SESSION_LOG.md if needed
  [x] Report files changed, tests run, generated-project checks, limitations, no-other-package-modified, packed artifact no workspace
