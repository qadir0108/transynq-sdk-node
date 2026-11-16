/** A UUID string (`6f1c7a52-3d6b-4b5e-9a3e-0c1d2e3f4a5b`). */
export type Uuid = string;

/** A calendar day `yyyy-MM-dd` (a C# `DateOnly`), never a midnight instant. Build one with {@link dateOnly}. */
export type DateOnly = string & { readonly __brand?: 'DateOnly' };

/** A UTC instant as ISO-8601 text (`2026-10-02T03:04:05Z`). */
export type Instant = string;

/**
 * A decimal (money, quantities). Responses hold a `number`, or the exact digits as a `string` when a `number` would lose
 * precision (Node >= 21; older runtimes always give a `number`). Requests may pass either: the API reads numbers from strings.
 */
export type Decimal = number | string;

/** Any JSON value. */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/** A JSON object. */
export type JsonObject = { [key: string]: JsonValue };

/** Makes a {@link DateOnly} from `yyyy-MM-dd` text or a `Date` (its UTC calendar day). */
export function dateOnly(value: string | Date): DateOnly {
  const text = typeof value === 'string' ? value : value.toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new TypeError(`'${text}' is not a yyyy-MM-dd date`);
  return text as DateOnly;
}

/** Per-call options. */
export interface RequestOptions {
  /** Sent as `If-Match` (PUT and DELETE require it; take it from {@link ApiResponse.etag}). */
  ifMatch?: string;
  /** Sent as `Idempotency-Key`; also makes a POST retryable. */
  idempotencyKey?: string;
  /** Extra request headers. */
  headers?: Record<string, string>;
  /** Overrides the client's timeout (milliseconds) for this call. */
  timeoutMs?: number;
  /** Overrides the client's retries for this call. */
  maxRetries?: number;
  /** Overrides the generated `X-Correlation-Id`. */
  correlationId?: string;
  /** Cancels the call. */
  signal?: AbortSignal;
}

/** An answer of the API: the data plus ETag, API version, correlation id and Location. */
export class ApiResponse<T> {
  /** @internal */
  constructor(
    /** HTTP status. */
    readonly statusCode: number,
    /** The deserialised body (`undefined` when empty). */
    readonly data: T,
    /** Response headers (lower-case names). */
    readonly headers: Readonly<Record<string, string>>,
  ) {}

  /** The `ETag` header verbatim (quotes kept), to send back as `ifMatch`. */
  get etag(): string | undefined {
    return this.headers['etag'];
  }

  /** The contract version that answered (`X-Api-Version`). */
  get apiVersion(): string | undefined {
    return this.headers['x-api-version'];
  }

  /** The request's correlation id (`X-Correlation-Id`). */
  get correlationId(): string | undefined {
    return this.headers['x-correlation-id'];
  }

  /** The `Location` header (a 202 points at `/api/v1/long-operations/{id}`). */
  get location(): string | undefined {
    return this.headers['location'];
  }

  /** Whether the API accepted long-running work (202). */
  get isAccepted(): boolean {
    return this.statusCode === 202;
  }
}

/** A buffered body of an operation whose contract does not declare its response (JSON, a small file, or nothing). */
export class ResponseBody {
  /** @internal */
  constructor(
    /** The raw bytes. */
    readonly content: Uint8Array,
    /** The media type, if any. */
    readonly contentType: string | undefined,
    /** The file name from `Content-Disposition`, if any. */
    readonly fileName: string | undefined,
    private readonly parse: (text: string) => unknown,
  ) {}

  /** True when the body is empty. */
  get isEmpty(): boolean {
    return this.content.length === 0;
  }

  /** The body as UTF-8 text. */
  text(): string {
    return new TextDecoder().decode(this.content);
  }

  /** The body parsed as JSON (losslessly for decimals), or `undefined` when empty. */
  json<T = unknown>(): T {
    return (this.isEmpty ? undefined : this.parse(this.text())) as T;
  }
}

/** A streamed file answer. Read it once ({@link FileDownload.bytes} or {@link FileDownload.stream}). */
export class FileDownload {
  /** @internal */
  constructor(
    private readonly response: Response,
    /** The file name from `Content-Disposition`, if any. */
    readonly fileName: string | undefined,
  ) {}

  /** The media type, e.g. `application/pdf`. */
  get contentType(): string | undefined {
    return this.response.headers.get('content-type')?.split(';')[0] || undefined;
  }

  /** The length when the server sent it. */
  get length(): number | undefined {
    const value = this.response.headers.get('content-length');
    return value ? Number(value) : undefined;
  }

  /** The content as a web stream. */
  stream(): ReadableStream<Uint8Array> | null {
    return this.response.body;
  }

  /** Reads the whole content. */
  async bytes(): Promise<Uint8Array> {
    return new Uint8Array(await this.response.arrayBuffer());
  }

  /** Releases the connection without reading. */
  async cancel(): Promise<void> {
    await this.response.body?.cancel();
  }
}
