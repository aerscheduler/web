/**
 * Stamp the visitor's country on a first-party cookie so the console can decide
 * whether to show the analytics consent banner without an extra round trip.
 *
 * Vercel sets `x-vercel-ip-country` (ISO 3166-1 alpha-2). IP geo is imperfect;
 * missing/invalid values leave the cookie unset so the client asks for consent.
 *
 * Guest booking pages get `frame-ancestors` from the school's embed allowlist.
 * Every other console document is `'self'` so Settings cannot be clickjacked
 * into writing that allowlist. `frame-ancestors` is not valid in a meta tag.
 */
import { next } from "@vercel/functions";
import { bookFrameAncestorsHeader, CONSOLE_FRAME_ANCESTORS } from "./src/lib/public-booking-csp";

export const config = {
  // Skip hashed assets and other files with extensions; SPA routes have none.
  matcher: ["/((?!.*\\.[\\w]+$|_vercel).*)"],
};

export default async function middleware(request: Request): Promise<Response> {
  const headers: Record<string, string> = {};

  const pathname = new URL(request.url).pathname;
  const guestBook = pathname === "/book" || pathname.startsWith("/book/");

  const raw = request.headers.get("x-vercel-ip-country");
  const country = raw && /^[A-Z]{2}$/i.test(raw) ? raw.toUpperCase() : null;
  if (country && !guestBook) {
    const secure = request.url.startsWith("https:") ? "; Secure" : "";
    headers["Set-Cookie"] = `aer_country=${country}; Path=/; Max-Age=3600; SameSite=Lax${secure}`;
  }

  const env: Record<string, string | undefined> = {};
  if (typeof process !== "undefined" && process.env) {
    env.VITE_API_URL = process.env.VITE_API_URL;
    env.VITE_API_PROXY = process.env.VITE_API_PROXY;
    env.PUBLIC_BOOKING_API_ORIGIN = process.env.PUBLIC_BOOKING_API_ORIGIN;
  }
  let csp: string | null = null;
  try {
    csp = await bookFrameAncestorsHeader(request, env);
  } catch {
    if (guestBook) csp = CONSOLE_FRAME_ANCESTORS;
  }
  if (!csp) csp = CONSOLE_FRAME_ANCESTORS;
  headers["Content-Security-Policy"] = csp;
  headers["Cache-Control"] = "private, no-store";
  if (guestBook) headers["Referrer-Policy"] = "no-referrer";

  if (Object.keys(headers).length === 0) return next();
  return next({ headers });
}
