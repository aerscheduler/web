/**
 * Stamp the visitor's country on a first-party cookie so the console can decide
 * whether to show the analytics consent banner without an extra round trip.
 *
 * Vercel sets `x-vercel-ip-country` (ISO 3166-1 alpha-2). IP geo is imperfect;
 * missing/invalid values leave the cookie unset so the client asks for consent.
 */
import { next } from "@vercel/functions";

export const config = {
  // Skip hashed assets and other files with extensions; SPA routes have none.
  matcher: ["/((?!.*\\.[\\w]+$|_vercel).*)"],
};

export default function middleware(request: Request): Response {
  const raw = request.headers.get("x-vercel-ip-country");
  const country = raw && /^[A-Z]{2}$/i.test(raw) ? raw.toUpperCase() : null;

  if (!country) return next();

  const secure = request.url.startsWith("https:") ? "; Secure" : "";
  return next({
    headers: {
      "Set-Cookie": `aer_country=${country}; Path=/; Max-Age=3600; SameSite=Lax${secure}`,
    },
  });
}
