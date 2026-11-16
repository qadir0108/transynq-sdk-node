# Error handling

Every non-2xx answer becomes a typed error built from the API's ProblemDetails body
(`type`, `title`, `status`, `detail`, `code`, `correlationId`, and `errors` for validation).

| Status | `code` (examples) | TypeScript error class |
|---|---|---|
| 400 | `validation`, `unreadable-request` | `ValidationError` (`errors`) |
| 401 | `invalid-token` or none | `AuthenticationError` |
| 403 | `forbidden` or none | `PermissionDeniedError` |
| 404 | `not-found`, `unknown-company` | `NotFoundError` |
| 409 | `conflict` | `ConflictError` |
| 412 | `stale-version` | `StaleVersionError` |
| 422 | the rule: `year-exists`, `id-in-use`, `rule-violated`, `mail-held-back`... | `BusinessRuleError` |
| 429 | none (`Retry-After` header) | `RateLimitError` (`retryAfterMs`) |
| 5xx | `unexpected`, `not-implemented` (501) | `ServerError` |
| other 4xx | as sent | `ApiError` |
| no answer | - | `ConnectionError` / `TimeoutError` |

Every `ApiError` exposes `status`, `code`, `title`, `detail`, `type`, `correlationId`, `rawBody`, `headers` and `operationId`. All SDK errors extend `TransynqError`; a failed long operation rejects with `LongOperationFailedError` (`operation`). `ConnectionError` and `TimeoutError` are the SDK's own classes exported by `@transynq/sdk`.

```ts
import { ApiError, BusinessRuleError, ConnectionError, RateLimitError, ValidationError } from '@transynq/sdk';

try {
  await client.referenceData.createPublicHoliday(holiday);
} catch (error) {
  if (error instanceof ValidationError) {                 // 400
    for (const [field, messages] of Object.entries(error.errors)) console.log(field, messages.join('; '));
  } else if (error instanceof BusinessRuleError) {        // 422
    console.log(`Refused by rule ${error.code}: ${error.detail}`);
  } else if (error instanceof RateLimitError) {           // 429 after retries
    console.log(`Try again in ${error.retryAfterMs} ms`);
  } else if (error instanceof ApiError) {                 // any other answer
    console.log(error.status, error.code, error.title, '- quote correlation id', error.correlationId);
  } else if (error instanceof ConnectionError) {          // no answer (TimeoutError extends it)
    console.log(error.message);
  } else {
    throw error;
  }
}
```

## What the fields mean

- `code` is stable across languages and releases: branch on it, not on `title` (the title is translated into the user's language).
- `detail` is the business rule's sentence for 422 answers.
- `correlationId` identifies the request in the API's logs. It is in every problem body and in the `X-Correlation-Id` header;
  quote it when you contact support. The SDK sends its own correlation id on every request (the same on every retry of one call).
- Out-of-scope ids answer **404**, never 403: you cannot tell "missing" from "not yours".
- A 400 is also returned when `If-Match` is missing on a PUT or DELETE that requires it.

## Retries happen before you see an error

Retryable failures (see [Configuration](configuration.md#retries)) are retried first; the error you catch is the last answer.
