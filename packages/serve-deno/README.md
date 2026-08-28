# @nexil/serve-deno

Fetch-native Deno handler helpers for Nexil. `createDenoHandler` serves an injected asset map with explicit MIME types, immutable cache headers, `GET`/`HEAD` support, and `405` responses for unsupported asset methods before delegating route and action requests to the application handler.

`serveDeno` calls `Deno.serve` when available and throws a clear error in non-Deno runtimes. Generated static files, action authorization, telemetry retention, and deployment-specific cache invalidation remain application responsibilities.
