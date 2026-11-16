import { AuthenticationError } from './errors.js';
import { API_KEY_HEADER, CSRF_HEADER, type Credential, type CredentialRequest, type SignInResponse, type SignInTransport } from './http.js';

/** An API client key, sent as `X-Transynq-APIKey`. The key's company is the tenant; no cookie, no CSRF. */
export class ApiKeyCredential implements Credential {
  readonly #key: string;

  constructor(apiKey: string) {
    if (!apiKey?.trim()) throw new TypeError('apiKey is required');
    this.#key = apiKey;
  }

  apply(request: CredentialRequest): Promise<void> {
    request.setHeader(API_KEY_HEADER, this.#key);
    return Promise.resolve();
  }

  refreshAfterUnauthorized(): Promise<boolean> {
    return Promise.resolve(false);
  }

  toString(): string {
    return 'ApiKeyCredential([redacted])';
  }
}

/** An existing driver-app token (`Authorization: Bearer <token>`), valid for `/api/v1/driver/*`. */
export class DriverTokenCredential implements Credential {
  readonly #token: string;

  constructor(token: string) {
    if (!token?.trim()) throw new TypeError('token is required');
    this.#token = token;
  }

  apply(request: CredentialRequest): Promise<void> {
    request.setHeader('Authorization', `Bearer ${this.#token}`);
    return Promise.resolve();
  }

  refreshAfterUnauthorized(): Promise<boolean> {
    return Promise.resolve(false);
  }

