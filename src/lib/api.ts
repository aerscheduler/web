import { API_URL } from "./env";

const TOKEN_KEY = "aer.token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
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

/** Called when a request comes back 401 so the app can bounce to /login. */
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

export async function raw(path: string, opts: ApiOptions): Promise<{ status: number; body: unknown }> {
  const headers = new Headers({ Accept: "application/json" });
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

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

  // Only treat a 401 as an expired session when we actually sent a token.
  // An unauthenticated 401 (e.g. a wrong password on login) must fall through
  // so the server's real message ("Invalid email or password") is shown.
  if (res.status === 401 && token) {
    setToken(null);
    onUnauthorized?.();
    throw new ApiError(401, "Your session has expired. Please sign in again.");
  }

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
