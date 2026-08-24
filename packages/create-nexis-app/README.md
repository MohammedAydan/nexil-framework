# create-nexis-app

Compatibility alias for the Nexis project initializer. After publication to npm, use:

```bash
npx create-nexis-app my-nexis-app --yes --ts
```

The initializer supports `--js`, `--tailwind`, and `--no-tailwind`. It is self-contained so the command can resolve without access to the private Nexis monorepo.

For a repository checkout before npm publication, build the package and invoke its generated binary directly:

```bash
pnpm --filter create-nexis-app build
node packages/create-nexis-app/dist/bin.js my-nexis-app --yes --ts
```
