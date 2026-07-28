import { useEffect } from "react";
import { Outlet } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Clock, Lock } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { formatMonthly, PRICE_PER_AIRCRAFT_CENTS, type SubStatus } from "@/lib/subscription";
import { AppShell } from "@/components/app-shell";
import { ImpersonationBanner } from "@/components/developer/impersonation-banner";
import { LogoMark } from "@/components/logo";
import { SubscribeButton, useSubStatus } from "@/components/subscription/plan";

/**
 * UI-only subscription gate. Wraps the whole authed app:
 *  - trial/grace (not blocked) → app + a reminder banner (admins only)
 *  - expired + admin → full-screen Paywall (subscribe to continue)
 *  - expired + member → "access paused, ask your admin" screen
 * No server enforcement yet — this is the front-end experience we iterate on.
 */
export function SubscriptionGate() {
  const { organization, roles } = useAuth();
  const status = useSubStatus();
  const qc = useQueryClient();

  // Returning from Stripe's hosted checkout (success redirect ...?subscribed=1):
  // re-fetch the subscription so the new (trialing) status shows, and clear the param.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("subscribed") !== "1") return;
    void qc.invalidateQueries({ queryKey: ["subscription"] });
    params.delete("subscribed");
    const qs = params.toString();
    window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""));
    toast.success("Thanks — finishing up your subscription…");
  }, [qc]);

  if (!organization || !status) {
    return (
      <AppShell>
        <Outlet />
      </AppShell>
    );
  }

  if (status.blocked) {
    // These two replace the app shell entirely, so the impersonation banner has
    // to come along — a lapsed org is exactly the kind you get asked to look at,
    // and without it a developer lands here with no way back to their own account.
    return (
      <>
        <ImpersonationBanner />
        {isAdmin(roles) ? <Paywall status={status} /> : <OrgPausedNotice orgName={organization.name} />}
      </>
    );
  }

  return (
    <AppShell>
      {isAdmin(roles) && status.state !== "active" && status.state !== "exempt" && (
        <SubscriptionBanner status={status} />
      )}
      <Outlet />
    </AppShell>
  );
}

function shortDate(d: Date): string {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function SubscriptionBanner({ status }: { status: SubStatus }) {
  const isGrace = status.state === "grace";
  return (
    <div
      className="mb-5 flex flex-col gap-2 rounded-lg border border-primary/25 bg-primary/5 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
      data-testid="subscription-banner"
    >
      <div className="flex items-start gap-2.5">
        <Clock className="mt-0.5 size-4 shrink-0 text-primary" />
        <div>
          {isGrace ? (
            <>
              <span className="font-medium">AerScheduler is moving to ${PRICE_PER_AIRCRAFT_CENTS / 100}/mo per aircraft.</span>{" "}
              <span className="text-muted-foreground">
                Billing starts {shortDate(status.freeUntil)} ({status.daysLeft} day{status.daysLeft === 1 ? "" : "s"}). Sims &amp; rooms stay free.
              </span>
            </>
          ) : (
            <>
              <span className="font-medium">
                {status.daysLeft} day{status.daysLeft === 1 ? "" : "s"} left in your free trial.
              </span>{" "}
              <span className="text-muted-foreground">
                {status.planeCount === 0
                  ? `Then $${PRICE_PER_AIRCRAFT_CENTS / 100}/mo per aircraft — add your fleet to see your total.`
                  : `Then ${status.planeCount} aircraft × $${PRICE_PER_AIRCRAFT_CENTS / 100} = ${formatMonthly(status.monthlyCents)}.`}
              </span>
            </>
          )}
        </div>
      </div>
      <SubscribeButton size="sm" label={isGrace ? "Add a card" : "Subscribe"} />
    </div>
  );
}

function Paywall({ status }: { status: SubStatus }) {
  const { organization, logout } = useAuth();
  const perPlane = PRICE_PER_AIRCRAFT_CENTS / 100;
  const hasPlanes = status.planeCount > 0;

  return (
    <div className="grid min-h-svh place-items-center bg-muted/30 px-4 py-10">
      <div className="w-full max-w-md rounded-xl border bg-card p-8 text-center shadow-sm">
        <div className="mb-5 flex justify-center">
          <LogoMark className="h-9" />
        </div>
        <div className="mx-auto grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
          <Lock className="size-6" />
        </div>
        <h1 className="mt-4 text-xl font-semibold tracking-tight">Your free trial has ended</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Subscribe to keep {organization?.name ?? "your operation"} running on AerScheduler.
        </p>

        <div className="mt-5 rounded-lg border bg-muted/30 p-4 text-left text-sm">
          {hasPlanes ? (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">
                {status.planeCount} aircraft × ${perPlane}
              </span>
              <span className="tabular-nums font-medium">{formatMonthly(status.monthlyCents)}</span>
            </div>
          ) : (
            <p className="text-muted-foreground">
              ${perPlane}/mo per aircraft. Add aircraft anytime and your bill adjusts automatically.
            </p>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            14-day free trial, no card to start. Simulators and rooms are free. Cancel anytime.
          </p>
        </div>

        <SubscribeButton
          className="mt-5 w-full"
          label={hasPlanes ? `Subscribe — ${formatMonthly(status.monthlyCents)}` : "Start free trial"}
        />

        <button onClick={logout} className="mt-4 text-xs text-muted-foreground hover:text-foreground">
          Sign out
        </button>
      </div>
    </div>
  );
}

function OrgPausedNotice({ orgName }: { orgName: string }) {
  const { logout } = useAuth();
  return (
    <div className="grid min-h-svh place-items-center bg-muted/30 px-4 py-10">
      <div className="w-full max-w-md rounded-xl border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto grid size-12 place-items-center rounded-full bg-[color-mix(in_oklch,var(--destructive)_12%,transparent)] text-destructive">
          <AlertTriangle className="size-6" />
        </div>
        <h1 className="mt-4 text-xl font-semibold tracking-tight">Access paused</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {orgName}'s subscription is inactive. Ask an administrator to renew it to restore access.
        </p>
        <button onClick={logout} className="mt-5 text-xs text-muted-foreground hover:text-foreground">
          Sign out
        </button>
      </div>
    </div>
  );
}
