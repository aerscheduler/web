import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useAuth, postLoginPath } from "@/lib/auth";
import { APPLE_ENABLED } from "@/lib/apple";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Outline socials need a 3:1 edge; the default `border-input` hairline does not. */
const SOCIAL_OUTLINE = "h-11 w-full border-foreground/40 dark:border-foreground/40";

/** "Continue with Google", opens the Google chooser, then routes into the app. */
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
        className={SOCIAL_OUTLINE}
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

/** "Continue with Apple", opens the Apple popup, then routes into the app. Hidden if disabled. */
export function AppleButton({ label = "Continue with Apple" }: { label?: string }) {
  const { appleLogin } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  if (!APPLE_ENABLED) return null;

  async function onClick() {
    setError(null);
    setBusy(true);
    try {
      await appleLogin();
      await navigate({ to: postLoginPath() });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Apple sign-in failed.";
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
        onClick={onClick}
        disabled={busy}
        className={SOCIAL_OUTLINE}
      >
        {busy ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <>
            <img src="/brand/apple.png" alt="" aria-hidden className="size-4 dark:hidden" />
            <img src="/brand/apple-white.png" alt="" aria-hidden className="hidden size-4 dark:block" />
          </>
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

/** Google + Apple in a row on desktop so the form is not a tall stack of full-width pills. */
export function AuthSocials({
  googleLabel = "Google",
  appleLabel = "Apple",
}: {
  googleLabel?: string;
  appleLabel?: string;
}) {
  return (
    <div className={cn("grid gap-3", APPLE_ENABLED && "sm:grid-cols-2")}>
      <GoogleButton label={googleLabel} />
      <AppleButton label={appleLabel} />
    </div>
  );
}
