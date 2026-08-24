# create-nexis

The official Nexis project initializer. After the package is published to npm, use:

```bash
pnpm create nexis my-nexis-app --yes --ts
```

The initializer also supports `--js`, `--tailwind`, and `--no-tailwind`. It is intentionally self-contained and does not depend on private workspace packages at runtime.

For a repository checkout before npm publication, build the package and invoke its generated binary directly:

```bash
pnpm --filter create-nexis build
node packages/create-nexis/dist/bin.js my-nexis-app --yes --ts
```
