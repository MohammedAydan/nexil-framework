# Security Policy

## Scope

Nexis is an experimental web framework. Security-sensitive behavior includes HTML rendering, serialization, server/client graph separation, cookies, CSRF, redirects, cache keys, server actions, and adapter request handling.

## Development requirements

Security changes must include a threat model, a public API contract, negative tests, and an explanation of any effect on caching, serialization, or boundary crossing. Production diagnostics must not expose secrets, credentials, or stack traces. New dependencies require a documented purpose, license review, lockfile update, and vulnerability review.

The implementation uses OWASP ASVS 5.0 as the verification baseline, W3C CSP Level 3 for content policy behavior, WHATWG Fetch for request/response semantics, and RFC 6265 cookie behavior while RFC 6265bis remains under standardization.

## Reporting

Please do not disclose an exploitable issue publicly before maintainers have had a reasonable opportunity to reproduce and fix it. Include a minimal reproduction, affected package and version, impact, and any deployment assumptions. Do not include real credentials or personal data in reports.

## Release policy

A release candidate cannot ship with an unaccepted critical or high-severity security finding, secret leakage, cross-request data leakage, or a failing boundary/CSRF/CSP/cookie regression suite.
