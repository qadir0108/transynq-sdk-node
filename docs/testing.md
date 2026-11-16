# Testing your integration

Unit tests should not call the real API. Answer the SDK's requests in memory:

```ts
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { ApiKeyCredential, TransynqClient } from '@transynq/sdk';

const server = setupServer(
  http.get('https://api.example.com/api/v1/countries', () => HttpResponse.json([{ id: 1, name: 'Australia' }])),
);
beforeAll(() => server.listen());
afterAll(() => server.close());

it('lists countries', async () => {
  const client = new TransynqClient({ baseUrl: 'https://api.example.com', credential: new ApiKeyCredential('test-key') });
  const countries = await client.referenceData.listCountries();
  expect(countries.data[0]?.name).toBe('Australia');
});
```

The SDK only uses `fetch`, so `msw` (as above) or a `fetch` option of your own answers requests without a network. You can also wrap the calls your code makes behind a small module of yours and mock that.

Tips:

- Never put real API keys, passwords, hostnames or customer data in tests; use fake values such as `test-key` and
  `https://api.example.com`.
- Answer error cases with ProblemDetails bodies (`{"title": "...", "status": 422, "code": "id-in-use"}`) to exercise your error
  handling; the SDK maps them to the same typed errors as in production.
- Set the client's max retries to 0 in tests that answer 5xx, or retries will consume your queued answers.
