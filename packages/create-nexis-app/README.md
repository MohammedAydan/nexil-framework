# create-nexis-app

Compatibility alias for the Nexis project initializer. After publication to GitHub Packages, configure the `@mohammedaydan` scope and use:

```bash
npx --yes @mohammedaydan/create-nexis-app my-nexis-app --yes --ts
```

The initializer is published to GitHub Packages as `@mohammedaydan/create-nexis-app`. Configure `@mohammedaydan:registry=https://npm.pkg.github.com` and a classic token with `read:packages` before using it. The initializer supports `--js`, `--tailwind`, and `--no-tailwind`.

For a repository checkout before GitHub Packages publication, build the package and invoke its generated binary directly:

```bash
pnpm --filter @mohammedaydan/create-nexis-app build
node packages/create-nexis-app/dist/bin.js my-nexis-app --yes --ts
```
