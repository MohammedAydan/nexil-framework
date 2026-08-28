# @nexis/telemetry

Nexis telemetry is an explicit opt-in client package. Importing the package does not install observers, network requests, cookies, or a global runtime. `createTelemetry({ endpoint, enabled: true })` sends only the documented low-cardinality events through `navigator.sendBeacon`: navigation timing, route-transition errors, chunk-load failures, and resumability activation duration.

```ts
const telemetry = createTelemetry({ enabled: import.meta.env.PROD, endpoint: '/__nexis/telemetry' })
telemetry.resumability(8)
```

The event envelope is `{ name, timestamp, route, value?, detail? }`. Routes are pathnames rather than full URLs, and details are caller-supplied diagnostic strings. When disabled, `renderTelemetryScript` returns the empty string and all send methods return `false`; this is the zero-default-byte contract. Applications must provide their own endpoint, retention policy, sampling, and consent handling.
