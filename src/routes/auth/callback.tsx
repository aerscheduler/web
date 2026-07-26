import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { postLoginPath, useAuth } from "@/lib/auth";
import { getToken, setToken } from "@/lib/api";
import { LogoLockup } from "@/components/logo";

export const Route = createFileRoute("/auth/callback")({
  component: AuthCallbackPage,
  validateSearch: (search: Record<string, unknown>): { token?: string } => ({
    token: typeof search.token === "string" ? search.token : undefined,
  }),
});

/**
 * Landing pad for the marketing-site Google OAuth redirect.
 * Server sends us here with ?token=<aerScheduler JWT> after Google signs the
 * user in; we stash it, hydrate the session, and route into the app.
 */
function AuthCallbackPage() {
  const search = Route.useSearch();
  const { rehydrate } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function finish() {
      // Prefer the live query string over router search — React Strict Mode
      // remounts this page, and an early history.replaceState used to wipe
      // ?token= before the second mount could read it.
      const fromUrl = new URLSearchParams(window.location.search).get("token");
      const jwt = search.token || fromUrl || getToken();
      if (!jwt) {
        setError("Missing sign-in token. Please try again.");
        return;
      }

      setToken(jwt);

      try {
        await rehydrate();
        if (cancelled) return;
        // Navigate away (replace) so the JWT never sits in the address bar.
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
  }, [search.token, rehydrate, navigate]);

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
