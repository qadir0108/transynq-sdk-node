# Long-running operations

Some operations (background imports, document packs, reports) queue work and answer **202 Accepted** with
`Location: /api/v1/long-operations/{id}` and a body `{ id, status }`. The operation then goes through the states
`Queued` -> `Running` -> `Succeeded` or `Failed`; `GET /api/v1/long-operations/{id}` reads it
(`{ id, kind, inputName, requestedBy, requestedUtc, status, startedUtc, finishedUtc, result, error }`), and
`GET /api/v1/long-operations/{id}/file` downloads a produced file (a workbook or a PDF).

```ts
const accepted = await client.imports.importZonesInBackground({ file: FileUpload.fromBytes(await readFile('zones.xlsx'), 'zones.xlsx') });
const poller = client.pollLongOperation(accepted);         // from the 202 Location header
const done = await poller.wait({ pollIntervalMs: 2_000, timeoutMs: 600_000, onProgress: (op) => console.log(op.status) });
console.log(done.result);                                  // the import report (JSON)

// a report or document pack: download its file
const file = await poller.downloadResult();
await writeFile(file.fileName ?? 'result.xlsx', await file.bytes());
```

`wait` rejects with `LongOperationFailedError` (with `operation.error`) when the operation ends `Failed`, and with an `Error` after `timeoutMs`. `client.pollLongOperation(id)` follows an operation by id.

There is no numeric progress in the API: the progress callback receives every state read. Poll intervals of 1 to 5 seconds are
appropriate; the API also notifies the browser UI through SignalR, which SDK clients do not need.
