import { useState, type FormEvent } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useAuth, postLoginPath } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogoLockup, LogoMark } from "@/components/logo";
import { GoogleButton, AppleButton, OrDivider } from "@/components/google-button";

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
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <BrandPanel />

      {/* Form */}
      <main className="flex items-center justify-center bg-background px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-5 lg:hidden">
            <LogoLockup />
          </div>

          <h1 className="text-[22px] font-semibold tracking-tight">Sign in</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Welcome back. Enter your credentials to reach your flight school.
          </p>

          <div className="mt-5 space-y-3">
            <GoogleButton />
            <AppleButton />
            <OrDivider />
          </div>

          <form onSubmit={onSubmit} className="mt-4 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
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
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link
                  to="/forgot-password"
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Forgot?
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                placeholder="••••••••"
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
              {busy ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <p className="mt-5 text-center text-sm text-muted-foreground">
            New to AerScheduler?{" "}
            <Link to="/signup" className="font-medium text-primary hover:underline">
              Create an account
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}

/** The signature deep-navy brand panel with the checkered grid, shared by auth pages. */
export function BrandPanel() {
  return (
    <aside className="relative hidden flex-col justify-between overflow-hidden bg-brand-surface p-12 text-white lg:flex">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.6]"
        style={{
          background:
            "radial-gradient(120% 80% at 15% 0%, color-mix(in oklch, var(--primary) 55%, transparent), transparent 60%), radial-gradient(90% 70% at 100% 100%, color-mix(in oklch, var(--brand-surface-2) 70%, transparent), transparent 55%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />
      <div className="relative flex items-center gap-2.5">
        <LogoMark onDark className="size-9" />
        <span className="text-[15px] font-semibold tracking-tight">AerScheduler</span>
      </div>

      <div className="relative max-w-md">
        <h2 className="text-3xl font-semibold leading-tight tracking-tight text-balance">
          The command deck for your flight school.
        </h2>
        <p className="mt-4 text-[15px] leading-relaxed text-white/65">
          Schedule aircraft, manage instructors and renters, and keep billing
          square &mdash; all from one place built for the front desk.
        </p>
        <dl className="mt-10 grid grid-cols-3 gap-6 border-t border-white/10 pt-6">
          {[
            ["Dispatch", "Aircraft & sims"],
            ["Roster", "Instructors & renters"],
            ["Billing", "Invoices, paid & due"],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs font-semibold uppercase tracking-wider text-white/45">
                {k}
              </dt>
              <dd className="mt-1 text-sm text-white/80">{v}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="relative text-xs text-white/40">
        &copy; {new Date().getFullYear()} AerScheduler
      </div>
    </aside>
  );
}
