import { useState, type FormEvent } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { CheckCircle2, Loader2 } from "lucide-react";
import { apiRaw, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AUTH_CONTROL, AuthShell } from "@/components/auth-shell";

type Search = { token?: string };

export const Route = createFileRoute("/reset-password")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    token: typeof search.token === "string" ? search.token : undefined,
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { token } = Route.useSearch();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      await apiRaw("/auth/reset-password", { method: "POST", body: { token, password } });
      setDone(true);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Your reset link is invalid or has expired."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      aside={
        <Link to="/login" className="font-medium text-foreground hover:text-primary">
          Sign in
        </Link>
      }
    >
      {done ? (
        <>
          <span className="grid size-12 place-items-center rounded-full bg-success/12 text-success">
            <CheckCircle2 className="size-6" />
          </span>
          <h1 className="mt-5 text-[28px] font-semibold tracking-tight sm:text-[32px]">Password updated</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
            You can now sign in with your new password.
          </p>
          <Button className={`mt-8 ${AUTH_CONTROL}`} onClick={() => navigate({ to: "/login" })}>
            Go to sign in
          </Button>
        </>
      ) : !token ? (
        <>
          <h1 className="text-[28px] font-semibold tracking-tight sm:text-[32px]">Invalid reset link</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
            This link is missing its token. Request a fresh one and try again.
          </p>
          <Button asChild variant="outline" className={`mt-8 ${AUTH_CONTROL}`}>
            <Link to="/forgot-password">Request a new link</Link>
          </Button>
        </>
      ) : (
        <>
          <h1 className="text-[28px] font-semibold tracking-tight sm:text-[32px]">Set a new password</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
            Choose a strong password you don&rsquo;t use anywhere else.
          </p>

          <form onSubmit={onSubmit} className="mt-8 space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="password">New password</Label>
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
            <div className="space-y-1.5">
              <Label htmlFor="confirm">Confirm password</Label>
              <Input
                id="confirm"
                type="password"
                autoComplete="new-password"
                required
                placeholder="Re-enter your password"
                className={AUTH_CONTROL}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>

            {error && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}

            <Button type="submit" size="lg" className={`w-full ${AUTH_CONTROL}`} disabled={busy}>
              {busy && <Loader2 className="size-4 animate-spin" />}
              {busy ? "Updating…" : "Update password"}
            </Button>
          </form>
        </>
      )}
    </AuthShell>
  );
}
