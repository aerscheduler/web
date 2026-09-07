import * as React from "react";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { MailCheck, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { isAuthenticated, isEmailVerifiedSync, needsEmailVerification, postLoginPath, useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { AUTH_CONTROL, AuthShell } from "@/components/auth-shell";
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
      // email, and are never seen again. Without this event that loss is invisible.
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
      toast.success("Verification email sent. Check your inbox.");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't resend the email");
    } finally {
      setResending(false);
    }
  }

  return (
    <AuthShell
      aside={
        <button type="button" onClick={logout} className="font-medium text-foreground hover:text-primary">
          Sign out
        </button>
      }
    >
      <div className="mx-auto grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
        <MailCheck className="size-6" />
      </div>
      <h1 className="mt-5 text-[28px] font-semibold tracking-tight sm:text-[32px]">Verify your email</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
        We sent a verification link to{" "}
        <span className="font-medium text-foreground">{user?.email ?? "your email"}</span>. Click it to
        continue. This page updates automatically once you do.
      </p>

      <Button className={`mt-8 w-full ${AUTH_CONTROL}`} size="lg" onClick={checkNow} disabled={checking}>
        {checking ? <Loader2 className="size-4 animate-spin" /> : null}
        I've verified. Continue
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
    </AuthShell>
  );
}
