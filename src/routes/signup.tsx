import { useState, type FormEvent } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthSocials, OrDivider } from "@/components/google-button";
import { LegalNotice } from "@/components/legal-notice";
import { AUTH_CONTROL, AuthShell } from "@/components/auth-shell";
import { track } from "@/lib/analytics";
import { trackAdConversion } from "@/lib/ads";
import { attributionChannel } from "@/lib/attribution";

export const Route = createFileRoute("/signup")({
  component: SignupPage,
});

function SignupPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await register(name.trim(), email.trim(), password);
      // An account now exists. The marketing site already reported `signup_started` when
      // they clicked the CTA; this is the other half, and the gap between the two is the
      // drop-off on this form.
      track("signup_completed", { method: "password", channel: attributionChannel() });
      // A PRIMARY conversion in Google Ads. Until this fired, smart bidding had nothing
      // to optimise toward on this side of the domain hop. See lib/ads.ts.
      trackAdConversion("signup_completed");
      await navigate({ to: "/onboarding" });
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Something went wrong. Please try again."
      );
      setBusy(false);
    }
  }

  return (
    <AuthShell
      aside={
        <>
          <span className="hidden sm:inline">Already have an account? </span>
          <Link to="/login" className="font-medium text-foreground hover:text-primary">
            Sign in
          </Link>
        </>
      }
    >
      <h1 className="text-[28px] font-semibold tracking-tight sm:text-[32px]">Create your account</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
        Two minutes to a bookable aircraft. No credit card, no sales call.
      </p>

      <div className="mt-8">
        <AuthSocials googleLabel="Google" appleLabel="Apple" />
        <div className="mt-6">
          <OrDivider />
        </div>
      </div>

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="name">Your name</Label>
          <Input
            id="name"
            autoComplete="name"
            required
            placeholder="Amelia Earhart"
            className={AUTH_CONTROL}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Work email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            placeholder="you@flightschool.com"
            className={AUTH_CONTROL}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            placeholder="At least 8 characters"
            className={AUTH_CONTROL}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <Button type="submit" size="lg" className={`w-full ${AUTH_CONTROL}`} disabled={busy}>
          {busy && <Loader2 className="size-4 animate-spin" />}
          {busy ? "Creating account…" : "Create account"}
        </Button>
      </form>

      <LegalNotice />
    </AuthShell>
  );
}
