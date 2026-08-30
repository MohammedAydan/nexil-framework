# create-nexil

The official Nexil project initializer (`@nexil/create-nexil`, bin `create-nexil` / `create-nexil-app`). Published to the public npm registry (`https://registry.npmjs.org/`) — no registry token required.

```bash
pnpm dlx create-nexil@0.1.0 my-nexil-app --yes --ts
# or
npx --yes create-nexil@0.1.0 my-nexil-app --yes --ts
yarn dlx create-nexil@0.1.0 my-nexil-app --yes --ts
npm create @nexil/nexil@0.1.0 my-nexil-app -- --yes --ts
pnpm create @nexil/nexil@0.1.0 my-nexil-app -- --yes --ts
# inside a Nexil workspace or with @nexil/cli installed:
nexil create my-nexil-app --yes --ts
```

Flags: `--yes`/`-y` (skip prompts), `--ts`/`--js` (exclusive), `--tailwind`/`--no-tailwind`, `--template minimal|interactive|secure-node` (or `--template=<name>`), `--dry-run` (list files, no write), `--help`/`-h`, `--version`/`-v`.

On error the CLI writes a concise `Error: <reason>` to `stderr` and exits `1` without a stack trace (e.g. `Unknown create option`, `Missing <project-name>`, `Directory is not empty`, `Project directory must be contained`). System errors (`EACCES`, `ENOSPC`, `EEXIST` race) include a hint and, if this invocation created the directory, it is removed to avoid a half-created project.

Templates:

- `minimal` — static HTML-first, no `counter.tsx` or `nexil.config.*`
- `interactive` — `src/routes/index.tsx` + `src/routes/counter.tsx` with `onClick$` boundary (default)
- `secure-node` — adds `nexil.config.ts` (`securityHeaders`, `trustProxy: false`)

For a local checkout before publishing, build and invoke the binary directly:

```bash
pnpm --filter create-nexil build
node packages/create-nexil/dist/bin.js my-nexil-app --yes --ts
```
