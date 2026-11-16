# Concurrency (ETag / If-Match)

The API uses optimistic concurrency. A GET, POST or PUT answer carries an `ETag`; a PUT or DELETE must send it back in
`If-Match`:

- no `If-Match` -> **400** (`validation`);
- an `If-Match` that no longer matches -> **412** (`stale-version`): someone saved first; reload and apply your change again.

```ts
const current = await client.referenceData.getPublicHoliday(id);          // ETag: "..."
await client.referenceData.updatePublicHoliday(
  id,
  { ...current.data, name: 'Australia Day' },
  { ifMatch: current.etag! },                                              // 412 StaleVersionError if someone saved first
);
```

## Read-modify-write helper

The helper loads the record (with its ETag), lets you build the change, saves it with `If-Match`, and on a stale version
loads again and repeats (3 attempts by default):

```ts
const saved = await readModifyWrite(
  () => client.referenceData.getPublicHoliday(id),
  (current, options) => client.referenceData.updatePublicHoliday(id, { ...current, name: `${current.name} (observed)` }, options),
  3,
);
```

The ETag is passed through verbatim (quotes included); never build one yourself.
