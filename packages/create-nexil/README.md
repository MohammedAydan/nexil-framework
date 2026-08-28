# create-nexil

The official Nexil project initializer (`@nexil/create-nexil`, bin `create-nexil` / `create-nexil-app`). Published to the public npm registry (`https://registry.npmjs.org/`) — no registry token required.

```bash
pnpm dlx @nexil/create-nexil@0.0.1 my-nexil-app --yes --ts
# or
npx --yes @nexil/create-nexil@0.0.1 my-nexil-app --yes --ts
yarn dlx @nexil/create-nexil@0.0.1 my-nexil-app --yes --ts
npm create @nexil/nexil@0.0.1 my-nexil-app -- --yes --ts
pnpm create @nexil/nexil@0.0.1 my-nexil-app -- --yes --ts
# inside a Nexil workspace or with @nexil/cli installed:
nexil create my-nexil-app --yes --ts
```

Flags: `--yes` / `-y`, `--ts` / `--js`, `--tailwind` / `--no-tailwind`, `--template minimal|interactive|secure-node`.

For a local checkout before publishing, build and invoke the binary directly:

```bash
pnpm --filter @nexil/create-nexil build
node packages/create-nexil/dist/bin.js my-nexil-app --yes --ts
```
