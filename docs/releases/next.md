# Nexis v1.3.1: Starter dependency pin correction

## Fixed

`@mohammedaydan/starter` now defaults `createStarterFiles()` to the coordinated `^1.3.1` Nexis package range. The v1.3.0 starter default incorrectly generated `^1.2.0` dependencies when its caller did not supply `dependencyVersion`. That could create a new application without the published Link and Context contracts introduced in v1.3.0.

All public Nexis packages are published at `1.3.1` as one coordinated set, including `@mohammedaydan/seo`. The starter continues to accept an explicit semver range or `workspace:*` where a caller intentionally needs another compatible source.

## Upgrade

Upgrade the coordinated Nexis packages to `1.3.1` together, regenerate the lockfile, and build from a clean `dist` directory. Existing applications already pinned deliberately to `1.3.0` do not require a source migration for this correction. New Starter Engine callers should either rely on the corrected default or explicitly pass the dependency version they intend to scaffold.

```bash
pnpm dlx @mohammedaydan/create-nexis@1.3.1 portal --yes --ts
pnpm install
pnpm build
```

## Compatibility

This is a backward-compatible patch correction. It does not alter the semantic `Link` contract, direct `#app` replacement behavior, SSR/SSG rendering, ContextScope model, or browser-global Store limits documented for v1.3.0.
