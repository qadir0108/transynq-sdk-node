# Transynq Node.js / TypeScript SDK

The official Node.js / TypeScript client for the **Transynq TMS API** (`/api/v1`): every one of the API's 705 operations, grouped by
area (jobs, bookings, dispatch, invoicing, customers, driver app...), with typed models, authentication, retries, typed errors,
paging, optimistic concurrency, file transfer and long-running operations handled for you.

- Package: `@transynq/sdk` - version 1.0.0 (semantic versioning, independent of the API version)
- Generated from the Transynq API OpenAPI 3.1 contract v1.0.0 plus a hand-written core
- Licence: [MIT](LICENSE)

## Requirements

- Node.js 18.17 or later (uses the built-in `fetch`, `FormData`, `Blob` and `crypto.randomUUID`)
- No runtime dependencies; TypeScript types are included (ESM and CommonJS builds)

## Install

```shell
npm install @transynq/sdk
```

## Quick start

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

One property per OpenAPI tag (`client.jobs`, `client.referenceData`, `client.driverApp`...), one method per operation named after its `operationId` in camel case (`getJob`, `listCountries`). Path parameters come first, then the body (or a form object for uploads), then a query object, then `RequestOptions` (which also carries an `AbortSignal`). Every method returns a `Promise<ApiResponse<T>>`.

Every call returns an `ApiResponse`: `ApiResponse<T>` exposes `data`, `statusCode`, `headers`, `etag`, `apiVersion` (`X-Api-Version`), `correlationId` (`X-Correlation-Id`), `location` and `isAccepted`.

## Authentication

The API accepts three non-browser credentials; pick the one that matches your integration.

| Credential | When | Wire |
|---|---|---|
| `ApiKeyCredential` | server-to-server integrations | `X-Transynq-APIKey: <key>` |
| `SessionCredential` | tools acting as a named user | `POST /api/v1/auth/login`, then the session cookie + `X-CSRF-Token` |
| `DriverLoginCredential` / `DriverTokenCredential` | driver / POD apps (`/api/v1/driver/*`) | `Authorization: Bearer <token>` |

```ts
const client = new TransynqClient({
  baseUrl: 'https://api.example.com',
  credential: new ApiKeyCredential('tq_example_key_123'),   // sent as X-Transynq-APIKey
});
const who = await client.authentication.getApiClient();     // { companyId, description }
console.log(who.data.json());
```

See [docs/authentication.md](docs/authentication.md) for sessions, CSRF and driver tokens.

## Documentation

- [Getting started](docs/getting-started.md)
- [Authentication](docs/authentication.md)
- [Configuration](docs/configuration.md)
- [Error handling](docs/error-handling.md)
- [Pagination and grid queries](docs/pagination.md)
- [Concurrency (ETag / If-Match)](docs/concurrency.md)
- [Idempotency](docs/idempotency.md)
- [Long-running operations](docs/long-running-operations.md)
- [File upload and download](docs/files.md)
- [Logging and observability](docs/logging-and-observability.md)
- [Dates, money and enums (type mapping)](docs/types.md)
- [Testing your integration](docs/testing.md)
- [Versioning and compatibility](docs/versioning.md)
- [Troubleshooting and FAQ](docs/troubleshooting.md)
- [Resource index (every operation, generated)](docs/resources/README.md)

Runnable samples of real flows (sign in, list and page grid rows, create a booking idempotently, update with If-Match, list
invoices, upload a POD, wait on a long operation) are in [`examples/flows.ts`](examples/flows.ts).

The API reference is generated from the TSDoc comments with TypeDoc (`typedoc.json` in this repository):

```shell
npm run docs   # writes docs/api/ (not checked in)
```

## Support

- Bugs and feature requests: [GitHub issues](https://github.com/qadir0108/transynq-sdk-node/issues) (use the templates; never paste real keys, passwords or customer data).
- Security problems: see [SECURITY.md](SECURITY.md) - do not open a public issue.
- When the API answers with an error, quote its correlation id (`correlationId` on the error).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and the [code of conduct](CODE_OF_CONDUCT.md).

## Licence

[MIT](LICENSE) - Copyright (c) 2026 Transynq.
