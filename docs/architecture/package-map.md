# Nexil Package Map

## Architecture Overview (v0.1.0)

Nexil is consolidated into **4 publishable packages**:

```text
nexil (core framework engine: core, reactivity, state, jsx-runtime, client, server, router)
  ├── @nexil/vite-plugin (compiler, AST transforms, store auto-discovery, JSX runtime config)
  ├── @nexil/cli (dev server, production serve, scaffolding, image optimizer, code generators)
  └── create-nexil (standalone interactive scaffolding CLI)
```

## Consolidated Package Structure

| Package                     | Package Name         | Entry Points & Subpaths                                                                 | Allowed Responsibilities                                                                                                                                                                                                                                                                                                                                                                                                                       |
| :-------------------------- | :------------------- | :-------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`packages/nexil`**        | `nexil`              | `.`<br>`./jsx-runtime`<br>`./jsx-dev-runtime`<br>`./client`<br>`./server`<br>`./router` | • Fine-grained reactivity (`Signal`, `computed`, `effect`, `batch`)<br>• State & Proxy stores (`createStore`, `defineStore`)<br>• JSX factory, intrinsic elements, and `MaybeSignal<T>` definitions<br>• Client DOM event delegator & resumability dispatcher<br>• SSR streaming & HTML serializer<br>• Server actions, loaders, and HTTP adapters (`node`, `cloudflare`, `deno`)<br>• File-based router, navigation hooks, layout composition |
| **`packages/vite-plugin`**  | `@nexil/vite-plugin` | `.`                                                                                     | • Resumability AST compiler (`$` dollar-suffix closure extractor)<br>• Store auto-discovery (`virtual:nexil-stores`, `$stores/*`)<br>• Boundary classification and budget analyzer<br>• Automatic JSX import source configuration                                                                                                                                                                                                              |
| **`packages/cli`**          | `@nexil/cli`         | `.`                                                                                     | • `nexil dev` (HMR dev server)<br>• `nexil build` (SSR/SSG compiler)<br>• `nexil start` / `nexil serve` (production server)<br>• `nexil generate` / `nexil check` / `nexil doctor`<br>• Automated image variant generator                                                                                                                                                                                                                      |
| **`packages/create-nexil`** | `create-nexil`       | `.`                                                                                     | • Standalone interactive scaffolder (`pnpm dlx create-nexil`)<br>• Embedded templates (`blank`, `fullstack`, `minimal`, `interactive`, `secure-node`)                                                                                                                                                                                                                                                                                          |

## Rules

- Internal modular code inside `packages/nexil` uses relative imports.
- Public contracts must use Web Standard types (`Request`, `Response`, `Headers`, `ReadableStream`) where practical.
- Server-only code (`nexil/server`) cannot be imported into client browser bundles.
