import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  ApiError,
  ApiKeyCredential,
  AuthenticationError,
  BusinessRuleError,
  ConflictError,
  ConnectionError,
  DriverLoginCredential,
  FileUpload,
  LongOperationFailedError,
  NotFoundError,
  OPERATION_COUNT,
  PermissionDeniedError,
  RateLimitError,
  SDK_VERSION,
  SPEC_SHA256,
  ServerError,
  SessionCredential,
  StaleVersionError,
  TimeoutError,
  TransynqClient,
  ValidationError,
  dateOnly,
  newId,
  readModifyWrite,
  type ClientOptions,
  type JobRepriceRequest,
  type PublicHolidayRequest,
  type RequestInfo,
} from '../src/index.js';
import { parseJson } from '../src/core/json.js';

const BASE = 'https://api.test.local';
const ID = '6f1c7a52-3d6b-4b5e-9a3e-0c1d2e3f4a5b';
const HOLIDAY = { id: ID, name: 'Anzac Day', date: '2026-04-25', countryId: 1, states: [] };

interface Recorded {
  method: string;
  url: URL;
  headers: Headers;
  body: string;
}

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

type Answer = (request: Request) => Response | Promise<Response>;

function mock(answers: Answer[], fallback?: Answer): Recorded[] {
  const recorded: Recorded[] = [];
  server.use(
    http.all(`${BASE}/*`, async ({ request }) => {
      recorded.push({ method: request.method, url: new URL(request.url), headers: request.headers, body: await request.clone().text() });
      const answer = answers.shift() ?? fallback;
      if (!answer) throw new Error(`no answer for ${request.method} ${request.url}`);
      return answer(request);
    }),
  );
  return recorded;
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}): Answer => () => HttpResponse.json(body as never, { status, headers });
const empty = (status: number, headers: Record<string, string> = {}): Answer => () => new HttpResponse(null, { status, headers });

function make(extra: Partial<ClientOptions> = {}): { client: TransynqClient; delays: number[] } {
  const delays: number[] = [];
  const client = new TransynqClient({
    baseUrl: BASE,
    sleep: (ms) => {
      delays.push(ms);
      return Promise.resolve();
    },
    jitter: () => 1,
    ...extra,
  });
  return { client, delays };
}

const login = (session = 's1', csrf = 'csrf-1', expires = '2099-01-01T00:00:00Z'): Answer => () =>
  HttpResponse.json(
    { userName: 'ann', csrfToken: csrf, sessionExpiresUtc: expires },
    { headers: { 'Set-Cookie': `__Host-tq_session=${session}; path=/; secure; httponly` } },
  );

const reprice: JobRepriceRequest = {
  grid: { columns: null, filters: null, sort: null, page: null, pageSize: null, search: null, summaries: null },
  dryRun: true,
};

