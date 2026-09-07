import { useState, type FormEvent } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useAuth, postLoginPath } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthSocials, OrDivider } from "@/components/google-button";
import { LegalNotice } from "@/components/legal-notice";
import { AUTH_CONTROL, AuthShell } from "@/components/auth-shell";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  validateSearch: (search: Record<string, unknown>): { error?: string; redirect?: string } => ({
    error: typeof search.error === "string" ? search.error : undefined,
    // Where to land after signing in. Set when an expired session bounced the
    // user out of a page they were already on. Same-origin paths only.
    redirect:
      typeof search.redirect === "string" &&
      search.redirect.startsWith("/") &&
      !search.redirect.startsWith("//")
        ? search.redirect
        : undefined,
  }),
});

function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const { error: oauthError, redirect } = Route.useSearch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(
    oauthError ? "Google sign-in didn't complete. Please try again." : null
  );
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email.trim(), password);
      const next = postLoginPath();
      // Send them back where they were bounced from, but only once the account
      // is actually usable. A user who still has to verify or onboard has to go
      // through that first, so the gate wins over the remembered page.
      if (redirect && (next === "/dashboard" || next === "/me")) {
        await navigate({ href: redirect });
      } else {
        await navigate({ to: next });
      }
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "We couldn't reach the server. Check your connection and try again."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      aside={
        <>
          <span className="hidden sm:inline">New here? </span>
          <Link to="/signup" className="font-medium text-foreground hover:text-primary">
            Create an account
          </Link>
        </>
      }
    >
      <h1 className="text-[28px] font-semibold tracking-tight sm:text-[32px]">Sign in</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
        Welcome back. Enter your credentials to reach your flight school.
      </p>

      <div className="mt-8">
        <AuthSocials />
        <div className="mt-6">
          <OrDivider />
        </div>
      </div>

      <form onSubmit={onSubmit} className="mt-6 space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
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
        <div className="relative space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            placeholder="••••••••"
            className={AUTH_CONTROL}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Link
            to="/forgot-password"
            className="absolute right-0 top-0 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            Forgot password?
          </Link>
        </div>

        {error && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <Button type="submit" size="lg" className={`w-full ${AUTH_CONTROL}`} disabled={busy}>
          {busy && <Loader2 className="size-4 animate-spin" />}
          {busy ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      {/* Sign-in, not just sign-up: the Google and Apple buttons above CREATE an
          account when the address is new, so this page is an acceptance point too. */}
      <LegalNotice action="continuing" />
    </AuthShell>
  );
}
