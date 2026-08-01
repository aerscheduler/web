import { API_URL } from "./env";
import { DEVICE_TIME_ZONE } from "./timezone";

/** Injected by vite.config.ts at build time — `aerscheduler-web/<commit>`. */
declare const __CLIENT_ID__: string;
const CLIENT_ID = typeof __CLIENT_ID__ === "string" ? __CLIENT_ID__ : "aerscheduler-web";

const TOKEN_KEY = "aer.token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

/**
 * When the token's own `exp` claim says it is dead, in ms since the epoch.
 * Decoded without verifying — the server re-verifies the signature on every
 * request. This only ever makes us sign someone out EARLIER than the server
 * would, never later, so an unverified read is safe.
 */
export function tokenExpiresAt(token: string | null = getToken()): number | null {
  if (!token) return null;
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const b64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), "=");
    const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
    const claims = JSON.parse(new TextDecoder().decode(bytes)) as { exp?: unknown };
    return typeof claims.exp === "number" ? claims.exp * 1000 : null;
  } catch {
    return null;
  }
}

/** Tolerate this much clock skew before calling a token expired locally. */
const EXPIRY_SKEW_MS = 10_000;

export function isTokenExpired(token: string | null = getToken()): boolean {
  const exp = tokenExpiresAt(token);
  return exp !== null && exp - EXPIRY_SKEW_MS <= Date.now();
}

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

type QueryValue =
  | string
  | number
  | boolean
  | Array<string | number>
  | undefined
  | null;

export interface ApiOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, QueryValue>;
  signal?: AbortSignal;
}

/**
 * Called once when the session is confirmed dead, so the app can drop its state
 * and bounce to /login. Registered by <SessionWatcher>.
 */
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

/**
 * Tear down the session, exactly once per token.
 *
 * The token guard matters: several requests are usually in flight together, so
 * a dead session produces a burst of 401s. Without it, the first one signs the
 * user out and the rest fire the handler again over an already-empty session —
 * or, worse, stomp a NEWER token if a login landed in between.
 */
export function expireSession(token: string | null = getToken()) {
  if (!token || getToken() !== token) return;
  setToken(null);
  onUnauthorized?.();
}

/**
 * Is this token really dead, or did the server just say 401 when it meant 403?
 *
 * The convention is 401 = "sign in again", 403 = "you aren't allowed to do
 * that", and the routes that had those backwards are fixed. But signing someone
 * out is destructive and one stray 401 anywhere in the API would do it, so we
 * don't take a single response's word for it: we ask `GET /auth/session`, the
 * endpoint whose only job is to answer this question.
 *
 * A network failure answers "not dead": a dead zone or a server restart must
 * never sign anyone out.
 */
let sessionProbe: { token: string; result: Promise<boolean> } | null = null;

export function tokenIsDead(token: string | null = getToken()): Promise<boolean> {
  if (!token) return Promise.resolve(true);
  // Locally expired needs no round trip.
  if (isTokenExpired(token)) return Promise.resolve(true);
  if (sessionProbe?.token === token) return sessionProbe.result;

  // Deliberately a bare fetch, not `raw()` — routing the probe through the
  // request builder would send it straight back here on a 401.
  const result = fetch(`${API_URL}/auth/session`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
  })
    .then((res) => res.status === 401 || res.status === 403)
    .catch(() => false)
    .finally(() => {
      // Let the next 401 re-probe rather than trusting a cached verdict.
      if (sessionProbe?.token === token) sessionProbe = null;
    });

  sessionProbe = { token, result };
  return result;
}

export async function raw(path: string, opts: ApiOptions): Promise<{ status: number; body: unknown }> {
  const headers = new Headers({ Accept: "application/json" });
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  // The zone this browser is in. The server uses it as the LAST step of the
  // reporting fallback chain (`organization.timeZone → this → UTC`), so a
  // school that has never set a zone keeps seeing the days it sees today
  // instead of silently switching to UTC ones.
  if (DEVICE_TIME_ZONE) headers.set("X-Time-Zone", DEVICE_TIME_ZONE);

  // Identify the console to the API's request log. The browser's User-Agent
  // already says "a browser on Windows", but not *which of our clients* nor
  // which build — so a bug report can't be tied to a deploy. The app sends the
  // same shape via its User-Agent (it has no shared request builder to add a
  // header to); the server logs both.
  headers.set("X-Client", CLIENT_ID);

  let url = `${API_URL}${path}`;
  if (opts.query) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(opts.query)) {
      if (v === undefined || v === null) continue;
      if (Array.isArray(v)) {
        if (v.length) qs.set(k, v.map(String).join(","));
      } else {
        qs.set(k, String(v));
      }
    }
    const s = qs.toString();
    if (s) url += `?${s}`;
  }

  let bodyInit: BodyInit | undefined;
  if (opts.body !== undefined) {
    headers.set("Content-Type", "application/json");
    bodyInit = JSON.stringify(opts.body);
  }

  const res = await fetch(url, {
    method: opts.method ?? "GET",
    headers,
    body: bodyInit,
    signal: opts.signal,
  });

  if (res.status === 204) return { status: 204, body: undefined };

  const text = await res.text();
  let parsed: unknown = undefined;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  // Only a 401 on a request we actually authenticated can mean "session over".
  // An unauthenticated 401 (a wrong password on login) must fall through so the
  // server's real message ("Invalid email or password") is what gets shown.
  if (res.status === 401 && token && (await tokenIsDead(token))) {
    expireSession(token);
    throw new ApiError(401, "Your session has expired. Please sign in again.");
  }

  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    if (parsed && typeof parsed === "object" && "message" in parsed) {
      const m = (parsed as Record<string, unknown>).message;
      if (typeof m === "string") msg = m;
    } else if (typeof parsed === "string" && parsed) {
      msg = parsed;
    }
    throw new ApiError(res.status, msg, parsed);
  }

  return { status: res.status, body: parsed };
}

/** Request that unwraps the `{ data }` envelope and returns the payload. */
export async function api<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  const { body } = await raw(path, opts);
  if (body && typeof body === "object" && "data" in (body as Record<string, unknown>)) {
    return (body as Record<string, unknown>).data as T;
  }
  return body as T;
}

/** Request that returns the full response body (used for the auth envelope). */
export async function apiRaw<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  const { body } = await raw(path, opts);
  return body as T;
}
