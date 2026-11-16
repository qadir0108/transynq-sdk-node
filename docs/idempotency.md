# Idempotency

## Creates with a client-generated id

Creates are idempotent by id: you generate the record's `id` and send it in the body. Sending the same request again returns the
same record (200); reusing the id with different data is refused with 422 `id-in-use`. Because of this, the SDK retries such
creates after a network failure or a 5xx without risk of duplicates.

```ts
await client.referenceData.createPublicHoliday({
  id: newId(), name: 'Show Day', date: dateOnly('2026-10-23'), countryId: 1, states: ['QLD'],
});   // safe to retry: same id, same record
```

## Idempotency-Key for commands

Commands without a natural id may carry an `Idempotency-Key` header. Sending one also makes the SDK treat the request as safe to
retry.

```ts
await client.jobs.repriceJobs(request, { idempotencyKey: newIdempotencyKey() });
await client.jobs.repriceJobs(request, { idempotencyKey: 'reprice-2026-11-16-run-1' });
```

Note: the API accepts the header (it is allowed through CORS) but, in API v1.0.0, no endpoint de-duplicates by it yet; until it
does, prefer creates with a client id, and only add an idempotency key to commands that are naturally repeatable.
