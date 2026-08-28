# @nexil/starter

Portable typed starter-file generation for Nexil. It is used by the Nexil CLI and can be used by browser-based tools that need to inspect or package a project template without filesystem access.

The engine returns a record of relative paths and UTF-8 source text. It never writes files, installs dependencies, performs network requests, or produces credentials.

```ts
import { createStarterFiles } from '@nexil/starter'

const files = createStarterFiles({
  projectName: 'northstar',
  template: 'interactive',
  language: 'ts',
  tailwind: false,
  dependencyVersion: '^1.3.1',
})
```

Use `minimal` for a static HTML-first page, `interactive` for a focused resumable counter boundary, and `secure-node` for a static page paired with explicit Node security-header configuration.
