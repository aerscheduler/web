import { useState, type FormEvent } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogoLockup } from "@/components/logo";
import { GoogleButton, AppleButton, OrDivider } from "@/components/google-button";
import { LegalNotice } from "@/components/legal-notice";
import { BrandPanel } from "./login";
import { track } from "@/lib/analytics";
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
      await navigate({ to: "/onboarding" });
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Something went wrong. Please try again."
      );
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <BrandPanel />
      <main className="flex items-center justify-center bg-background px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-5 lg:hidden">
            <LogoLockup />
          </div>
          <h1 className="text-[22px] font-semibold tracking-tight">Create your account</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Two minutes to a bookable aircraft. No credit card, no sales call.
          </p>

          <div className="mt-5 space-y-3">
            <GoogleButton label="Sign up with Google" />
            <AppleButton label="Sign up with Apple" />
            <OrDivider />
          </div>

          <form onSubmit={onSubmit} className="mt-4 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Your name</Label>
              <Input
                id="name"
                autoComplete="name"
                required
                placeholder="Amelia Earhart"
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
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {error && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}

            <Button type="submit" size="lg" className="w-full" disabled={busy}>
              {busy && <Loader2 className="size-4 animate-spin" />}
              {busy ? "Creating account…" : "Create account"}
            </Button>
          </form>

          <LegalNotice />

          <p className="mt-5 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link to="/login" className="font-medium text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
