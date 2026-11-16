# Pagination and grid queries

## Paged collections

Collections answer `PagedResponse { items, page, pageSize, total }` (`page` starts at 1, `pageSize` 1..200, default 50;
`sort` is a comma list such as `-date,name` from the resource's whitelist). Operations that return one also have an
**auto-paging** variant that reads page after page until an empty page or `page * pageSize >= total`.

```ts
// one page
const page = await client.referenceData.listPublicHolidays({ countryId: 1, year: 2026, page: 1, pageSize: 50, sort: '-date' });
console.log(`${page.data.items.length} of ${page.data.total}`);

// every item, page by page
for await (const holiday of client.referenceData.listPublicHolidaysAutoPaging({ countryId: 1, year: 2026 })) {
  console.log(holiday.date, holiday.name);
}
```

## Grid queries (large lists)

Large lists - jobs, invoices, manifests - are read through the grid endpoints: `GET /api/v1/grids` lists the grids,
`GET /api/v1/grids/{id}` is a grid's definition (its columns, filter operators and sort keys are the whitelist), and
`POST /api/v1/grids/{id}/query` reads one page of rows (page size up to 500, at most 4 sort keys; filter values as text, dates
`yyyy-MM-dd` or relative such as `today-30`). The SDK's grid helper iterates every row:

```ts
const definition = (await client.grids.getGrid('jobs')).data;   // the columns and operators you may use
const request: GridQueryRequest = {
  columns: ['jobNumber', 'customer', 'status'],
  filters: [{ column: 'status', operator: 'eq', values: ['Booked'] }],
  sort: null, page: null, pageSize: 500, search: null, summaries: null,
};
for await (const row of client.iterateGridRows('jobs', request)) console.log(row['jobNumber']);
```

Value lists (`.../facets/{column}`), CSV export (`.../export`, up to 100,000 rows, a streamed file) and saved views
(`.../views/{viewId}`) are ordinary operations of the Grids group; see the [resource index](resources/README.md#grids).
