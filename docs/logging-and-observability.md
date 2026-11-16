# Logging and observability

```ts
const client = new TransynqClient({
  baseUrl: 'https://api.example.com',
  credential: new ApiKeyCredential(apiKey),
  logger: (message, details) => console.debug(message, details),   // one line per attempt, never bodies or secrets
  onRequest: (info) => console.log('->', info.method, info.operationId, '#', info.attempt),
  onResponse: (info) => console.log('<-', info.statusCode, `${info.elapsedMs} ms`),
});
```

- The logger receives one debug line per attempt: operation id, attempt number, status (or `timeout` / network error),
  duration and correlation id. Never request or response bodies, never credentials.
- The request hook runs before every attempt (method, URL, operation id, attempt, headers); the response hook after every
  answer (status, elapsed time, headers). Credential headers are `[redacted]` in both.
- Every request carries `User-Agent: transynq-sdk-node/1.0.0` (plus your suffix) and a client-generated `X-Correlation-Id`
  (32 hex characters, the same on every retry of one call). The API logs under that id and echoes it back.

## On every response

`ApiResponse<T>` exposes `data`, `statusCode`, `headers`, `etag`, `apiVersion` (`X-Api-Version`), `correlationId` (`X-Correlation-Id`), `location` and `isAccepted`.

`X-Api-Version` is the version of the contract that answered; log it next to your own version to diagnose a mismatch after an
API release.
