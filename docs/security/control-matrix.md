# Nexis Security Control Matrix

This matrix translates the project security contract into verifiable implementation controls. The baseline is OWASP ASVS 5.0, with CSP behavior aligned to W3C CSP Level 3, request semantics aligned to WHATWG Fetch, and cookie behavior aligned to RFC 6265 while RFC 6265bis is monitored.

| Trust boundary               | Threat                                                   | Required control                                                                   | Evidence                        |
| ---------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------- |
| Render tree to HTML          | XSS through text, attributes, or JSON-LD                 | Context-aware escaping; no event attributes in SSR; safe JSON script encoding      | Renderer and SEO negative tests |
| Server graph to client graph | Secret leakage and privileged code exposure              | Compiler import diagnostics; public environment allowlist; bundle inspection       | Boundary fixtures and CI grep   |
| Request to cache             | Cross-user data disclosure and cache poisoning           | Request-scoped data registry; identity-aware cache keys; private response defaults | Concurrent isolation matrix     |
| Browser to action endpoint   | CSRF and cross-origin mutation                           | Trusted-origin checks; SameSite cookies; optional action token; authorization hook | Cross-origin E2E                |
| User input to redirect       | Open redirect and header injection                       | URL parsing and allowlists; reject CRLF                                            | Malicious URL fixtures          |
| Payload to serializer        | Prototype pollution, code execution, resource exhaustion | Plain-object-only values, versioned envelope, size/depth limits                    | Fuzz/property tests             |
| Dependency supply chain      | Compromised or vulnerable dependency                     | Lockfile, audit, SBOM, provenance and review                                       | CI artifact reports             |
| Adapter to platform          | Runtime mismatch or unsafe capability assumption         | Web Standard core; documented capability matrix; parity E2E                        | Three-adapter suite             |

## Threat-model questions

For every new public API, maintainers must identify the attacker, entry point, trust boundary, protected asset, abuse outcome, default mitigation, and residual deployment assumption. An API that crosses serialization, caching, HTML, server/client, or authorization boundaries cannot be merged without negative tests.

## Release severity policy

Critical and high-severity findings that affect unauthenticated execution, secret disclosure, authorization boundaries, cross-user isolation, or stored XSS block a release candidate. Medium findings require a documented mitigation or accepted risk. Pure defense-in-depth gaps are tracked separately and must not be presented as confirmed vulnerabilities without a reproducible exploit.
