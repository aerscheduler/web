import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { postLoginPath, useAuth } from "@/lib/auth";
import { setToken } from "@/lib/api";
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
  const { token } = Route.useSearch();
  const { rehydrate } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function finish() {
      if (!token) {
        setError("Missing sign-in token. Please try again.");
        return;
      }

      setToken(token);
      // Drop the token from the URL so it isn't left in history / referrers.
      window.history.replaceState(null, "", "/auth/callback");

      try {
        await rehydrate();
        if (cancelled) return;
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
  }, [token, rehydrate, navigate]);

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
