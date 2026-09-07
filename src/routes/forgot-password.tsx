import { useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Loader2, MailCheck } from "lucide-react";
import { apiRaw, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AUTH_CONTROL, AuthShell } from "@/components/auth-shell";

export const Route = createFileRoute("/forgot-password")({
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      // Always 204: the server never reveals whether the email exists.
      await apiRaw("/auth/forgot-password", { method: "POST", body: { email: email.trim() } });
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
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
      {sent ? (
        <>
          <span className="grid size-12 place-items-center rounded-full bg-success/12 text-success">
            <MailCheck className="size-6" />
          </span>
          <h1 className="mt-5 text-[28px] font-semibold tracking-tight sm:text-[32px]">Check your email</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
            If an account exists for <span className="font-medium text-foreground">{email}</span>,
            we&rsquo;ve sent a link to reset your password. It expires shortly, so use it soon.
          </p>
          <Button asChild variant="outline" className={`mt-8 ${AUTH_CONTROL}`}>
            <Link to="/login">
              <ArrowLeft className="size-4" /> Back to sign in
            </Link>
          </Button>
        </>
      ) : (
        <>
          <h1 className="text-[28px] font-semibold tracking-tight sm:text-[32px]">Reset your password</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
            Enter your email and we&rsquo;ll send you a link to get back in.
          </p>

          <form onSubmit={onSubmit} className="mt-8 space-y-5">
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

            {error && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}

            <Button type="submit" size="lg" className={`w-full ${AUTH_CONTROL}`} disabled={busy}>
              {busy && <Loader2 className="size-4 animate-spin" />}
              {busy ? "Sending…" : "Send reset link"}
            </Button>
          </form>
        </>
      )}
    </AuthShell>
  );
}
