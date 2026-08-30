# @nexil/vite-plugin

Official Vite plugin and resumability compiler for Nexil.

## Features

- **Resumability Compiler:** Extracts `$` dollar-suffix event handlers into standalone, lazy-loaded chunk symbols.
- **Store Auto-Discovery:** Scans `src/stores` and provides `virtual:nexil-stores` and `$stores/*` aliases.
- **Budget Enforcer:** Analyzes compiled bundle sizes against configured performance budgets.
- **JSX Integration:** Automatically configures JSX transform for `nexil`.

## Usage

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import { nexilPlugin } from '@nexil/vite-plugin'

export default defineConfig({
  plugins: [nexilPlugin()],
})
```

## License

MIT