  toString(): string {
    return 'DriverTokenCredential([redacted])';
  }
}

function parseInstant(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined;
  const ms = Date.parse(/[zZ]|[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value}Z`);
  return Number.isNaN(ms) ? undefined : ms;
}

/** Base of credentials that sign in: single-flight sign-in, refresh before expiry and once after a 401. */
export abstract class SignInCredential<S extends object> implements Credential {
  #state: S | undefined;
  #pending: Promise<S> | undefined;
  /** Signs in again this long (ms) before the state expires. */
  refreshMarginMs = 60_000;
  /** Number of sign-ins performed (diagnostics). */
  signInCount = 0;
  /** The clock (tests). */
  now: () => number = () => Date.now();

  /** The current signed-in state, if any. */
  get state(): S | undefined {
    return this.#state;
  }

  /** Forgets the signed-in state (after a sign-out). */
  reset(): void {
    this.#state = undefined;
  }

  private fresh(state: S | undefined): state is S {
    if (!state) return false;
    const expires = this.expiresAt(state);
    return expires === undefined || expires - this.refreshMarginMs > this.now();
  }

  async apply(request: CredentialRequest): Promise<void> {
    let state = this.#state;
    if (!this.fresh(state)) {
      this.#pending ??= this.signIn(request.transport)
        .then((s) => {
          this.signInCount++;
          this.#state = s;
          return s;
        })
        .finally(() => {
          this.#pending = undefined;
        });
      state = await this.#pending;
    }
    request.appliedState = state;
    this.applyState(request, state);
  }

  refreshAfterUnauthorized(request: CredentialRequest): Promise<boolean> {
    // only drop the state the failed request used; another caller may already have signed in again
    if (this.#state === request.appliedState) this.#state = undefined;
    return Promise.resolve(true);
  }

  protected abstract signIn(transport: SignInTransport): Promise<S>;
  protected abstract expiresAt(state: S): number | undefined;
  protected abstract applyState(request: CredentialRequest, state: S): void;
}

/** A signed-in session. */
export interface Session {
  cookie: string;
  csrfToken: string;
  expiresAt: number | undefined;
  me: Record<string, unknown>;
}

/** The `name=value` of the session cookie (`tq_session` or `__Host-tq_session`). */
export function sessionCookie(setCookies: string[]): string | undefined {
  for (const header of setCookies) {
    const pair = (header.split(';')[0] ?? '').trim();
    const eq = pair.indexOf('=');
    if (eq > 0 && eq < pair.length - 1 && pair.slice(0, eq).endsWith('tq_session')) return pair;
  }
  return undefined;
}

/**
 * A user session: `POST /api/v1/auth/login` with user name and password, then the session cookie on every request and
 * `X-CSRF-Token` on every unsafe one. Signs in again before the session expires and once after a 401.
 */
export class SessionCredential extends SignInCredential<Session> {
  readonly #userName: string;
  readonly #password: string;

  constructor(userName: string, password: string) {
    super();
    if (!userName || !password) throw new TypeError('userName and password are required');
    this.#userName = userName;
    this.#password = password;
  }

  /** The login answer (`MeResponse`), or undefined before the first request. */
  get me(): Record<string, unknown> | undefined {
    return this.state?.me;
  }

  protected async signIn(transport: SignInTransport): Promise<Session> {
    const answer: SignInResponse = await transport.postJson(
      '/api/v1/auth/login',
      JSON.stringify({ userName: this.#userName, password: this.#password }),
      { [CSRF_HEADER]: 'transynq-sdk' },
      'Login',
    );
    const fail = (message: string): AuthenticationError =>
      new AuthenticationError(message, { status: answer.statusCode, rawBody: '', headers: {}, operationId: 'Login' });
    const cookie = sessionCookie(answer.setCookies);
    if (!cookie) throw fail('Login answered without a session cookie.');
    const me = (answer.body ? JSON.parse(answer.body) : {}) as Record<string, unknown>;
    const csrf = me['csrfToken'];
    if (typeof csrf !== 'string' || !csrf) throw fail('Login answered without a csrfToken.');
    return { cookie, csrfToken: csrf, expiresAt: parseInstant(me['sessionExpiresUtc']), me };
  }

  protected expiresAt(state: Session): number | undefined {
    return state.expiresAt;
  }

  protected applyState(request: CredentialRequest, state: Session): void {
    request.setHeader('Cookie', state.cookie);
    if (request.isUnsafe) request.setHeader(CSRF_HEADER, state.csrfToken);
  }

  override toString(): string {
    return `SessionCredential(${this.#userName}, [redacted])`;
  }
}

/** The driver app's sign-in fields. */
export interface DriverLogin {
  companyCode: string;
  pin: string;
  deviceId: string;
  pushToken: string;
  appVersion: string;
  platform: string;
}

/** A driver token. */
export interface DriverToken {
  token: string;
  expiresAt: number | undefined;
  session: Record<string, unknown>;
}

/** Driver-app sign-in (`POST /api/v1/driver/login`), then `Authorization: Bearer <token>`. */
export class DriverLoginCredential extends SignInCredential<DriverToken> {
  readonly #login: DriverLogin;

  constructor(login: DriverLogin) {
    super();
    this.#login = { ...login };
  }

  /** The last `DriverSession`, if any. */
  get session(): Record<string, unknown> | undefined {
    return this.state?.session;
  }

  protected async signIn(transport: SignInTransport): Promise<DriverToken> {
    const answer = await transport.postJson('/api/v1/driver/login', JSON.stringify(this.#login), {}, 'DriverLogin');
    const session = (answer.body ? JSON.parse(answer.body) : {}) as Record<string, unknown>;
    const token = session['token'];
    if (typeof token !== 'string' || !token) {
      throw new AuthenticationError('DriverLogin answered without a token.', { status: answer.statusCode, rawBody: '', headers: {}, operationId: 'DriverLogin' });
    }
    return { token, expiresAt: parseInstant(session['expiresUtc']), session };
  }

  protected expiresAt(state: DriverToken): number | undefined {
    return state.expiresAt;
  }

  protected applyState(request: CredentialRequest, state: DriverToken): void {
    request.setHeader('Authorization', `Bearer ${state.token}`);
  }

  override toString(): string {
    return 'DriverLoginCredential([redacted])';
  }
}
