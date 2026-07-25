import { BadgeDollarSign, Check } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { PRICE_PER_AIRCRAFT_CENTS, TRIAL_DAYS, formatMonthly, type SubStatus } from "@/lib/subscription";
import { SubscribeButton, useSubStatus } from "@/components/subscription/plan";
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

function shortDate(d: Date): string {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function StatePill({ status }: { status: SubStatus }) {
  switch (status.state) {
    case "active":
      return (
        <Badge variant="success">
          <Check className="size-3" /> Active
        </Badge>
      );
    case "exempt":
      return <Badge variant="outline">Legacy plan</Badge>;
    case "trial":
      return <Badge variant="outline">Trial — {status.daysLeft}d left</Badge>;
    case "grace":
      return <Badge variant="outline">Starts {shortDate(status.freeUntil)}</Badge>;
    case "expired":
      return <Badge variant="outline">Paused</Badge>;
  }
}

function stateNote(status: SubStatus): string {
  switch (status.state) {
    case "exempt":
      return "You're on your existing plan (billed through Stripe Connect). The new per-aircraft pricing doesn't apply to your account.";
    case "active":
      return "Your subscription is active. Aircraft are billed monthly; add or remove tails anytime.";
    case "trial":
      return `You won't be charged until ${shortDate(status.freeUntil)} — ${status.daysLeft} day${status.daysLeft === 1 ? "" : "s"} left in your ${TRIAL_DAYS}-day free trial.`;
    case "grace":
      return `AerScheduler is moving to per-aircraft pricing. Billing for your fleet starts ${shortDate(status.freeUntil)}. Add a card now to stay active — simulators and rooms remain free.`;
    case "expired":
      return "Your access is paused. Subscribe to restore full access.";
  }
}

export function PlanTab() {
  const { organization } = useAuth();
  const status = useSubStatus();
  const perPlane = PRICE_PER_AIRCRAFT_CENTS / 100;

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

  return (
    <Card className="max-w-2xl">
      <CardHeader className="flex-row items-center gap-2.5">
        <span className="grid size-8 place-items-center rounded-md bg-primary/10 text-primary">
          <BadgeDollarSign className="size-4" />
        </span>
        <div>
          <CardTitle>Your plan</CardTitle>
          <CardDescription>
            ${perPlane}/mo per aircraft. Simulators and ground-school rooms are free.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Status</span>
          <StatePill status={status} />
        </div>

        {status.state === "exempt" ? null : status.planeCount === 0 ? (
          <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
            No aircraft yet — you'll be billed{" "}
            <span className="font-medium text-foreground">${perPlane}/mo per aircraft</span> once you add your fleet.
            Simulators and rooms are free.
          </div>
        ) : (
          <dl className="space-y-1.5 rounded-lg border bg-muted/30 p-3 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">
                {status.planeCount} aircraft × ${perPlane}
              </dt>
              <dd className="tabular-nums">{formatMonthly(status.monthlyCents)}</dd>
            </div>
            <div className="flex items-center justify-between border-t pt-1.5 font-medium">
              <dt>Monthly total</dt>
              <dd className="tabular-nums">{formatMonthly(status.monthlyCents)}</dd>
            </div>
          </dl>
        )}

        <p className="text-sm text-muted-foreground">{stateNote(status)}</p>
      </CardContent>
      <CardFooter className="justify-end">
        {status.state === "exempt" ? (
          <span className="text-sm text-muted-foreground">Managed under your legacy plan.</span>
        ) : status.subscribed ? (
          <span className="flex items-center gap-1.5 text-sm text-success">
            <Check className="size-4" /> Subscription active
          </span>
        ) : (
          <SubscribeButton label={status.state === "grace" ? "Add a card" : "Subscribe"} />
        )}
      </CardFooter>
    </Card>
  );
}
