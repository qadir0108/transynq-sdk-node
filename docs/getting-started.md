# Getting started

## 1. Install

```shell
npm install @transynq/sdk
```

## 2. Get a credential

Ask your Transynq administrator for an **API client key** (recommended for integrations: it is tied to one company and needs no
password), or use a user name and password for a session. Keep secrets out of source control: read them from the environment or a
secret store.

## 3. Make a first call

```ts
import { ApiKeyCredential, TransynqClient } from '@transynq/sdk';

const client = new TransynqClient({
  baseUrl: 'https://api.example.com',
  credential: new ApiKeyCredential(process.env.TRANSYNQ_API_KEY!),
});

const countries = await client.referenceData.listCountries();
for (const country of countries.data) console.log(country.name);
console.log(`Answered by API ${countries.apiVersion}, correlation id ${countries.correlationId}`);
```

## 4. Learn the shape of the client

One property per OpenAPI tag (`client.jobs`, `client.referenceData`, `client.driverApp`...), one method per operation named after its `operationId` in camel case (`getJob`, `listCountries`). Path parameters come first, then the body (or a form object for uploads), then a query object, then `RequestOptions` (which also carries an `AbortSignal`). Every method returns a `Promise<ApiResponse<T>>`.

- Every answer is an `ApiResponse` with the data and the headers you need: `ApiResponse<T>` exposes `data`, `statusCode`, `headers`, `etag`, `apiVersion` (`X-Api-Version`), `correlationId` (`X-Correlation-Id`), `location` and `isAccepted`.
- About 400 operations do not declare their answer in the contract (they return JSON, a file or nothing). They return a buffered
  `ResponseBody` (bytes, content type, file name) with JSON helpers; clear file downloads return a streamed `FileDownload`.
- The [resource index](resources/README.md) lists every operation with its method name.

## 5. Next steps

- [Authentication](authentication.md) - sessions, CSRF and driver tokens.
- [Error handling](error-handling.md) - typed errors and correlation ids.
- [Pagination](pagination.md), [Concurrency](concurrency.md), [Idempotency](idempotency.md), [Long-running operations](long-running-operations.md).
- The runnable samples in `examples/flows.ts` (`npm run example -- sign-in`).