describe('contract', () => {
  it('builds path and standard headers, exposes ETag, version and correlation id', async () => {
    const calls = mock([json(HOLIDAY, 200, { ETag: '"v1"', 'X-Api-Version': '1.0.0', 'X-Correlation-Id': 'abc12345' })]);
    const { client } = make({ userAgentSuffix: 'acme/1.0' });

    const response = await client.referenceData.getPublicHoliday(ID);

    expect(calls[0]!.url.pathname).toBe(`/api/v1/public-holidays/${ID}`);
    expect(calls[0]!.headers.get('user-agent')).toBe(`transynq-sdk-node/${SDK_VERSION} acme/1.0`);
    expect(calls[0]!.headers.get('x-correlation-id')).toMatch(/^[0-9a-f]{32}$/);
    expect(response.data.date).toBe('2026-04-25');
    expect(response.etag).toBe('"v1"');
    expect(response.apiVersion).toBe('1.0.0');
    expect(response.correlationId).toBe('abc12345');
  });

  it('formats query parameters and skips undefined', async () => {
    const calls = mock([json({ items: [], page: 2, pageSize: 20, total: 0 })]);
    const { client } = make();

    await client.referenceData.listPublicHolidays({ countryId: 1, year: 2026, page: 2, pageSize: 20, sort: '-date,name', q: 'a b' });

    expect(calls[0]!.url.search).toBe('?countryId=1&year=2026&page=2&pageSize=20&sort=-date%2Cname&q=a%20b');
  });

  it('sends JSON bodies and If-Match on PUT', async () => {
    const calls = mock([json(HOLIDAY, 200, { ETag: '"v2"' })]);
    const { client } = make();
    const body: PublicHolidayRequest = { id: ID, name: 'X', date: dateOnly('2026-01-26'), countryId: 1, states: ['NSW'] };

    const response = await client.referenceData.updatePublicHoliday(ID, body, { ifMatch: '"v1"' });

    expect(calls[0]!.method).toBe('PUT');
    expect(calls[0]!.headers.get('if-match')).toBe('"v1"');
    expect(calls[0]!.headers.get('content-type')).toMatch(/^application\/json/);
    expect(JSON.parse(calls[0]!.body)).toEqual(body);
    expect(response.etag).toBe('"v2"');
  });

  it('uploads multipart files', async () => {
    const calls = mock([json({ id: ID })]);
    const { client } = make();

    const response = await client.jobs.uploadJobDocument(ID, { file: FileUpload.fromBytes('%PDF-1.7', 'pod.pdf', 'application/pdf') });

    expect(calls[0]!.headers.get('content-type')).toMatch(/^multipart\/form-data/);
    expect(calls[0]!.body).toContain('name="file"; filename="pod.pdf"');
    expect(calls[0]!.body).toContain('%PDF-1.7');
    expect(response.data.json()).toEqual({ id: ID });
  });

  it('streams downloads with their file name', async () => {
    mock([() => new HttpResponse(new Uint8Array([1, 2, 3]), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="pod.pdf"' } })]);
    const { client } = make();

    const file = (await client.jobs.downloadJobDocument(ID)).data;

    expect(file.contentType).toBe('application/pdf');
    expect(file.fileName).toBe('pod.pdf');
    expect(Array.from(await file.bytes())).toEqual([1, 2, 3]);
  });

  it('covers the whole spec', () => {
    const { client } = make();
    expect(OPERATION_COUNT).toBe(705);
    expect(SPEC_SHA256).toHaveLength(64);
    const services = Object.values(client).filter((v) => v?.constructor?.name?.endsWith('Service'));
    expect(services).toHaveLength(52);
  });
});

describe('auth', () => {
  it('sends the API key and no CSRF token', async () => {
    const calls = mock([], json({}));
    const { client } = make({ credential: new ApiKeyCredential('secret-key') });

    await client.authentication.getApiClient();
    await client.referenceData.deletePublicHoliday(ID, { ifMatch: '"x"' });

    for (const c of calls) {
      expect(c.headers.get('x-transynq-apikey')).toBe('secret-key');
      expect(c.headers.get('x-csrf-token')).toBeNull();
    }
    expect(String(new ApiKeyCredential('secret-key'))).not.toContain('secret-key');
  });

  it('signs in once, then sends the cookie, and CSRF on unsafe verbs only', async () => {
    const calls = mock([login(), json({}), json({})]);
    const credential = new SessionCredential('ann', 'pw');
    const { client } = make({ credential });

    await client.authentication.getMe();
    await client.referenceData.deletePublicHoliday(ID, { ifMatch: '"x"' });

    expect(calls[0]!.url.pathname).toBe('/api/v1/auth/login');
    expect(JSON.parse(calls[0]!.body)).toEqual({ userName: 'ann', password: 'pw' });
    expect(calls[0]!.headers.get('x-csrf-token')).toBeTruthy();
    expect(calls[1]!.headers.get('cookie')?.split(';')[0]).toBe('__Host-tq_session=s1');
    expect(calls[1]!.headers.get('x-csrf-token')).toBeNull();
    expect(calls[2]!.headers.get('x-csrf-token')).toBe('csrf-1');
    expect(credential.signInCount).toBe(1);
    expect(credential.me?.['userName']).toBe('ann');
  });

  it('signs in again once after a 401', async () => {
    const calls = mock([login('s1'), empty(401), login('s2'), json({})]);
    const credential = new SessionCredential('ann', 'pw');
    const { client } = make({ credential });

    await client.authentication.getMe();

    expect(calls[3]!.headers.get('cookie')?.split(';')[0]).toBe('__Host-tq_session=s2');
    expect(credential.signInCount).toBe(2);
  });

  it('raises a failed login without retrying', async () => {
    const calls = mock([json({ title: 'Invalid user name or password.' }, 401)]);
    const { client } = make({ credential: new SessionCredential('ann', 'bad') });

    await expect(client.authentication.getMe()).rejects.toBeInstanceOf(AuthenticationError);
    expect(calls).toHaveLength(1);
  });

  it('shares one sign-in between concurrent requests', async () => {
    const calls = mock([], (r) => (new URL(r.url).pathname === '/api/v1/auth/login' ? login()(r) : HttpResponse.json({})));
    const credential = new SessionCredential('ann', 'pw');
    const { client } = make({ credential });

    await Promise.all(Array.from({ length: 20 }, () => client.authentication.getMe()));

    expect(calls.filter((c) => c.url.pathname === '/api/v1/auth/login')).toHaveLength(1);
    expect(credential.signInCount).toBe(1);
  });

  it('renews the session before it expires', async () => {
    mock([], (r) => (new URL(r.url).pathname === '/api/v1/auth/login' ? login('s', 'c', '2026-11-16T01:00:00Z')(r) : HttpResponse.json({})));
    const credential = new SessionCredential('ann', 'pw');
    let now = Date.parse('2026-11-16T00:00:00Z');
    credential.now = () => now;
    const { client } = make({ credential });

    await client.authentication.getMe();
    now += 59.5 * 60_000;
    await client.authentication.getMe();

    expect(credential.signInCount).toBe(2);
  });

  it('uses the driver bearer token', async () => {
    const calls = mock([json({ token: '0b7c9f8e-1111-2222-3333-444455556666', expiresUtc: '2099-01-01T00:00:00Z', driver: {}, company: {}, settings: {} }), empty(204)]);
    const credential = new DriverLoginCredential({ companyCode: 'ACME', pin: '1234', deviceId: 'd', pushToken: 'p', appVersion: '1', platform: 'android' });
    const { client } = make({ credential });

    await client.driverApp.driverLogout();

    expect(calls[0]!.headers.get('authorization')).toBeNull();
    expect(calls[1]!.headers.get('authorization')).toBe('Bearer 0b7c9f8e-1111-2222-3333-444455556666');
  });

  it('never shows secrets to hooks', async () => {
    mock([json({})]);
    const seen: RequestInfo[] = [];
    const { client } = make({ credential: new ApiKeyCredential('secret-key'), onRequest: (i) => seen.push(i) });

    await client.authentication.getApiClient();

    expect(seen[0]!.headers['X-Transynq-APIKey']).toBe('[redacted]');
  });
});

describe('retries', () => {
  it('retries a GET with exponential back-off and one correlation id', async () => {
    const calls = mock([empty(503), empty(502), json([])]);
    const { client, delays } = make();

    await client.referenceData.listCountries();

    expect(calls).toHaveLength(3);
    expect(delays).toEqual([500, 1000]);
    expect(new Set(calls.map((c) => c.headers.get('x-correlation-id'))).size).toBe(1);
  });

  it('stops at maxRetries and types the server error', async () => {
    const calls = mock([], json({ title: 'An unexpected error occurred.', code: 'unexpected', correlationId: 'c-1' }, 500));
    const { client } = make({ maxRetries: 1 });

    const error = await client.referenceData.listCountries().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ServerError);
    expect((error as ServerError).correlationId).toBe('c-1');
    expect(calls).toHaveLength(2);
  });

  it('retries a POST only with an idempotency key', async () => {
    const calls = mock([], empty(503));
    const { client } = make();
    await expect(client.jobs.repriceJobs(reprice)).rejects.toBeInstanceOf(ServerError);
    expect(calls).toHaveLength(1);

    const calls2 = mock([empty(503), json({})]);
    await client.jobs.repriceJobs(reprice, { idempotencyKey: 'key-1' });
    expect(calls2).toHaveLength(2);
    expect(calls2.every((c) => c.headers.get('idempotency-key') === 'key-1')).toBe(true);
  });

  it('retries a create that carries a client id', async () => {
    const calls = mock([empty(503), json({})]);
    const { client } = make();

    await client.referenceData.createPublicHoliday({ id: newId(), name: 'X', date: null, countryId: null, states: null });

    expect(calls).toHaveLength(2);
  });

  it('honours Retry-After, and raises a long one', async () => {
    mock([empty(429, { 'Retry-After': '3' }), json({})]);
    const { client, delays } = make();
    await client.jobs.repriceJobs(reprice);
    expect(delays).toEqual([3000]);

    mock([empty(429, { 'Retry-After': '600' })]);
    const error = await client.referenceData.listCountries().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RateLimitError);
    expect((error as RateLimitError).retryAfterMs).toBe(600_000);
  });

  it('retries network errors and raises connection and timeout errors', async () => {
    let calls = 0;
    const failing = (): Promise<Response> => {
      calls++;
      return Promise.reject(new TypeError('fetch failed'));
    };
    const { client } = make({ fetch: failing as typeof fetch, maxRetries: 2 });
    await expect(client.referenceData.listCountries()).rejects.toBeInstanceOf(ConnectionError);
    expect(calls).toBe(3);

    const slow = (_url: unknown, init?: RequestInit): Promise<Response> =>
      new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal?.reason)));
    const { client: client2 } = make({ fetch: slow as typeof fetch, maxRetries: 0, timeoutMs: 20 });
    await expect(client2.referenceData.listCountries()).rejects.toBeInstanceOf(TimeoutError);
  });

  it('does not retry with maxRetries 0 or on 501', async () => {
    const calls = mock([], empty(503));
    await expect(make({ maxRetries: 0 }).client.referenceData.listCountries()).rejects.toBeInstanceOf(ServerError);
    expect(calls).toHaveLength(1);

    const calls2 = mock([], json({ code: 'not-implemented' }, 501));
    await expect(make().client.referenceData.listCountries()).rejects.toBeInstanceOf(ServerError);
    expect(calls2).toHaveLength(1);
  });
});

