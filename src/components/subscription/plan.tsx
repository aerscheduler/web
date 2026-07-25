import * as React from "react";
import { PlaneTakeoff, Check, ExternalLink, Info, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { useBilling, usePlanes, useSubscription, useSubscriptionCheckout } from "@/features/queries";
import {
  PRICE_PER_AIRCRAFT_CENTS,
  TRIAL_DAYS,
  formatMonthly,
  subscriptionStatus,
  type SubState,
  type SubStatus,
} from "@/lib/subscription";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** Read a preview override from the URL (?sub=trial|grace|expired|active) so we
 *  can see each billing state without waiting 14 days. Harmless in prod. */
function overrideState(): SubState | null {
  if (typeof window === "undefined") return null;
  const v = new URLSearchParams(window.location.search).get("sub");
  return v === "trial" || v === "grace" || v === "expired" || v === "active" || v === "exempt" ? v : null;
}

/**
 * Live subscription status for the active org. Re-reads on the "aer:sub" event
 * (fired when the local subscribed flag changes) so the gate/banner update
 * without a reload.
 */
export function useSubStatus(): SubStatus | null {
  const { organization } = useAuth();
  const planes = usePlanes({ enabled: !!organization });
  // Whether the org bills through Stripe Connect — existing Connect users are
  // grandfathered off the per-aircraft model.
  const billing = useBilling({ enabled: !!organization });
  // Real subscription status from Stripe (the source of truth).
  const sub = useSubscription({ enabled: !!organization });

  return React.useMemo(() => {
    if (!organization) return null;
    const s = sub.data;
    const serverSubscribed = Boolean(
      s?.hasSubscription && (s.status === "trialing" || s.status === "active")
    );
    const base = subscriptionStatus(organization, planes.data?.length ?? 0, {
      connectEnabled: Boolean(billing.data?.stripeEnabled),
      subscribed: serverSubscribed,
    });
    const ov = overrideState();
    return ov ? { ...base, state: ov, blocked: ov === "expired" } : base;
  }, [organization, planes.data, billing.data, sub.data]);
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
      else toast.error("Couldn't start checkout — please try again.");
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

/** One-line reminder of the per-aircraft price, for the add-aircraft surfaces. */
export function PerPlanePricingNote({ className }: { className?: string }) {
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
        </TooltipContent>
      </Tooltip>
      <span>
        <span className="font-medium text-foreground">
          ${PRICE_PER_AIRCRAFT_CENTS / 100}/mo per aircraft
        </span>{" "}
        after your trial. Simulators &amp; rooms are free.
      </span>
    </p>
  );
}

/**
 * The onboarding "your plan" card — replaces the old Stripe Connect card in the
 * school Finish-setup checklist. Explains the trial + per-aircraft price and lets
 * them add a card now (optional during the trial).
 */
export function PlanCard({ status }: { status: SubStatus }) {
  const perPlane = PRICE_PER_AIRCRAFT_CENTS / 100;
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
            {status.daysLeft > 0 ? ` — ${status.daysLeft} day${status.daysLeft === 1 ? "" : "s"} left` : ""}. After
            that it's <span className="font-medium text-foreground">${perPlane}/mo per aircraft</span> (sims &amp;
            rooms free).
          </p>

          {status.planeCount === 0 ? (
            <div className="mt-3 rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
              No aircraft yet — you'll be billed{" "}
              <span className="font-medium text-foreground">${perPlane}/mo per aircraft</span> once you add your
              fleet. Simulators &amp; rooms are free.
            </div>
          ) : (
            <div className="mt-3 flex items-center justify-between rounded-lg border bg-muted/30 p-3 text-sm">
              <span className="text-muted-foreground">
                {status.planeCount} aircraft × ${perPlane}/mo
              </span>
              <span className="font-medium tabular-nums">{formatMonthly(status.monthlyCents)}</span>
            </div>
          )}

          {status.subscribed ? (
            <p className="mt-3 flex items-center gap-1.5 text-sm text-success">
              <Check className="size-4" /> Subscription active — you're all set.
            </p>
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">
              No card needed to start — we'll remind you before your trial ends. Add one anytime from Settings → Plan.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
