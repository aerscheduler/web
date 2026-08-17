import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { postLoginPath, useAuth } from "@/lib/auth";
import { apiRaw, getToken, setToken } from "@/lib/api";
import { LogoLockup } from "@/components/logo";

export const Route = createFileRoute("/auth/callback")({
  component: AuthCallbackPage,
  validateSearch: (search: Record<string, unknown>): { token?: string; code?: string } => ({
    token: typeof search.token === "string" ? search.token : undefined,
    code: typeof search.code === "string" ? search.code : undefined,
  }),
});

/**
 * Exchanges in flight, keyed by code, so one code is only ever POSTed once.
 *
 * A handoff code is single use by design, which quietly makes redeeming it a
 * non-idempotent operation in a React effect. Strict Mode mounts, unmounts and
 * remounts this page in development, so the effect fired twice: the first call
 * spent the code and got the token, the second got the 400 for an already-spent
 * code, and the error from the second overwrote the success of the first. The
 * page showed "this sign-in link has expired" to somebody who had just signed in
 * perfectly well. The old ?token= flow could not hit this because reading a token
 * out of a URL twice is harmless.
 *
 * Module scope, not a ref: the point is to survive the component being torn down
 * and rebuilt. Both callers await the same promise and get the same token.
 */
const exchangesInFlight = new Map<string, Promise<string | null>>();

function exchangeOnce(code: string): Promise<string | null> {
  const existing = exchangesInFlight.get(code);
  if (existing) return existing;

  const attempt = apiRaw<{ auth?: { accessToken?: string } }>("/auth/oauth/exchange", {
    method: "POST",
    // raw() stringifies for us; a pre-stringified body would be double-encoded.
    body: { code },
  })
    .then((body) => body?.auth?.accessToken ?? null)
    // Expired, already spent, or unknown. All the same to us, and to the person
    // reading the message on screen.
    .catch(() => null);

  exchangesInFlight.set(code, attempt);
  return attempt;
}

/**
 * Landing pad for the full-page Google OAuth redirect.
 *
 * The server sends us here with `?code=`, a one-time handoff code we POST back to
 * /auth/oauth/exchange for the real session token. The token itself never travels
 * in a URL, so it never reaches browser history, a Referer header, or a proxy log.
 *
 * `?token=` is still accepted, deliberately. This page and the API deploy
 * separately, so for the window between the two there are old redirects in flight
 * carrying a token and new ones carrying a code, and refusing either would strand
 * whoever was mid-sign-in. Remove the token branch once the API has been sending
 * codes for longer than a token's usefulness.
 */
function AuthCallbackPage() {
  const search = Route.useSearch();
  const { rehydrate } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function finish() {
      // Prefer the live query string over router search. React Strict Mode
      // remounts this page, and an early history.replaceState used to wipe the
      // parameter before the second mount could read it.
      const params = new URLSearchParams(window.location.search);
      const code = search.code || params.get("code");
      const legacyToken = search.token || params.get("token");

      let jwt: string | null = null;

      if (code) {
        jwt = await exchangeOnce(code);
        if (cancelled) return;
        if (!jwt) {
          setError("This sign-in link has expired. Please try again.");
          return;
        }
      } else {
        // Legacy path, and the already-signed-in case (a refresh of this page
        // after the code was spent, which is single use and now gone).
        jwt = legacyToken || getToken();
      }

      if (!jwt) {
        setError("Missing sign-in token. Please try again.");
        return;
      }

      setToken(jwt);

      try {
        await rehydrate();
        if (cancelled) return;
        // Replace, so neither the code nor the token stays in the address bar.
        await navigate({ to: postLoginPath(), replace: true });
      } catch {
        if (cancelled) return;
        setToken(null);
        setError("We couldn't finish signing you in. Please try again.");
      }
    }

    void finish();
    return () => {
      cancelled = true;
    };
  }, [search.token, search.code, rehydrate, navigate]);

  return (
    <main className="grid min-h-dvh place-items-center bg-background px-6">
      <div className="w-full max-w-sm text-center">
        <div className="mb-8 flex justify-center">
          <LogoLockup />
        </div>
        {error ? (
          <>
            <p className="text-sm text-destructive">{error}</p>
            <button
              type="button"
              className="mt-4 text-sm font-medium text-primary hover:underline"
              onClick={() => void navigate({ to: "/login" })}
            >
              Back to sign in
            </button>
          </>
        ) : (
          <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Signing you in…
          </p>
        )}
      </div>
    </main>
  );
}