describe('errors', () => {
  it('exposes validation field errors', async () => {
    mock([json({ title: 'The request is not valid.', status: 400, code: 'validation', correlationId: 'c-9', errors: { name: ['Name is required.'] } }, 400)]);
    const error = (await make().client.referenceData.listCountries().catch((e: unknown) => e)) as ValidationError;
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.status).toBe(400);
    expect(error.errors).toEqual({ name: ['Name is required.'] });
    expect(error.rawBody).toContain('"validation"');
  });

  it.each([
    [403, PermissionDeniedError],
    [404, NotFoundError],
    [409, ConflictError],
    [412, StaleVersionError],
    [422, BusinessRuleError],
    [418, ApiError],
  ])('maps %i to a typed error', async (status, type) => {
    mock([json({ title: 't', detail: 'd', code: 'year-exists' }, status, { 'X-Correlation-Id': 'hdr-1' })]);
    const error = (await make().client.referenceData.listCountries().catch((e: unknown) => e)) as ApiError;
    expect(error.constructor).toBe(type);
    expect(error.code).toBe('year-exists');
    expect(error.detail).toBe('d');
    expect(error.correlationId).toBe('hdr-1');
    expect(error.operationId).toBe('ListCountries');
  });
});

describe('concurrency, paging and long operations', () => {
  it('reloads and retries on a stale version', async () => {
    const calls = mock([
      json(HOLIDAY, 200, { ETag: '"1"' }),
      json({ code: 'stale-version' }, 412),
      json(HOLIDAY, 200, { ETag: '"2"' }),
      json(HOLIDAY, 200, { ETag: '"3"' }),
    ]);
    const { client } = make();

    const saved = await readModifyWrite(
      () => client.referenceData.getPublicHoliday(ID),
      (current, options) => client.referenceData.updatePublicHoliday(ID, { ...current, name: `${current.name}!` }, options),
    );

    expect(saved.etag).toBe('"3"');
    expect(calls[1]!.headers.get('if-match')).toBe('"1"');
    expect(calls[3]!.headers.get('if-match')).toBe('"2"');
  });

  it('auto-pages until total', async () => {
    const reason = () => ({ id: newId(), name: 'Late', reasonType: 'delay', active: true });
    const calls = mock([json({ items: [reason(), reason()], page: 1, pageSize: 2, total: 3 }), json({ items: [reason()], page: 2, pageSize: 2, total: 3 })]);
    const { client } = make();

    const items = [];
    for await (const item of client.referenceData.listJobStatusReasonsAutoPaging({ pageSize: 2 })) items.push(item);

    expect(items).toHaveLength(3);
    expect(calls[1]!.url.searchParams.get('page')).toBe('2');
  });

  it('iterates grid rows across pages', async () => {
    const calls = mock([
      json({ rows: [{ a: 1 }, { a: 2 }], page: 1, pageSize: 2, total: 3, summaries: {} }),
      json({ rows: [{ a: 3 }], page: 2, pageSize: 2, total: 3, summaries: {} }),
    ]);
    const { client } = make();

    const rows = [];
    for await (const row of client.iterateGridRows('jobs', { ...reprice.grid, columns: ['a'], pageSize: 2 })) rows.push(row['a']);

    expect(rows).toEqual([1, 2, 3]);
    expect(JSON.parse(calls[1]!.body).page).toBe(2);
  });

  const op = (status: string, result: unknown = null, error: string | null = null) => ({
    id: ID, kind: 'zones', inputName: 'z.xlsx', requestedBy: 'ann', requestedUtc: '2026-11-16T00:00:00Z', status, startedUtc: null, finishedUtc: null, result, error,
  });

  it('polls an accepted long operation to success', async () => {
    const calls = mock([json({ id: ID, status: 'Queued' }, 202, { Location: `/api/v1/long-operations/${ID}` }), json(op('Running')), json(op('Succeeded', { created: 3 }))]);
    const { client, delays } = make();

    const accepted = await client.imports.importZonesInBackground({ file: FileUpload.fromBytes('x', 'z.xlsx') });
    expect(accepted.isAccepted).toBe(true);
    const seen: string[] = [];
    const done = await client.pollLongOperation(accepted).wait({ pollIntervalMs: 1000, onProgress: (s) => seen.push(s.status) });

    expect(seen).toEqual(['Running', 'Succeeded']);
    expect(done.result).toEqual({ created: 3 });
    expect(calls[1]!.url.pathname).toBe(`/api/v1/long-operations/${ID}`);
    expect(delays).toEqual([1000]);
  });

  it('raises a failed long operation', async () => {
    mock([json(op('Failed', null, 'Bad file'))]);
    const error = (await make().client.pollLongOperation(ID).wait().catch((e: unknown) => e)) as LongOperationFailedError;
    expect(error).toBeInstanceOf(LongOperationFailedError);
    expect(error.operation.error).toBe('Bad file');
  });
});

describe('serialisation', () => {
  it('keeps every digit of large decimals and reads ordinary numbers as numbers', () => {
    const value = parseJson('{"ratePercentage":1234567890123456.78,"minPercentage":0.1,"count":3}') as Record<string, unknown>;
    expect(value['minPercentage']).toBe(0.1);
    expect(value['count']).toBe(3);
    const major = Number(process.versions.node.split('.')[0]);
    expect(value['ratePercentage']).toBe(major >= 21 ? '1234567890123456.78' : Number('1234567890123456.78'));
  });

  it('validates calendar days', () => {
    expect(dateOnly(new Date(Date.UTC(2026, 11, 25)))).toBe('2026-12-25');
    expect(() => dateOnly('25/12/2026')).toThrow(TypeError);
  });

  it('keeps unknown codes and properties', async () => {
    mock([json({ ...op2('Paused'), newField: [1, 2] })]);
    const state = (await make().client.longOperations.getLongOperation(ID)).data;
    expect(state.status).toBe('Paused');
  });
});

function op2(status: string) {
  return { id: ID, kind: 'brand-new-kind', inputName: null, requestedBy: 'a', requestedUtc: '2026-10-02T03:04:05Z', status, startedUtc: null, finishedUtc: null, result: null, error: null };
}
