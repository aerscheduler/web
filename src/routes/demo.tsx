import { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { isDemoSync, useAuth } from "@/lib/auth";
import { ApiError, isTokenExpired } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { LogoLockup } from "@/components/logo";

export const Route = createFileRoute("/demo")({
  component: DemoEntry,
});

/**
 * The way in. One click on the marketing site lands here, a sandbox session is
 * minted, and the visitor is dropped into the dispatch board.
 *
 * Deliberately has no sign-in form and no Google or Apple buttons. Those create
 * REAL accounts (`completeOAuthSignIn` writes a user row), which is the opposite
 * of what someone who clicked "try it without signing up" asked for — and the
 * point of the demo is that there is nothing to sign up for.
 */
function DemoEntry() {
  const { startDemo } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  // React 18 mounts effects twice in development. Minting two sessions is
  // harmless (the second replaces the first) but it burns the per-IP rate limit
  // twice per visit, which is exactly the budget a real visitor needs.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    void (async () => {
      try {
        // Already inside a live demo in this tab — navigating back to /demo means
        // "take me to the demo", not "throw that one away and mint another".
        // Minting again would also spend the per-IP budget for no reason, and
        // that budget is small enough that a visitor who wanders back here a few
        // times could lock themselves out of the thing they came to see.
        if (isDemoSync() && !isTokenExpired()) {
          await navigate({ to: "/dashboard", replace: true });
          return;
        }

        await startDemo();
        // Everyone starts as the owner, so the dispatch board is the right
        // landing: it is the screen the product is actually about.
        await navigate({ to: "/dashboard", replace: true });
      } catch (err) {
        setError(
          err instanceof ApiError && err.status === 503
            ? "The demo is being rebuilt. Try again in a moment."
            : err instanceof ApiError
              ? err.message
              : "We couldn't reach the server. Check your connection and try again."
        );
      }
    })();
  }, [startDemo, navigate]);

  return (
    <div className="grid min-h-dvh place-items-center bg-background px-6 text-center">
      <div className="max-w-sm">
        <div className="mb-6 flex justify-center">
          <LogoLockup />
        </div>

        {error ? (
          <>
            <h1 className="text-xl font-semibold tracking-tight">The demo isn&rsquo;t ready</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">{error}</p>
            <Button className="mt-6" onClick={() => window.location.reload()}>
              Try again
            </Button>
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold tracking-tight">Setting up your demo…</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              A flight school with a fleet, a roster and a few months of history. Nothing here is
              real, and you can change any of it.
            </p>
            <Loader2 className="mx-auto mt-6 size-5 animate-spin text-muted-foreground" />
          </>
        )}
      </div>
    </div>
  );
}
