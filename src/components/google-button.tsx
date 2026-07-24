import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useAuth, postLoginPath } from "@/lib/auth";
import { Button } from "@/components/ui/button";

/** "Continue with Google" — opens the Google chooser, then routes into the app. */
export function GoogleButton({ label = "Continue with Google" }: { label?: string }) {
  const { googleLogin } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onClick() {
    setError(null);
    setBusy(true);
    try {
      await googleLogin();
      await navigate({ to: postLoginPath() });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Google sign-in failed.";
      // A user closing the popup isn't an error worth shouting about.
      if (!/cancel|closed|popup|dismiss/i.test(msg)) setError(msg);
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="w-full"
        onClick={onClick}
        disabled={busy}
      >
        {busy ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <img src="/brand/google.png" alt="" aria-hidden className="size-4" />
        )}
        {label}
      </Button>
      {error && <p className="text-center text-xs text-destructive">{error}</p>}
    </div>
  );
}

/** A labeled "or" divider for auth screens. */
export function OrDivider() {
  return (
    <div className="flex items-center gap-3">
      <span className="h-px flex-1 bg-border" />
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">or</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
