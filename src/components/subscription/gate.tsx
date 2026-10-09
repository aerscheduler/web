import { useEffect, useState } from "react";
import { Outlet } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, Clock, CreditCard, Lock } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { trackAdConversion } from "@/lib/ads";
import { formatFreeUntil, formatMonthly, formatUnitPrice, isOffPlan, type SubStatus } from "@/lib/subscription";
import { AppShell } from "@/components/app-shell";
import { ImpersonationBanner } from "@/components/developer/impersonation-banner";
import { DemoBanner } from "@/components/demo/demo-banner";
import { LogoMark } from "@/components/logo";
import { ManageBillingButton, PriceBreakdown, SubscribeButton, useSubStatus } from "@/components/subscription/plan";

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
  const { organization, roles, user } = useAuth();
  const status = useSubStatus();
  const qc = useQueryClient();

  // Returning from Stripe's hosted checkout (success redirect ...?subscribed=1):
  // re-fetch the subscription so the new (trialing) status shows, and clear the param.
  // The flag is read once on mount, because the param is stripped straight away and
  // the conversion below has to wait for the status to load.
  const [returnedFromCheckout] = useState(
    () => new URLSearchParams(window.location.search).get("subscribed") === "1"
  );
  useEffect(() => {
    if (!returnedFromCheckout) return;
    void qc.invalidateQueries({ queryKey: ["subscription"] });
    const params = new URLSearchParams(window.location.search);
    params.delete("subscribed");
    const qs = params.toString();
    window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""));
    toast.success("Thanks, finishing up your subscription…");
  }, [qc, returnedFromCheckout]);

  // The one conversion that is actually money, and the other PRIMARY action in Google
  // Ads. Stripe's hosted checkout redirects back here on success, which is the only
  // moment the browser learns about it, so this is where it has to fire. The value is
  // the school's real first year (what it owes per month, after allowance and discount,
  // times 12), so a three-aircraft school reports three times a one-aircraft school.
  // Guarded against double-counting inside lib/ads.ts.
  const firstYearValue = status && status.monthlyCents > 0 ? (status.monthlyCents * 12) / 100 : undefined;
  useEffect(() => {
    if (!returnedFromCheckout || firstYearValue === undefined) return;
    trackAdConversion("subscribed", { value: firstYearValue, email: user?.email ?? undefined });
  }, [returnedFromCheckout, firstYearValue, user?.email]);

  if (!organization || !status) {
    return (
      <AppShell>
        <Outlet />
      </AppShell>
    );
  }

  // A maintenance shop with no aircraft of its own has nothing on the plan: customer aircraft
  // are never counted (server utils/fleetPlanes.ts), so the server never pauses it either. A
  // countdown ending in "$20/mo per aircraft, add your fleet" would be false for it. Shop
  // pricing is still Tony's decision (see _local/maintenance-shop/MECHANIC-ONBOARDING-AND-
  // WEBSITE-PLAN.md); once a shop adds a fleet aircraft it gets the ordinary banner.
  const shopWithoutFleet = organization.organizationType === "maintenance_shop" && status.planeCount === 0;

  if (status.blocked) {
    // These two replace the app shell entirely, so the impersonation banner has
    // to come along, a lapsed org is exactly the kind you get asked to look at,
    // and without it a developer lands here with no way back to their own account.
    return (
      <>
        <ImpersonationBanner />
        <DemoBanner />
        {status.state === "card_required" ? (
          isAdmin(roles) ? (
            <StartTrialWall status={status} />
          ) : (
            <OrgPausedNotice orgName={organization.name} notStarted />
          )
        ) : isAdmin(roles) ? (
          status.paymentProblem ? (
            <PaymentFailedWall status={status} />
          ) : (
            <Paywall status={status} />
          )
        ) : (
          <OrgPausedNotice orgName={organization.name} />
        )}
      </>
    );
  }

  return (
    <AppShell>
      {isAdmin(roles) && status.state !== "active" && !isOffPlan(status) && !shopWithoutFleet && (
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
        <p className="mt-2 text-xs text-muted-foreground">Simulators and rooms are free. Cancel anytime.</p>

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

/**
 * A school that DID subscribe, whose charge then failed (Stripe `past_due` or `unpaid`).
 *
 * The ordinary Paywall told them "Your free trial has ended, subscribe", which is false
 * for somebody whose card was just declined, and the first school to land here
 * (VA Office of Emergency Services, 2026-10-08) had subscribed two weeks earlier. What
 * they need is the billing portal, where the card is changed, not Checkout.
 */
function PaymentFailedWall({ status }: { status: SubStatus }) {
  const { organization, logout } = useAuth();
  const orgName = organization?.name ?? "your operation";

  return (
    <div className="grid min-h-svh place-items-center bg-muted/30 px-4 py-10" data-testid="payment-failed-wall">
      <div className="w-full max-w-md rounded-xl border bg-card p-8 text-center shadow-sm">
        <div className="mb-5 flex justify-center">
          <LogoMark className="h-9" />
        </div>
        <div className="mx-auto grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
          <CreditCard className="size-6" />
        </div>
        <h1 className="mt-4 text-xl font-semibold tracking-tight">Your payment didn't go through</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          We couldn't charge the card on file for{" "}
          {status.monthlyCents > 0 ? `${orgName}'s ${formatMonthly(status.monthlyCents)} plan` : orgName}, so
          AerScheduler is paused for everyone until it's paid.
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          Nothing is deleted. Update your card and everything comes back the moment the payment goes through.
        </p>

        <ManageBillingButton className="mt-5 w-full" />

        <button onClick={logout} className="mt-4 text-xs text-muted-foreground hover:text-foreground">
          Sign out
        </button>
      </div>
    </div>
  );
}

/**
 * A school on the card-required trial that has not added its card. Normally the signup
 * wizard asks for it, so this is what somebody sees who left the wizard at the card and
 * came back later: the same offer, said the same way, with the date it is free until.
 */
function StartTrialWall({ status }: { status: SubStatus }) {
  const { organization, logout } = useAuth();
  const price = formatUnitPrice(status.unitPriceCents);
  const until = formatFreeUntil(status.freeUntil);
  const back = `${window.location.origin}${window.location.pathname}`;

  return (
    <div className="grid min-h-svh place-items-center bg-muted/30 px-4 py-10" data-testid="start-trial-wall">
      <div className="w-full max-w-md rounded-xl border bg-card p-8 text-center shadow-sm">
        <div className="mb-5 flex justify-center">
          <LogoMark className="h-9" />
        </div>
        <div className="mx-auto grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
          <CreditCard className="size-6" />
        </div>
        <h1 className="mt-4 text-xl font-semibold tracking-tight">Start your free trial</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Add a card to start using AerScheduler for {organization?.name ?? "your operation"}. Nothing is charged
          today.
        </p>

        <TrialTerms status={status} className="mt-5 text-left" />

        <SubscribeButton
          className="mt-5 w-full"
          label="Add a card and start trial"
          successUrl={`${back}?subscribed=1`}
          cancelUrl={back}
        />
        <p className="mt-2 text-xs text-muted-foreground">
          {price}/mo per aircraft after {until}.
          <br />
          Cancel before then and you pay nothing.
        </p>

        <button onClick={logout} className="mt-4 text-xs text-muted-foreground hover:text-foreground">
          Sign out
        </button>
      </div>
    </div>
  );
}

/**
 * What starting a card-required trial commits them to, in three lines: free until when,
 * what it costs after, and how to get out. Shared by the signup wizard and the wall above
 * so the offer never reads two different ways.
 */
export function TrialTerms({ status, className }: { status: SubStatus; className?: string }) {
  const price = formatUnitPrice(status.unitPriceCents);
  const until = formatFreeUntil(status.freeUntil);
  const after =
    status.planeCount === 0
      ? `Then ${price}/mo for each aircraft you add. Nothing is charged while you have none.`
      : status.monthlyCents === 0
        ? "Your aircraft are sponsored, so there is nothing to pay after it either."
        : `Then ${formatMonthly(status.monthlyCents)} for ${status.billableCount} aircraft, charged to this card. Add or remove aircraft anytime and it adjusts.`;

  return (
    <ul className={cn("space-y-2 rounded-lg border bg-muted/30 p-4 text-sm", className)}>
      <li className="flex gap-2">
        <Check className="mt-0.5 size-4 shrink-0 text-success" />
        <span>
          <span className="font-medium">Free until {until}.</span>{" "}
          <span className="text-muted-foreground">Nothing is charged today.</span>
        </span>
      </li>
      <li className="flex gap-2">
        <Check className="mt-0.5 size-4 shrink-0 text-success" />
        <span className="text-muted-foreground">{after} Simulators and rooms are always free.</span>
      </li>
      <li className="flex gap-2">
        <Check className="mt-0.5 size-4 shrink-0 text-success" />
        <span className="text-muted-foreground">
          We email you 3 days before it ends. Cancel from Settings, Plan before {until} and you pay nothing.
        </span>
      </li>
    </ul>
  );
}

function OrgPausedNotice({ orgName, notStarted = false }: { orgName: string; notStarted?: boolean }) {
  const { logout } = useAuth();
  if (notStarted) {
    // A member who joined before the founder finished setup. Nothing has lapsed, so
    // "paused" and "renew" would be the wrong words.
    return (
      <div className="grid min-h-svh place-items-center bg-muted/30 px-4 py-10">
        <div className="w-full max-w-md rounded-xl border bg-card p-8 text-center shadow-sm">
          <div className="mx-auto grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
            <Clock className="size-6" />
          </div>
          <h1 className="mt-4 text-xl font-semibold tracking-tight">Almost ready</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {orgName} is still being set up. Once an administrator starts the organization's trial, you'll have
            full access.
          </p>
          <button onClick={logout} className="mt-5 text-xs text-muted-foreground hover:text-foreground">
            Sign out
          </button>
        </div>
      </div>
    );
  }
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
