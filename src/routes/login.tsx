import { useState, type FormEvent } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2, PlaneTakeoff } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email.trim(), password);
      await navigate({ to: "/dashboard" });
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
      {/* Brand panel */}
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-sidebar p-12 text-white lg:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.6]"
          style={{
            background:
              "radial-gradient(120% 80% at 15% 0%, oklch(0.4 0.11 250 / 0.55), transparent 60%), radial-gradient(90% 70% at 100% 100%, oklch(0.55 0.13 245 / 0.35), transparent 55%)",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage:
              "linear-gradient(oklch(1 0 0) 1px, transparent 1px), linear-gradient(90deg, oklch(1 0 0) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
        <div className="relative flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-lg bg-white/10 ring-1 ring-white/15">
            <PlaneTakeoff className="size-5" />
          </span>
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

      {/* Form */}
      <main className="flex items-center justify-center bg-background px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <span className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground">
              <PlaneTakeoff className="size-5" />
            </span>
            <span className="text-[15px] font-semibold tracking-tight">AerScheduler</span>
          </div>

          <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Welcome back. Enter your credentials to reach your console.
          </p>

          <form onSubmit={onSubmit} className="mt-8 space-y-4">
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
                <span className="text-xs text-muted-foreground/70">Forgot?</span>
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

          <p className="mt-6 text-center text-xs text-muted-foreground">
            Connects to{" "}
            <span className="font-mono text-muted-foreground/80">api.aerscheduler.com</span>
          </p>
        </div>
      </main>
    </div>
  );
}
