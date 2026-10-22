---
name: error-handling
description: Design or review how errors are detected, classified, logged, and returned. Use when adding an API error response, choosing an HTTP status code, shaping an error payload, writing retry logic, adding error logging, or surfacing a failure in the UI. Covers AppError, the envelope, the status-code table, what gets logged, retry policy, Next.js error files, and required failure-path tests.
---

# Error Handling

## Principles

- Fail fast on invalid input, at the edge, with a message that names the field.
- One error type in the backend (`AppError` in `backend/src/services/utils/error.ts`), one envelope
  in every non-2xx response, one place that maps errors to HTTP
  (`middleware/error-handler.ts`). The one exception is a health endpoint: nothing in the
  request failed, so `GET /api/health/ready` answers 503 with its own `Readiness` body
  (the `dependencies` map), registered as such in the contract. No other endpoint does this.
- Internal detail goes to the log under the request id, never to the client.

## Backend

Services throw `new AppError(code, message, details?)`. The route adapter validates the
request parts it reads with `validate()` from `middleware/validate.ts`, which throws
`validation_failed` with the failing fields; a controller propagates a callee's `AppError`
unchanged and may throw one for a composition rule; nothing but the error handler builds
an error response. The error handler maps an `AppError` to its status, a `ZodError` that escaped
anyway to 400, body-parser failures to 400, 413 or 415, and everything else to a bare
`internal` envelope after logging it.

| Code | Status | Use for |
| --- | --- | --- |
| `validation_failed` | 400 | Malformed or out-of-range input; `details` lists `{ path, message }` |
| `unauthenticated` | 401 | Missing, invalid, expired or replayed token; wrong credentials (one message for an unknown email and a wrong password); wrong or expired OTP |
| `forbidden` | 403 | Authenticated but not allowed: role mismatch, blocked account, another user's target (including another tenant's data) |
| `not_found` | 404 | Missing resource, or a resource the caller may not know exists |
| `conflict` | 409 | State conflict, duplicate key |
| `payload_too_large` | 413 | Body over the parser limit (mapped from body-parser) |
| `unsupported_media_type` | 415 | Body encoding or charset the parser rejects |
| `rate_limited` | 429 | Throttling; sends `Retry-After` |
| `internal` | 500 | Unexpected; logged with stack, returned bare |
| `upstream_unavailable` | 503 | A dependency failed, or a message could not be delivered; safe to retry later |

Envelope (`ErrorBody` in `services/utils/error.ts`, also in `openapi.json`):

```json
{
  "error": { "code": "validation_failed", "message": "invalid body", "details": [{ "path": "title", "message": "Too small" }] },
  "requestId": "6f0c…"
}
```

Never include secrets, stack traces, query text or raw provider payloads in a response.

## Logging

- Everything logs through `log` from `backend/src/services/logger.ts` (`info`, `warn`,
  `error`; one line, then `key=value` fields; over `console`). Nothing else calls
  `console` in the server.
- One line per request from `middleware/request-log.ts` with method, path (without the
  query string), status, duration and `requestId`.
- Every 5xx logs the error object with its stack under the same `requestId`
  (`log.error` in the error handler).
- Never log headers, bodies, tokens, passwords or cookies; the request line carries no
  query string either. A service that must log a
  payload logs ids, never the payload. A field value is a primitive; never pass an object.
- A log field key must never match `/password|token|secret|otp|code|cookie|authorization/i`
  unless its value is a secret (the logger redacts those keys); an error code logs as `reason`.
- If the product adopts a logging library later, it goes behind `services/logger.ts` (its
  `createLogger` is the seam); call sites do not change.

## Retry and recovery

- On the request path, retry only `upstream_unavailable`-class failures, bounded (three
  attempts, exponential backoff), on idempotent operations.
- Never retry validation, auth or domain errors.
- Connecting a store at boot is a different policy: `withRetry` in
  `backend/src/infra/dependency.ts` (10 attempts, 500 ms base, 5 s cap, 5 s per attempt),
  because the compose service may still be starting. Reconnecting after a drop is the
  driver's job; a query that fails because the store is unreachable surfaces as
  `upstream_unavailable` from the service.

## Frontend

- Loaders return a value for expected failures (`{ reachable: false, reason }`), so the
  page renders a state instead of throwing.
- Unexpected failures reach the nearest `error.tsx`; every route segment that loads data
  has `loading.tsx` and `error.tsx`.
- Server actions return `{ ok: false, error }` for validation and domain failures and
  show it with `sonner` (`toast.error`), specific to the action that failed, with a
  recovery hint (retry, fix the field, sign in again).

## Tests

Every endpoint has a test for its validation failure and its not-found path asserting
the envelope's `code` and `requestId`, not only the status. Every loader has a test for
the unreachable-API path.
