import type { LongOperationResponse } from '../generated/models.js';

/** Base of every error the SDK raises. */
export class TransynqError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** No answer: the connection failed (DNS, TLS, reset). */
export class ConnectionError extends TransynqError {}

/** No answer within the timeout. */
export class TimeoutError extends ConnectionError {}

/** Details of an error answer. */
export interface ApiErrorInit {
  status: number;
  code?: string | undefined;
  title?: string | undefined;
  detail?: string | undefined;
  type?: string | undefined;
  correlationId?: string | undefined;
  rawBody: string;
  headers: Record<string, string>;
  operationId: string;
}

/** The API answered with an error (ProblemDetails). */
export class ApiError extends TransynqError {
  /** HTTP status. */
  readonly status: number;
  /** The stable problem code (`validation`, `not-found`, a rule code such as `id-in-use`), when sent. */
  readonly code: string | undefined;
  /** The problem title (in the request's language). */
  readonly title: string | undefined;
  /** The problem detail (a business rule's sentence). */
  readonly detail: string | undefined;
  /** The problem type URI. */
  readonly type: string | undefined;
  /** The correlation id (from the body, else the `X-Correlation-Id` header). */
  readonly correlationId: string | undefined;
  /** The raw response body. */
  readonly rawBody: string;
  /** Response headers (lower-case names). */
  readonly headers: Record<string, string>;
  /** The operation that failed. */
  readonly operationId: string;

  constructor(message: string, init: ApiErrorInit) {
    super(message);
    this.status = init.status;
    this.code = init.code;
    this.title = init.title;
    this.detail = init.detail;
    this.type = init.type;
    this.correlationId = init.correlationId;
    this.rawBody = init.rawBody;
    this.headers = init.headers;
    this.operationId = init.operationId;
  }
}

/** 400: malformed input; `errors` lists the messages per field. */
export class ValidationError extends ApiError {
  /** Messages per field. */
  errors: Record<string, string[]> = {};
}

/** 401: not signed in, session ended, invalid key or token. */
export class AuthenticationError extends ApiError {}

/** 403: signed in but not allowed (or a missing CSRF token). */
export class PermissionDeniedError extends ApiError {}

/** 404: missing, or outside the caller's scope. */
export class NotFoundError extends ApiError {}

/** 409: the data was changed by someone else. */
export class ConflictError extends ApiError {}

/** 412: `If-Match` does not match the current ETag. */
export class StaleVersionError extends ApiError {}

/** 422: a business rule refused the request; `code` is the rule. */
export class BusinessRuleError extends ApiError {}

/** 429: rate limited; `retryAfterMs` says when to try again. */
export class RateLimitError extends ApiError {
  /** The `Retry-After` delay in milliseconds, when sent. */
  retryAfterMs: number | undefined;
}

/** 5xx: the API failed (quote `correlationId` to support). */
export class ServerError extends ApiError {}

/** A long operation ended in `Failed`. */
export class LongOperationFailedError extends TransynqError {
  constructor(
    message: string,
    /** The final state of the operation. */
    readonly operation: LongOperationResponse,
  ) {
    super(message);
  }
}

function text(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  return typeof value === 'string' ? value : JSON.stringify(value);
}

/** Builds the typed error for an error answer. */
export function errorFromResponse(
  status: number,
  body: string,
  headers: Record<string, string>,
  operationId: string,
  retryAfterMs: number | undefined,
): ApiError {
  let problem: Record<string, unknown> = {};
  if (body) {
    try {
      const parsed: unknown = JSON.parse(body);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) problem = parsed as Record<string, unknown>;
    } catch {
      // not ProblemDetails (a proxy page): keep the raw body only
    }
  }
  const code = text(problem['code']);
  const title = text(problem['title']);
  const detail = text(problem['detail']);
  const correlationId = text(problem['correlationId']) ?? headers['x-correlation-id'];
  let message = `${operationId} failed with ${status}`;
  if (code) message += ` (${code})`;
  message += `: ${title ?? 'no title'}`;
  if (detail) message += ` - ${detail}`;
  if (correlationId) message += ` [correlation id ${correlationId}]`;
  const init: ApiErrorInit = { status, code, title, detail, type: text(problem['type']), correlationId, rawBody: body, headers, operationId };
  switch (status) {
    case 400: {
      const error = new ValidationError(message, init);
      const raw = problem['errors'];
      if (raw && typeof raw === 'object') {
        for (const [field, messages] of Object.entries(raw as Record<string, unknown>)) {
          error.errors[field] = Array.isArray(messages) ? messages.map(String) : [String(messages)];
        }
      }
      return error;
    }
    case 401:
      return new AuthenticationError(message, init);
    case 403:
      return new PermissionDeniedError(message, init);
    case 404:
      return new NotFoundError(message, init);
    case 409:
      return new ConflictError(message, init);
    case 412:
      return new StaleVersionError(message, init);
    case 422:
      return new BusinessRuleError(message, init);
    case 429: {
      const error = new RateLimitError(message, init);
      error.retryAfterMs = retryAfterMs;
      return error;
    }
    default:
      return status >= 500 ? new ServerError(message, init) : new ApiError(message, init);
  }
}
