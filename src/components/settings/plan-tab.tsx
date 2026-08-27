import { BadgeDollarSign, Check, Gift } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { TRIAL_DAYS, formatFreeUntil, formatUnitPrice, type SubStatus } from "@/lib/subscription";
import { PriceBreakdown, SubscribeButton, useSubStatus } from "@/components/subscription/plan";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

/** Formatted in UTC, see formatFreeUntil: a free-until is a calendar date somebody
 *  typed, not an instant, and rendering it locally shifts it by a day. */
const shortDate = (d: Date | null): string => formatFreeUntil(d, { year: true });

function StatePill({ status }: { status: SubStatus }) {
  switch (status.state) {
    case "active":
      return (
        <Badge variant="success">
          <Check className="size-3" /> Active
        </Badge>
      );
    case "free":
      return (
        <Badge variant="success">
          <Gift className="size-3" /> Sponsored
        </Badge>
      );
    case "legacy":
      return <Badge variant="outline">Legacy plan</Badge>;
    case "trial":
      return <Badge variant="outline">Trial, {status.daysLeft}d left</Badge>;
    case "grace":
      return <Badge variant="outline">Starts {status.freeUntil ? shortDate(status.freeUntil) : "soon"}</Badge>;
    case "courtesy":
      return <Badge variant="outline">Free through {status.freeUntil ? shortDate(status.freeUntil) : "soon"}</Badge>;
    case "expired":
      // Expired does not always mean cut off: a school with no aircraft owes nothing
      // and keeps working, and telling them their access is paused would be a lie.
      return <Badge variant="outline">{status.blocked ? "Paused" : "Trial ended"}</Badge>;
  }
}

function stateNote(status: SubStatus): string {
  const until = status.freeUntil ? shortDate(status.freeUntil) : "soon";
  const days = `${status.daysLeft} day${status.daysLeft === 1 ? "" : "s"}`;
  const price = formatUnitPrice(status.unitPriceCents);

  switch (status.state) {
    case "free":
      return "AerScheduler is free for your school. There's nothing to pay and nothing to set up.";
    case "legacy":
      return "You're on your existing plan (billed through Stripe Connect). The new per-aircraft pricing doesn't apply to your account.";
    case "active":
      return "Your subscription is active. Aircraft are billed monthly; add or remove tails anytime.";
    case "trial":
      return `You won't be charged until ${until}: ${days} left in your ${TRIAL_DAYS}-day free trial.`;
    case "grace":
      return `AerScheduler is moving to per-aircraft pricing. Billing for your fleet starts ${until}. Add a card now to stay active, simulators and rooms remain free.`;
    case "courtesy":
      return `We've extended your free access through ${until} (${days}). Add a card before then to stay active.`;
    case "expired":
      return status.blocked
        ? "Your access is paused. Subscribe to restore full access."
        : `Your free trial has ended. You'll be billed ${price}/mo per aircraft once you add your first one.`;
  }
}

export function PlanTab() {
  const { organization } = useAuth();
  const status = useSubStatus();

  if (!organization || !status) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Your plan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  const price = formatUnitPrice(status.unitPriceCents);

  // A sponsored school. Said plainly and warmly, with no pricing table and no CTA,
  // because there is nothing for them to do.
  if (status.state === "free") {
    return (
      <Card className="max-w-2xl">
        <CardHeader className="flex-row items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-md bg-success/10 text-success">
            <Gift className="size-4" />
          </span>
          <div>
            <CardTitle>Your plan</CardTitle>
            <CardDescription>AerScheduler is free for your school.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Status</span>
            <StatePill status={status} />
          </div>
          <p className="text-sm text-muted-foreground">
            {status.planeCount > 0
              ? `All ${status.planeCount} of your aircraft are covered. `
              : ""}
            There's nothing to pay and no card on file. Reach out to support if anything about your billing
            needs to change.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Grandfathered orgs: neutral card, NO per-aircraft pricing shown, they stay on
  // their legacy plan and shouldn't learn about the price change here.
  if (status.state === "legacy") {
    return (
      <Card className="max-w-2xl">
        <CardHeader className="flex-row items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-md bg-primary/10 text-primary">
            <BadgeDollarSign className="size-4" />
          </span>
          <div>
            <CardTitle>Your plan</CardTitle>
            <CardDescription>You're on your current AerScheduler plan.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Your account is on a plan managed by AerScheduler. Reach out to support if you'd like to make
            any changes to your billing.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader className="flex-row items-center gap-2.5">
        <span className="grid size-8 place-items-center rounded-md bg-primary/10 text-primary">
          <BadgeDollarSign className="size-4" />
        </span>
        <div>
          <CardTitle>Your plan</CardTitle>
          <CardDescription>
            {price}/mo per aircraft. Simulators and ground-school rooms are free.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Status</span>
          <StatePill status={status} />
        </div>

        {status.planeCount === 0 ? (
          <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
            No aircraft yet, you'll be billed{" "}
            <span className="font-medium text-foreground">{price}/mo per aircraft</span> once you add your fleet.
            Simulators and rooms are free.
          </div>
        ) : (
          <PriceBreakdown status={status} className="mt-0" />
        )}

        <p className="text-sm text-muted-foreground">{stateNote(status)}</p>

        {/* Say when a discount runs out, on the page where they will look for it.
            A bill that jumps with no warning is a support ticket and a bad surprise. */}
        {status.sponsored && status.discountPercent === 0 && status.freeUnits > 0 && (
          <p className="text-xs text-muted-foreground">
            {status.freeUnits} aircraft {status.freeUnits === 1 ? "is" : "are"} sponsored by AerScheduler.
          </p>
        )}
      </CardContent>
      <CardFooter className="justify-end">
        {status.subscribed ? (
          <span className="flex items-center gap-1.5 text-sm text-success">
            <Check className="size-4" /> Subscription active
          </span>
        ) : status.monthlyCents === 0 ? (
          // Nothing to sell. A fully sponsored fleet has no checkout to start, and the
          // server refuses one, so offering the button would be a dead end.
          <span className="text-sm text-muted-foreground">Nothing due.</span>
        ) : (
          <SubscribeButton label={status.state === "trial" ? "Subscribe" : "Add a card"} />
        )}
      </CardFooter>
    </Card>
  );
}
