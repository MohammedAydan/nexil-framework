# 14 — Security and Operations

## Threat model

Treat every browser input as untrusted, including pathnames, query strings, headers, cookies, multipart files, and redirect targets. Treat every client bundle as public. Never place secrets or authorization decisions in browser code.

## Security layers

| Layer      | Protection                                         |
| ---------- | -------------------------------------------------- |
| Renderer   | Escaping for text and attributes                   |
| SEO        | URL validation and safe JSON-LD serialization      |
| Router     | Traversal rejection and safe matching              |
| Server     | Method allowlist, body limits, and cache policy    |
| Actions    | Origin, validation, authorization, and idempotency |
| Deployment | TLS, proxy sanitation, and rate limits             |
| Operations | Safe logs, alerts, and rollback                    |

## XSS

Do not insert user-provided HTML directly. Prefer text nodes or a carefully scoped sanitizer. JSON-LD must escape `<`, `>`, and `&` so user content cannot break out of a script context.

## SSRF

When a server fetches a user-provided URL, allow only HTTP(S), restrict hosts, block private IP ranges, enforce timeouts and size limits, and control redirects. Remote image fetching is a real SSRF surface.

## Actions and CSRF

Origin checks are important but do not replace authorization. Nexil Actions reject a
malformed or untrusted supplied `Origin`; a missing Origin remains compatible with
non-browser callers and therefore is not a complete CSRF defense by itself. After
validating the origin, verify the session, role, and resource ownership. Use CSRF
tokens and SameSite cookies according to the threat model, especially for sensitive
mutations. The `Form` token header is a transport affordance; applications must
implement and test the server-side token policy they require.

## Proxy headers

For the Node production server, `trustProxy: true` is opt-in. It trusts only the first
validated `x-forwarded-proto` (`http` or `https`) and `x-forwarded-host` when
reconstructing Action request URLs. Trust it only when a trusted proxy removes client
values and writes its own; never enable it on a directly exposed application. The
development server’s `NEXIL_TRUST_PROXY=1` remains a local-development setting, not a
deployment policy.

## Cookies

Recommended session attributes are:

```text
HttpOnly; Secure; SameSite=Lax
```

Use `SameSite=Strict` when appropriate, and set path and expiration explicitly. Do not store secrets in localStorage.

## Security headers

Pass `securityHeaders` to `createServer` or compose the exported
`createSecurityHeaders(options)` helper. Its reviewed defaults are `nosniff`,
`X-Frame-Options: DENY`, `strict-origin-when-cross-origin`, and denial of camera,
microphone, and geolocation. CSP and HSTS remain opt-in. Header values with CR or LF
are rejected to prevent response-splitting configuration mistakes. Start a new CSP in
report-only mode where deployment infrastructure supports it, then tighten it after
reviewing required assets.

The Node integration suite exercises header application, CR/LF rejection, rejected
cross-origin Actions, and proxy reconstruction. It is not proof of a browser CSP
rollout or HTTPS cookie behavior; test those against the deployed application.

## Secrets

- Never commit `.env` files.
- Never pass `process.env.SECRET` into JSX.
- Never print tokens or full request headers in logs.
- Use a secret manager in production.
- Rotate and revoke credentials through an explicit process.

## Rate and body limits

Limit forms and telemetry, rate-limit by IP/session/user, and protect bursty endpoints. The Node body limit is not a substitute for CDN or WAF limits.

## Distributed idempotency

Process-local storage is suitable for a single process or test. Multi-instance production needs a durable store with TTL, bounded memory, and an atomic claim for each key.

## Telemetry privacy

Web Vitals can be associated with user behavior. Collect the minimum data, avoid sensitive URLs and query strings, apply consent where required, and define retention and access policy. A local receiver is not a complete privacy or governance system.

## Dependency security

Run `pnpm audit --audit-level=high`, review the lockfile, and pin versions. Review new build tools carefully because CI build dependencies can execute code in the build environment.

## Incident readiness

Maintain structured logs without secrets, a request/correlation ID, a health endpoint, metrics for 4xx/5xx and latency, a rollback build, configuration backups, and a documented runbook.

## Production checklist

- Does every Action validate input, Origin, authorization, and replay behavior?
- Are forwarded headers actually trusted?
- Is private HTML excluded from shared caches?
- Are traversal candidates rejected?
- Are external image hosts allowlisted?
- Are CSP and cookie policies reviewed?
- Does telemetry respect consent and retention?
- Is idempotency durable for important operations?
