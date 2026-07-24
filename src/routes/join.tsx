import * as React from "react";
import { createFileRoute, redirect, useNavigate, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, Loader2, Ticket } from "lucide-react";
import { isAuthenticated, postLoginPath, useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { LogoMark } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/join")({
  beforeLoad: () => {
    if (!isAuthenticated()) throw redirect({ to: "/login" });
  },
  component: JoinPage,
});

function JoinPage() {
  const { joinByCode } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [code, setCode] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [requested, setRequested] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return setError("Enter the code your school gave you.");
    setBusy(true);
    setError(null);
    try {
      const outcome = await joinByCode(code);
      if (outcome === "joined") {
        await qc.invalidateQueries();
        void navigate({ to: postLoginPath() });
      } else {
        setRequested(true);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "That code didn't work. Double-check it and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-svh place-items-center bg-muted/30 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <LogoMark className="h-9" />
        </div>

        {requested ? (
          <div className="rounded-xl border bg-card p-8 text-center shadow-sm">
            <div className="mx-auto grid size-12 place-items-center rounded-full bg-[color-mix(in_oklch,var(--success)_15%,transparent)] text-success">
              <CheckCircle2 className="size-6" />
            </div>
            <h1 className="mt-4 text-lg font-semibold">Request sent</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              This is a private school, so an admin needs to approve you. You&rsquo;ll get access
              as soon as they do.
            </p>
            <Button asChild variant="outline" className="mt-6">
              <Link to="/onboarding">
                <ArrowLeft className="size-4" /> Back
              </Link>
            </Button>
          </div>
        ) : (
          <div className="rounded-xl border bg-card p-8 shadow-sm">
            <div className="text-center">
              <div className="mx-auto grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
                <Ticket className="size-6" />
              </div>
              <h1 className="mt-4 text-xl font-semibold tracking-tight">Join your school</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Enter the code your flight school shared with you.
              </p>
            </div>

            <form onSubmit={submit} className="mt-6 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="join-code">School code</Label>
                <Input
                  id="join-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="e.g. MURRAY-AV"
                  autoFocus
                  autoComplete="off"
                  className="text-center font-mono text-lg tracking-widest"
                />
              </div>

              {error && (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              )}

              <Button type="submit" className="w-full" disabled={busy || !code.trim()}>
                {busy ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Joining…
                  </>
                ) : (
                  "Join school"
                )}
              </Button>
            </form>

            <p className="mt-6 text-center text-sm text-muted-foreground">
              Starting your own?{" "}
              <Link to="/onboarding" className="font-medium text-primary hover:underline">
                Set up a school
              </Link>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
