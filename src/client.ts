import { DriverLoginCredential, SessionCredential } from './core/credentials.js';
import { LongOperationFailedError, StaleVersionError } from './core/errors.js';
import { Transport, type ClientOptions } from './core/http.js';
import type { ApiResponse, FileDownload, JsonObject, RequestOptions, ResponseBody } from './core/types.js';
import type { GridQueryRequest, LongOperationResponse } from './generated/models.js';
import { Services } from './generated/index.js';

/** The states of a long operation (an open set: compare as strings). */
export const LongOperationStatus = { Queued: 'Queued', Running: 'Running', Succeeded: 'Succeeded', Failed: 'Failed' } as const;

/** Options of {@link LongOperationPoller.wait}. */
export interface WaitOptions {
  /** Time between polls (ms). Default 2 000. */
  pollIntervalMs?: number;
  /** Gives up after this long (ms). Default 30 minutes. */
  timeoutMs?: number;
  /** Called with every state read. */
  onProgress?: (operation: LongOperationResponse) => void;
  /** Cancels the wait. */
  signal?: AbortSignal;
}

/** Follows a long-running operation (`GET /api/v1/long-operations/{id}`) to its end. */
export class LongOperationPoller {
  /** The last state read. */
  last: LongOperationResponse | undefined;

  /** @internal */
  constructor(
    private readonly client: TransynqClient,
    /** The operation id. */
    readonly id: string,
  ) {}

  /** Reads the current state once. */
  async status(signal?: AbortSignal): Promise<LongOperationResponse> {
    this.last = (await this.client.longOperations.getLongOperation(this.id, signal ? { signal } : undefined)).data;
    return this.last;
  }

  /** Polls until `Succeeded` (resolves with it) or `Failed` (rejects with {@link LongOperationFailedError}). */
  async wait(options: WaitOptions = {}): Promise<LongOperationResponse> {
    const interval = options.pollIntervalMs ?? 2000;
    const limit = options.timeoutMs ?? 30 * 60_000;
    let waited = 0;
    for (;;) {
      const op = await this.status(options.signal);
      options.onProgress?.(op);
      if (op.status.toLowerCase() === 'succeeded') return op;
      if (op.status.toLowerCase() === 'failed') {
        throw new LongOperationFailedError(`Long operation ${this.id} (${op.kind}) failed: ${op.error ?? 'no reason given'}.`, op);
      }
      if (waited >= limit) throw new Error(`Long operation ${this.id} did not finish within ${limit} ms.`);
      await this.client.transport.sleep(interval, options.signal);
      waited += interval;
    }
  }

  /** The operation's result file (a workbook or PDF). */
  async downloadResult(): Promise<FileDownload> {
    return (await this.client.longOperations.getLongOperationFile(this.id)).data;
  }
}

/** The long operation a 202 answer started (its `Location`, else its body's `id`). */
export function operationIdFrom(response: ApiResponse<ResponseBody>): string {
  const location = response.location;
  if (location && /\/long-operations\//i.test(location)) {
    const last = location.split('?')[0]?.replace(/\/+$/, '').split('/').pop();
    if (last) return last;
  }
  const body = response.data.json<{ id?: unknown } | undefined>();
  if (body && typeof body.id === 'string') return body.id;
  throw new TypeError('The response is not a long-operation answer (no Location and no id).');
}

/**
 * The Transynq TMS API client. One property per API area (`client.jobs`, `client.customers`, ...), one method per operation.
 * Create one per base URL and credential and reuse it.
 */
export class TransynqClient extends Services {
  /** @internal */
  readonly transport: Transport;

  constructor(readonly options: ClientOptions) {
    const transport = new Transport(options);
    super(transport);
    this.transport = transport;
  }

  /** The `User-Agent` this client sends. */
  get userAgent(): string {
    return this.transport.userAgent;
  }

  /** A poller for the long operation a 202 answer started, or for an operation id. */
  pollLongOperation(accepted: ApiResponse<ResponseBody> | string): LongOperationPoller {
    return new LongOperationPoller(this, typeof accepted === 'string' ? accepted : operationIdFrom(accepted));
  }

  /** Every row of `POST /api/v1/grids/{gridId}/query`, page by page (page size default 500, the maximum). */
  async *iterateGridRows(gridId: string, request: GridQueryRequest, options?: RequestOptions): AsyncIterableIterator<JsonObject> {
    let page = request.page ?? 1;
    const pageSize = request.pageSize ?? 500;
    for (;;) {
      const data = (await this.grids.queryGrid(gridId, { ...request, page, pageSize }, options)).data;
      if (!data || data.rows.length === 0) return;
      yield* data.rows;
      if (data.page * data.pageSize >= data.total) return;
      page++;
    }
  }

  /** Ends a session or driver sign-in on the server and forgets it locally. */
  async signOut(): Promise<void> {
    const credential = this.options.credential;
    if (credential instanceof SessionCredential && credential.state) {
      await this.authentication.logout();
      credential.reset();
    } else if (credential instanceof DriverLoginCredential && credential.state) {
      await this.driverApp.driverLogout();
      credential.reset();
    }
  }
}

/** Loads (with its ETag), saves with `If-Match`; on {@link StaleVersionError} reloads and repeats. */
export async function readModifyWrite<T, R>(
  load: () => Promise<ApiResponse<T>>,
  save: (current: T, options: RequestOptions) => Promise<ApiResponse<R>>,
  maxAttempts = 3,
): Promise<ApiResponse<R>> {
  if (maxAttempts < 1) throw new RangeError('maxAttempts must be at least 1');
  for (let attempt = 1; ; attempt++) {
    const current = await load();
    if (!current.etag) throw new Error('The loaded record has no ETag.');
    try {
      return await save(current.data, { ifMatch: current.etag });
    } catch (error) {
      if (!(error instanceof StaleVersionError) || attempt >= maxAttempts) throw error;
    }
  }
}

/** A new client id for an idempotent create (`POST` with `id` in the body). */
export function newId(): string {
  return globalThis.crypto.randomUUID();
}

/** A new `Idempotency-Key` value. */
export function newIdempotencyKey(): string {
  return globalThis.crypto.randomUUID().replace(/-/g, '');
}
