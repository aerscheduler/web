import * as React from "react";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { MailCheck, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { isAuthenticated, isEmailVerifiedSync, needsEmailVerification, postLoginPath, useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { LogoMark } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { track } from "@/lib/analytics";
import { attributionChannel } from "@/lib/attribution";

export const Route = createFileRoute("/verify-email")({
  beforeLoad: () => {
    if (!isAuthenticated()) throw redirect({ to: "/login" });
    // Gate not needed (dev bypass or already verified) → get out of the way.
    if (!needsEmailVerification()) throw redirect({ to: postLoginPath() });
  },
  component: VerifyEmailPage,
});

function VerifyEmailPage() {
  const { user, rehydrate, resendVerificationEmail, logout } = useAuth();
  const navigate = useNavigate();

  const [checking, setChecking] = React.useState(false);
  const [resending, setResending] = React.useState(false);

  const goIfVerified = React.useCallback(async () => {
    await rehydrate();
    if (isEmailVerifiedSync()) {
      // The quietest place to lose a paid signup: they create the account, never find the
      // email, and are never seen again. Without this event that loss is invisible —
      // they'd simply look like someone who signed up and did nothing.
      track("email_verified", { channel: attributionChannel() });
      void navigate({ to: postLoginPath() });
      return true;
    }
    return false;
  }, [rehydrate, navigate]);

  // Poll in the background so the page advances the moment they click the link.
  React.useEffect(() => {
    const t = setInterval(() => {
      void goIfVerified();
    }, 4000);
    return () => clearInterval(t);
  }, [goIfVerified]);

  async function checkNow() {
    setChecking(true);
    try {
      const ok = await goIfVerified();
      if (!ok) toast.message("Not verified yet", { description: "Click the link in your email, then try again." });
    } finally {
      setChecking(false);
    }
  }

  async function resend() {
    setResending(true);
    try {
      await resendVerificationEmail();
      toast.success("Verification email sent — check your inbox.");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't resend the email");
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="grid min-h-svh place-items-center bg-muted/30 px-4 py-10">
      <div className="w-full max-w-md rounded-xl border bg-card p-8 text-center shadow-sm">
        <div className="mb-5 flex justify-center">
          <LogoMark className="h-9" />
        </div>
        <div className="mx-auto grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
          <MailCheck className="size-6" />
        </div>
        <h1 className="mt-4 text-xl font-semibold tracking-tight">Verify your email</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          We sent a verification link to{" "}
          <span className="font-medium text-foreground">{user?.email ?? "your email"}</span>. Click it to
          continue — this page updates automatically once you do.
        </p>

        <Button className="mt-5 w-full" onClick={checkNow} disabled={checking}>
          {checking ? <Loader2 className="size-4 animate-spin" /> : null}
          I've verified — continue
        </Button>

        <button
          type="button"
          onClick={resend}
          disabled={resending}
          className="mt-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground disabled:opacity-60"
        >
          {resending ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
          Resend email
        </button>

        <div className="mt-6 border-t pt-4">
          <button onClick={logout} className="text-xs text-muted-foreground hover:text-foreground">
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
