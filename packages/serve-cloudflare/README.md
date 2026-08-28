# @nexil/serve-cloudflare

Fetch-native Cloudflare handler helpers for Nexil. `createCloudflareHandler` checks an injected `env.ASSETS`-compatible `fetch` service first and delegates asset misses to the Nexil route handler. When no handler can serve a request, it returns a cache-safe 404.

The package does not assume a particular Cloudflare asset binding or mutate headers supplied by the platform. Applications should pass their generated route handler and configure authentication, action origins, telemetry, and cache invalidation at the deployment boundary.
