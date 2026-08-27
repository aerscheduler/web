import * as React from "react";
import { PlaneTakeoff, Check, ExternalLink, Gift, Info, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { usePlanes, useSubscription, useSubscriptionCheckout } from "@/features/queries";
import {
  TRIAL_DAYS,
  formatMonthly,
  formatUnitPrice,
  isOffPlan,
  subscriptionStatus,
  type SubState,
  type SubStatus,
} from "@/lib/subscription";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** Read a preview override from the URL (?sub=trial|grace|courtesy|expired|active|
 *  legacy|free) so we can see each billing state without waiting 14 days or editing a
 *  school's terms. Harmless in prod: it changes what this browser renders, never what
 *  anyone is charged. */
const PREVIEW_STATES: readonly SubState[] = [
  "trial",
  "grace",
  "courtesy",
  "expired",
  "active",
  "legacy",
  "free",
];

function overrideState(): SubState | null {
  if (typeof window === "undefined") return null;
  const v = new URLSearchParams(window.location.search).get("sub");
  return PREVIEW_STATES.includes(v as SubState) ? (v as SubState) : null;
}

/**
 * Live subscription status for the active org. Re-reads on the "aer:sub" event
 * (fired when the local subscribed flag changes) so the gate/banner update
 * without a reload.
 */
export function useSubStatus(): SubStatus | null {
  const { organization } = useAuth();
  // Only a fallback so a page can show a fleet size before the status lands; the
  // server reports the count its invoice is actually built from.
  const planes = usePlanes(undefined, { enabled: !!organization });
  // The verdict: model, state, blocked, and what they owe. The server computes all of
  // it from the school's billing terms. Demo orgs come back as `free` from there, so
  // there is no longer a special case for them here.
  const sub = useSubscription({ enabled: !!organization });

  return React.useMemo(() => {
    if (!organization) return null;
    const base = subscriptionStatus(sub.data, planes.data?.length ?? 0);
    if (!base) return null;
    const ov = overrideState();
    return ov ? { ...base, state: ov, blocked: ov === "expired" } : base;
  }, [organization, planes.data, sub.data]);
}

/**
 * Starts the subscription: asks the server to create a Stripe Checkout Session
 * (quantity = current fleet, 14-day trial) and redirects to Stripe's hosted page.
 * On return, the `useSubscription` query reflects the new (trialing) subscription.
 */
export function SubscribeButton({
  label = "Start subscription",
  className,
  size,
}: {
  label?: string;
  className?: string;
  size?: "sm" | "default" | "lg";
}) {
  const checkout = useSubscriptionCheckout();

  async function go() {
    try {
      const { url } = await checkout.mutateAsync({});
      if (url) window.location.assign(url);
      else toast.error("Couldn't start checkout, please try again.");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't start checkout");
    }
  }

  return (
    <Button onClick={go} className={className} size={size} disabled={checkout.isPending}>
      {checkout.isPending ? <Loader2 className="size-4 animate-spin" /> : <ExternalLink className="size-4" />}
      {label}
    </Button>
  );
}

/** One-line reminder of what the NEXT aircraft costs, for the add-aircraft surfaces.
 *
 *  Hidden for schools not on the per-aircraft plan: a grandfathered school should not
 *  learn about a price change here, and a sponsored one has no per-tail price to quote.
 *
 *  With an allowance, "what does another aircraft cost" genuinely varies: a school with
 *  3 comped tails and 2 in use adds its next one for free. Saying "$20/mo per aircraft"
 *  flatly would be wrong for exactly the schools we went out of our way to sponsor. */
export function PerPlanePricingNote({ className }: { className?: string }) {
  const status = useSubStatus();
  if (!status || isOffPlan(status)) return null;

  const allowanceLeft = Math.max(0, status.freeUnits - status.planeCount);
  const price = formatUnitPrice(status.unitPriceCents);

  return (
    <p className={cn("flex items-center gap-1.5 text-xs text-muted-foreground", className)}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" className="cursor-help" aria-label="How pricing works">
            <Info className="size-3.5 shrink-0" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-[16rem]">
          Only aircraft count toward your bill, billed monthly and prorated when you add or remove a tail.
          Simulators and ground-school rooms are always free.
          {status.freeUnits > 0 ? ` Your first ${status.freeUnits} aircraft are on us.` : ""}
        </TooltipContent>
      </Tooltip>
      {allowanceLeft > 0 ? (
        <span>
          <span className="font-medium text-foreground">
            Your next {allowanceLeft === 1 ? "aircraft is" : `${allowanceLeft} aircraft are`} free
          </span>{" "}
          on us, then {price}/mo each. Simulators &amp; rooms are free.
        </span>
      ) : (
        <span>
          <span className="font-medium text-foreground">{price}/mo per aircraft</span>{" "}
          after your trial. Simulators &amp; rooms are free.
        </span>
      )}
    </p>
  );
}

/**
 * The onboarding "your plan" card, replaces the old Stripe Connect card in the
 * school Finish-setup checklist. Explains the trial + per-aircraft price and lets
 * them add a card now (optional during the trial).
 */
export function PlanCard({ status }: { status: SubStatus }) {
  const price = formatUnitPrice(status.unitPriceCents);

  // A sponsored school gets told so plainly rather than being walked through a trial
  // countdown toward a bill that will never arrive.
  if (status.state === "free") {
    return (
      <div className="rounded-xl border bg-card p-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-success/10 text-success">
            <Gift className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="font-medium">Your plan</div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              AerScheduler is <span className="font-medium text-foreground">free for your school</span>. No card, no
              trial countdown, nothing to set up.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <PlaneTakeoff className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-medium">Your plan</div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            You're on a <span className="font-medium text-foreground">{TRIAL_DAYS}-day free trial</span>
            {status.daysLeft > 0 ? `: ${status.daysLeft} day${status.daysLeft === 1 ? "" : "s"} left` : ""}. After
            that it's <span className="font-medium text-foreground">{price}/mo per aircraft</span> (sims &amp;
            rooms free).
          </p>

          {status.planeCount === 0 ? (
            <div className="mt-3 rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
              No aircraft yet, you'll be billed{" "}
              <span className="font-medium text-foreground">{price}/mo per aircraft</span> once you add your
              fleet. Simulators &amp; rooms are free.
            </div>
          ) : (
            <PriceBreakdown status={status} />
          )}

          {status.subscribed ? (
            <p className="mt-3 flex items-center gap-1.5 text-sm text-success">
              <Check className="size-4" /> Subscription active, you're all set.
            </p>
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">
              No card needed to start, we'll remind you before your trial ends. Add one anytime from Settings → Plan.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * The arithmetic behind a school's monthly total, shown line by line.
 *
 * Every comped tail and every discount gets its own row. A sponsored school that just
 * sees "$160/mo" against a fleet of eleven has no way to tell a discount from a billing
 * bug, and the support ticket that follows costs more than the row does.
 */
export function PriceBreakdown({ status, className }: { status: SubStatus; className?: string }) {
  const price = formatUnitPrice(status.unitPriceCents);
  const grossCents = status.billableCount * status.unitPriceCents;

  return (
    <dl className={cn("mt-3 space-y-1.5 rounded-lg border bg-muted/30 p-3 text-sm", className)}>
      <div className="flex items-center justify-between">
        <dt className="text-muted-foreground">
          {status.planeCount} aircraft × {price}
        </dt>
        <dd className="tabular-nums text-muted-foreground">
          {formatMonthly(status.planeCount * status.unitPriceCents)}
        </dd>
      </div>

      {status.freeUnits > 0 && (
        <div className="flex items-center justify-between text-success">
          <dt>
            {Math.min(status.freeUnits, status.planeCount)} sponsored by AerScheduler
          </dt>
          <dd className="tabular-nums">
            -{formatMonthly(Math.min(status.freeUnits, status.planeCount) * status.unitPriceCents)}
          </dd>
        </div>
      )}

      {status.discountPercent > 0 && (
        <div className="flex items-center justify-between text-success">
          <dt>{status.discountPercent}% discount</dt>
          <dd className="tabular-nums">
            -{formatMonthly(Math.round(grossCents * (status.discountPercent / 100)))}
          </dd>
        </div>
      )}

      <div className="flex items-center justify-between border-t pt-1.5 font-medium">
        <dt>Monthly total</dt>
        <dd className="tabular-nums">{formatMonthly(status.monthlyCents)}</dd>
      </div>
    </dl>
  );
}
