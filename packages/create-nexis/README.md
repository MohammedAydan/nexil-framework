# create-nexis

The official Nexis project initializer. After the package is published to GitHub Packages, configure the `@nexis` scope and use:

```bash
pnpm dlx @nexis/create-nexis my-nexis-app --yes --ts
```

The initializer is published to GitHub Packages as `@nexis/create-nexis`. Configure `@nexis:registry=https://registry.npmjs.org/` and a classic token with `read:packages` before using it. It also supports `--js`, `--tailwind`, and `--no-tailwind`.

For a repository checkout before GitHub Packages publication, build the package and invoke its generated binary directly:

```bash
pnpm --filter @nexis/create-nexis build
node packages/create-nexis/dist/bin.js my-nexis-app --yes --ts
```
