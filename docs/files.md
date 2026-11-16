# File upload and download

## Upload (multipart/form-data)

27 operations take files (documents, PODs, photos, imports, logos). Their parts are typed: a `FileUpload` per file part, plain
values for text parts.

```ts
const added = await client.jobs.addJobPods(jobId, {
  files: [
    FileUpload.fromBytes(await readFile('pod.pdf'), 'pod.pdf', 'application/pdf'),
    FileUpload.fromBlob(photoBlob, 'photo.jpg'),
  ],
});
console.log(added.data.ids);
```

`FileUpload.fromBytes` takes a `Uint8Array`, `ArrayBuffer` or string; `FileUpload.fromBlob` takes a `Blob` or `File`.

## Download (streamed)

Operations that answer with a file (document, POD, photo and attachment downloads, exports, journals, long-operation results)
return a streamed `FileDownload` with its media type, file name (from `Content-Disposition`) and length.

```ts
const pod = (await client.jobs.downloadJobPod(jobId, podId)).data;   // streamed
console.log(pod.fileName, pod.contentType, pod.length);
await writeFile(`pods/${pod.fileName ?? 'pod.pdf'}`, await pod.bytes());
// or stream it: Readable.fromWeb(pod.stream()!).pipe(createWriteStream('pod.pdf'))
```

## Operations with an undeclared answer

The contract does not declare the answer of about 400 operations; they return a buffered `ResponseBody` that may hold JSON, a
small file or nothing:

```ts
const answer = await client.referenceData.listCountryStates(countryId);   // an operation whose answer the contract does not declare
console.log(answer.data.contentType, answer.data.json<Array<{ name: string }>>());
```
