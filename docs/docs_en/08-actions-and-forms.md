# 08 — Actions, Forms, and Server Requests

## What is an Action?

An Action is a server operation invoked through a dedicated endpoint. Use it to process forms, create records, send messages, or perform work requiring server authority. The browser receives a reference and request data, not the server implementation or its secrets.

## Start with native HTML

Build a form that works without JavaScript first:

```tsx
<form action="/__nexis/actions/contact/submit" method="post">
  <label for="email">Email</label>
  <input id="email" name="email" type="email" required />
  <button type="submit">Send</button>
</form>
```

Then add `onSubmit$` to enhance the experience asynchronously while retaining the real `action` and `method` as a fallback.

## Action transport stages

The transport should:

1. Validate the HTTP method.
2. Parse JSON, URL-encoded, or multipart input according to Content-Type.
3. Enforce a request-size limit.
4. Check Origin and site policy.
5. Validate the input schema.
6. Apply `Idempotency-Key` when present.
7. Execute the server handler.
8. Return a typed envelope:

```ts
{ ok: true, data: result }
{ ok: false, errors: [{ field: 'email', message: 'Invalid email' }] }
```

## Validation

Do not rely on browser validation alone. Validate types, lengths, ranges, and allowed values on the server. Keep validation separate from authorization: valid input does not mean that the current user may perform the operation.

```ts
const input = parseContactInput(await request.formData())
if (!input.email.includes('@')) {
  return { ok: false, errors: [{ field: 'email', message: 'Invalid email' }] }
}
```

## Origin and CSRF

The server checks Origin so that a different site cannot submit a state-changing POST. Define allowed origins explicitly in production. `NEXIS_TRUST_PROXY=1` is safe only behind a proxy that strips client-supplied forwarded headers and writes trusted values.

Origin validation is not authorization. After checking the origin, verify the user session, role, and ownership of the target resource.

## Idempotency

If a request may be retried because of a network failure, send an `Idempotency-Key`. The key prevents duplicate execution within the store’s retention period.

The default store is process-local and is therefore insufficient for multi-instance production. Use a durable bounded store such as Redis or a database for payments and other non-repeatable work, with TTL and an atomic claim operation.

## Cookies and authorization

Do not put authorization in a hidden input. Use a server-side session or secure cookie. Review `HttpOnly`, `Secure`, `SameSite`, expiration, and path. Never store secrets in localStorage.

## Telemetry receiver

The production server can expose an optional `POST /__nexis/telemetry` receiver. It returns `202` for a valid event object and `400` for a malformed body. This is a minimal local receiver, not a complete ingestion, consent, retention, or analytics system.

## Common mistakes

| Mistake                                           | Correction                                           |
| ------------------------------------------------- | ---------------------------------------------------- |
| Mutating state through GET                        | Use POST or another appropriate method               |
| Validating only in the browser                    | Validate again on the server                         |
| Accepting arbitrary origins                       | Use an explicit allowlist                            |
| Process-local idempotency with multiple instances | Use shared durable storage                           |
| Returning internal errors to users                | Return a safe message and log securely               |
| Executing server code in the client bundle        | Keep implementation server-side                      |
| Omitting loading state                            | Disable the control and provide `aria-live` feedback |

## Action testing

Test success, invalid input, rejected Origin, unsupported methods, duplicate idempotency keys, oversized bodies, and disconnects. Also test that the native form works when JavaScript is disabled.
