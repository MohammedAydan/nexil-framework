# Compatibility and Release Track

Nexil does not replace application libraries. The framework provides boundary, rendering, data, and security primitives while applications remain free to choose ecosystem components.

| Integration                              | Support boundary                                         | Validation status             |
| ---------------------------------------- | -------------------------------------------------------- | ----------------------------- |
| `fetch`                                  | Web Standard server/client API                           | Core contract                 |
| `axios` / `ky`                           | Server or explicit client boundary                       | Compatibility fixture planned |
| `zod` / `valibot`                        | Action and loader validation supplied by the application | Compatibility fixture planned |
| Prisma / Drizzle / Kysely                | Server-only data access                                  | Boundary fixture planned      |
| Firebase Admin / Supabase server clients | Server-only modules and request context                  | Boundary fixture planned      |
| Firebase client SDK                      | Explicit client boundary and budget review               | Client fixture planned        |
| Tailwind / CSS Modules                   | CSS driver over compile-time extraction                  | Driver contract active        |
| Stripe / Paymob                          | Application/plugin integration; never core dependency    | Plugin track                  |

## Experimental features

PPR is experimental until cache isolation, stream error handling, and parity tests pass on all supported adapters. Experimental behavior must be opt-in, versioned, documented, and excluded from claims of production compatibility.

## Browser and runtime policy

The first release targets Node LTS and modern browsers with Web Standard APIs. Node-specific APIs belong in CLI, dev-server, or adapter packages. Core packages must remain portable and must not require a database, authentication provider, payment provider, or CSS framework.
