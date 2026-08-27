import { useEffect } from "react";
import { Outlet } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Clock, Lock } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { trackAdConversion } from "@/lib/ads";
import { formatFreeUntil, formatMonthly, formatUnitPrice, isOffPlan, type SubStatus } from "@/lib/subscription";
import { AppShell } from "@/components/app-shell";
import { ImpersonationBanner } from "@/components/developer/impersonation-banner";
import { DemoBanner } from "@/components/demo/demo-banner";
import { LogoMark } from "@/components/logo";
import { PriceBreakdown, SubscribeButton, useSubStatus } from "@/components/subscription/plan";

/**
 * The subscription gate. Wraps the whole authed app:
 *  - not blocked → app, plus a reminder banner while a free window is running down
 *  - blocked + admin → full-screen Paywall (subscribe to continue)
 *  - blocked + member → "access paused, ask your admin" screen
 *
 * `blocked` comes from the SERVER, computed from the school's billing terms. This
 * component used to derive it here from the org's creation date against a launch-date
 * constant that also lived in the server and the Flutter app; the three drifted, and
 * only a hardcoded map of org ids could unblock an installed phone.
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
    // The one conversion that is actually money, and the other PRIMARY action in Google
    // Ads. Stripe's hosted checkout redirects back here on success, which is the only
    // moment the browser learns about it, so this is where it has to fire. No value is
    // passed: the per-conversion value lives in the Ads UI so it can be retuned without
    // a deploy. Guarded against double-counting inside lib/ads.ts, because a reloaded
    // success URL would otherwise report twice.
    trackAdConversion("subscribed");
    void qc.invalidateQueries({ queryKey: ["subscription"] });
    params.delete("subscribed");
    const qs = params.toString();
    window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""));
    toast.success("Thanks, finishing up your subscription…");
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
    // to come along, a lapsed org is exactly the kind you get asked to look at,
    // and without it a developer lands here with no way back to their own account.
    return (
      <>
        <ImpersonationBanner />
        <DemoBanner />
        {isAdmin(roles) ? <Paywall status={status} /> : <OrgPausedNotice orgName={organization.name} />}
      </>
    );
  }

  return (
    <AppShell>
      {isAdmin(roles) && status.state !== "active" && !isOffPlan(status) && (
        <SubscriptionBanner status={status} />
      )}
      <Outlet />
    </AppShell>
  );
}

/** A free window always has a date when one is open, but `freeUntil` is nullable for
 *  the states that have no window at all, so this stays total rather than asserting.
 *  Formatted in UTC, see formatFreeUntil: this is a calendar date, not an instant. */
const shortDate = (d: Date | null): string => formatFreeUntil(d);

/** What the countdown says, which depends on WHY the free window exists.
 *
 *  These three read very differently to a school and the distinction is load-bearing:
 *  when courtesy extensions were reported as ordinary trials the banner disappeared
 *  entirely and two schools came within days of a silent lockout. */
function bannerCopy(status: SubStatus): { headline: string; detail: string; cta: string } {
  const price = formatUnitPrice(status.unitPriceCents);
  const days = `${status.daysLeft} day${status.daysLeft === 1 ? "" : "s"}`;

  // What they will owe once the window closes, using their REAL terms. A sponsored
  // school quoted the list total here would be told to expect a bill they will never
  // get, which is a strange way to thank them.
  const thenOwes =
    status.planeCount === 0
      ? `Then ${price}/mo per aircraft. Add your fleet to see your total.`
      : status.monthlyCents === 0
        ? "Your fleet is fully sponsored, so there will be nothing to pay."
        : `Then ${formatMonthly(status.monthlyCents)}${
            status.sponsored ? ` for ${status.billableCount} of ${status.planeCount} aircraft` : ""
          }.`;

  // A window that has already closed has no countdown to report. This happens for a
  // school with no aircraft yet: nothing to bill, so they are not blocked, but calling
  // it "0 days left in your free trial" reads as a countdown that stopped working.
  if (!status.freeUntil) {
    return {
      headline: "Your free trial has ended.",
      detail: thenOwes,
      cta: "Subscribe",
    };
  }

  switch (status.freeUntilReason) {
    case "courtesy":
      return {
        headline: "We've extended your free access.",
        detail: `Free through ${shortDate(status.freeUntil)} (${days}). ${thenOwes}`,
        cta: "Add a card",
      };
    case "grace":
      return {
        headline: `AerScheduler is moving to ${price}/mo per aircraft.`,
        detail: `Billing starts ${shortDate(status.freeUntil)} (${days}). Sims & rooms stay free.`,
        cta: "Add a card",
      };
    default:
      return {
        headline: `${days} left in your free trial.`,
        detail: thenOwes,
        cta: "Subscribe",
      };
  }
}

function SubscriptionBanner({ status }: { status: SubStatus }) {
  const { headline, detail, cta } = bannerCopy(status);
  return (
    <div
      className="mb-5 flex flex-col gap-2 rounded-lg border border-primary/25 bg-primary/5 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
      data-testid="subscription-banner"
    >
      <div className="flex items-start gap-2.5">
        <Clock className="mt-0.5 size-4 shrink-0 text-primary" />
        <div>
          <span className="font-medium">{headline}</span>{" "}
          <span className="text-muted-foreground">{detail}</span>
        </div>
      </div>
      {/* Nothing to sell a school that owes nothing. Offering "Subscribe" to a fully
          sponsored fleet leads to a checkout the server correctly refuses. */}
      {status.monthlyCents > 0 && <SubscribeButton size="sm" label={cta} />}
    </div>
  );
}

function Paywall({ status }: { status: SubStatus }) {
  const { organization, logout } = useAuth();
  const price = formatUnitPrice(status.unitPriceCents);
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

        {hasPlanes ? (
          // The full arithmetic, not just a total. A school with comped tails needs to
          // see why the number is what it is before being asked to pay it.
          <PriceBreakdown status={status} className="mt-5 text-left" />
        ) : (
          <div className="mt-5 rounded-lg border bg-muted/30 p-4 text-left text-sm">
            <p className="text-muted-foreground">
              {price}/mo per aircraft. Add aircraft anytime and your bill adjusts automatically.
            </p>
          </div>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          No card to start. Simulators and rooms are free. Cancel anytime.
        </p>

        <SubscribeButton
          className="mt-5 w-full"
          label={hasPlanes ? `Subscribe: ${formatMonthly(status.monthlyCents)}` : "Start free trial"}
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
