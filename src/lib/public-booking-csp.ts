import { frameAncestorsCsp, sanitizeStoredPublicBookingEmbedHosts } from "./public-booking-embed-hosts";

export const CONSOLE_FRAME_ANCESTORS = "frame-ancestors 'self'";
const FAIL_CLOSED = CONSOLE_FRAME_ANCESTORS;
const CACHE_OK_MS = 5_000;
const CACHE_STALE_MS = 60_000;
const CACHE_FAIL_MS = 10_000;
const CACHE_MAX = 200;
const headerCache = new Map<string, { header: string; freshUntil: number; staleUntil: number }>();
const headerFetchSeq = new Map<string, number>();

function readCache(key: string): { header: string; fresh: boolean } | undefined {
  const row = headerCache.get(key);
  if (!row) return undefined;
  const now = Date.now();
  if (now > row.staleUntil) {
    headerCache.delete(key);
    return undefined;
  }
  return { header: row.header, fresh: now <= row.freshUntil };
}

function storeHeader(key: string, header: string, freshMs: number, staleMs = freshMs) {
  const now = Date.now();
  headerCache.set(key, {
    header,
    freshUntil: now + freshMs,
    staleUntil: now + staleMs,
  });
  if (headerCache.size <= CACHE_MAX && headerFetchSeq.size <= CACHE_MAX) return;
  const expired: string[] = [];
  for (const [k, v] of headerCache) {
    if (v.staleUntil < now) expired.push(k);
  }
  for (const k of expired) {
    headerCache.delete(k);
    headerFetchSeq.delete(k);
  }
  while (headerCache.size > CACHE_MAX) {
    const first = headerCache.keys().next().value;
    if (first === undefined) break;
    headerCache.delete(first);
    headerFetchSeq.delete(first);
  }
  while (headerFetchSeq.size > CACHE_MAX) {
    const first = headerFetchSeq.keys().next().value;
    if (first === undefined) break;
    headerFetchSeq.delete(first);
  }
}

function isLoopbackHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

export function publicBookPathMatch(
  pathname: string
): { orgSlug: string; offeringSlug: string } | null {
  const path = pathname.replace(/\/+$/, "") || pathname;
  const match = path.match(/^\/book\/([^/]+)\/([^/]+)$/);
  if (!match) return null;
  try {
    return {
      orgSlug: decodeURIComponent(match[1]),
      offeringSlug: decodeURIComponent(match[2]),
    };
  } catch {
    return null;
  }
}

export function publicBookingApiOrigin(
  requestUrl: string,
  env: Record<string, string | undefined> = {}
): string {
  const explicit = env.PUBLIC_BOOKING_API_ORIGIN || env.VITE_API_URL;
  if (explicit && /^https?:\/\//i.test(explicit)) return explicit.replace(/\/$/, "");
  const origin = new URL(requestUrl).origin;
  let hostname = "";
  try {
    hostname = new URL(origin).hostname;
  } catch {
    hostname = "";
  }
  if (isLoopbackHostname(hostname)) {
    const proxy = env.VITE_API_PROXY;
    if (proxy && /^https?:\/\//i.test(proxy)) return proxy.replace(/\/$/, "");
    return "http://127.0.0.1:5001";
  }
  return "https://api.aerscheduler.com";
}

/**
 * CSP for `/book/*`. `frame-ancestors` is not valid in a meta tag, so this has
 * to be an HTTP header. First lookup failure fails closed to `'self'`. A later
 * blip keeps the last successful allowlist for one extra minute so an
 * allowlisted school is not blanked; after that it fails closed again.
 */
export async function bookFrameAncestorsHeader(
  request: Request,
  env: Record<string, string | undefined> = {}
): Promise<string | null> {
  const pathname = new URL(request.url).pathname;
  if (pathname !== "/book" && !pathname.startsWith("/book/")) return null;
  const parts = publicBookPathMatch(pathname);
  if (!parts) return FAIL_CLOSED;

  const api = publicBookingApiOrigin(request.url, env);
  const cacheKey = `${api}|${parts.orgSlug}|${parts.offeringSlug}`;
  const cached = readCache(cacheKey);
  if (cached?.fresh) return cached.header;

  const seq = (headerFetchSeq.get(cacheKey) ?? 0) + 1;
  headerFetchSeq.set(cacheKey, seq);

  const url = `${api}/public/book/${encodeURIComponent(parts.orgSlug)}/offerings/${encodeURIComponent(parts.offeringSlug)}`;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 2000);
  try {
    const res = await fetch(url, {
      signal: ac.signal,
      headers: { accept: "application/json" },
    });
    if (!res.ok) {
      if (headerFetchSeq.get(cacheKey) !== seq) {
        return readCache(cacheKey)?.header ?? (cached?.header ?? FAIL_CLOSED);
      }
      if (cached) return cached.header;
      storeHeader(cacheKey, FAIL_CLOSED, CACHE_FAIL_MS);
      return FAIL_CLOSED;
    }
    const body = (await res.json()) as {
      data?: { organization?: { embedHosts?: unknown } };
    };
    if (headerFetchSeq.get(cacheKey) !== seq) {
      return readCache(cacheKey)?.header ?? (cached?.header ?? FAIL_CLOSED);
    }
    const header = frameAncestorsCsp(
      sanitizeStoredPublicBookingEmbedHosts(body.data?.organization?.embedHosts)
    );
    storeHeader(cacheKey, header, CACHE_OK_MS, CACHE_OK_MS + CACHE_STALE_MS);
    return header;
  } catch {
    if (headerFetchSeq.get(cacheKey) !== seq) {
      return readCache(cacheKey)?.header ?? (cached?.header ?? FAIL_CLOSED);
    }
    if (cached) return cached.header;
    storeHeader(cacheKey, FAIL_CLOSED, CACHE_FAIL_MS);
    return FAIL_CLOSED;
  } finally {
    clearTimeout(timer);
  }
}
