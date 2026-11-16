import type { ApiResponse } from './types.js';

/** A page of a collection (`GET /resource?page=&pageSize=`). */
export interface PagedResponse<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

/** Reads page after page until an empty page or `page * pageSize >= total`. */
export async function* iteratePages<T>(
  fetchPage: (page: number) => Promise<ApiResponse<PagedResponse<T>>>,
  start = 1,
): AsyncIterableIterator<T> {
  let page = Math.max(1, start);
  for (;;) {
    const data = (await fetchPage(page)).data;
    if (!data || data.items.length === 0) return;
    yield* data.items;
    if (data.page * data.pageSize >= data.total) return;
    page++;
  }
}
