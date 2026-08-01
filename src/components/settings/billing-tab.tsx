import { useState, type FormEvent } from "react";
import {
  CreditCard,
  ExternalLink,
  Loader2,
  Receipt,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { useBilling, useConnectStripe, useUpdateBilling } from "@/features/queries";
import type { OrganizationBillingSettings } from "@/types/api";
import { ApiError } from "@/lib/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/states";
import { MoneyInput } from "@/components/money-input";
import { Field } from "@/components/settings/parts";

/** serviceFeePercent is stored as hundredths of a percent (500 = 5%, 50 = 0.5%). */
function feeToText(bps: number | null): string {
  if (bps == null) return "";
  return String(bps / 100);
}
function textToBps(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const pct = parseFloat(trimmed);
  if (Number.isNaN(pct)) return null;
  return Math.round(pct * 100);
}

export function BillingTab() {
  const q = useBilling();

  if (q.isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Billing</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-2/3" />
        </CardContent>
      </Card>
    );
  }
  if (q.isError) {
    return (
      <Card>
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      </Card>
    );
  }

  // A 200 carrying `null` is not a failure — it is every organization that has never
  // connected Stripe. The billing settings row is created lazily, by the Connect
  // handshake (`StripeService.createStripeAccountAndReturnLinkUrlForOrg`), so a school
  // that has not reached that point has no row to show. Treating that as an error told
  // brand-new schools "something went wrong" on the very page they were sent to.
  if (!q.data) return <BillingNotSetUp />;

  return <BillingForms billing={q.data} />;
}

/** Before Connect: there are no settings to edit yet, only one thing to do. */
function BillingNotSetUp() {
  const connect = useConnectStripe();

  async function handleConnect() {
    try {
      const { url } = await connect.mutateAsync();
      if (!url) throw new Error("No onboarding URL returned");
      window.location.assign(url);
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Couldn't start Stripe onboarding"
      );
    }
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader className="flex-row items-center gap-2.5">
        <span className="grid size-8 place-items-center rounded-md bg-primary/10 text-primary">
          <CreditCard className="size-4" />
        </span>
        <div>
          <CardTitle>Set up billing</CardTitle>
          <CardDescription>
            Connect Stripe to invoice your members and take card or ACH payments.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="space-y-2 text-sm text-muted-foreground">
          {[
            "Invoices drafted from Hobbs or tach when a flight is closed out",
            "Card and ACH payments, with autopay if members want it",
            "QuickBooks sync, so your books close without re-keying",
            "Payouts go straight to your own bank account",
          ].map((t) => (
            <li key={t} className="flex items-start gap-2.5">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
              {t}
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">
          Rates, service fees and invoicing options appear here once Stripe is connected.
        </p>
      </CardContent>
      <CardFooter>
        <Button onClick={handleConnect} disabled={connect.isPending}>
          {connect.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <ExternalLink className="size-4" />
          )}
          Connect Stripe
        </Button>
      </CardFooter>
    </Card>
  );
}

function BillingForms({ billing }: { billing: OrganizationBillingSettings }) {
  const update = useUpdateBilling();
  const connect = useConnectStripe();

  const [enabled, setEnabled] = useState(billing.enabled);
  const [rateCents, setRateCents] = useState(billing.defaultInstructorRate);
  const [feeText, setFeeText] = useState(feeToText(billing.serviceFeePercent));
  const [feeLabel, setFeeLabel] = useState(billing.serviceFeeLabel ?? "");

  const nextBps = textToBps(feeText);
  const effectiveLabel = feeLabel.trim() || "Service Fee";
  const dirty =
    enabled !== billing.enabled ||
    rateCents !== billing.defaultInstructorRate ||
    nextBps !== billing.serviceFeePercent ||
    effectiveLabel !== (billing.serviceFeeLabel ?? "");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!dirty) return;
    update.mutate(
      {
        enabled,
        defaultInstructorRate: rateCents,
        serviceFeePercent: nextBps,
        serviceFeeLabel: effectiveLabel,
      },
      {
        onSuccess: () => toast.success("Billing settings saved"),
        onError: (err) =>
          toast.error(err instanceof ApiError ? err.message : "Couldn't save billing"),
      }
    );
  }

  async function handleConnect() {
    try {
      const { url } = await connect.mutateAsync();
      if (!url) throw new Error("No onboarding URL returned");
      window.location.assign(url);
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Couldn't start Stripe onboarding"
      );
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
      <Card>
        <form onSubmit={handleSubmit}>
          <CardHeader className="flex-row items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-md bg-primary/10 text-primary">
              <CreditCard className="size-4" />
            </span>
            <div>
              <CardTitle>Billing settings</CardTitle>
              <CardDescription>
                Control invoicing, instructor rates, and service fees.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/30 p-3">
              <div className="min-w-0">
                <Label htmlFor="billing-enabled" className="text-sm">
                  Billing enabled
                </Label>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Generate invoices for reservations and flight time.
                </p>
              </div>
              <Switch
                id="billing-enabled"
                checked={enabled}
                onCheckedChange={setEnabled}
                aria-label="Billing enabled"
              />
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field
                label="Default instructor rate"
                htmlFor="billing-rate"
                hint="Applied per hour when no rating-specific rate is set."
              >
                <MoneyInput
                  id="billing-rate"
                  cents={rateCents}
                  onCentsChange={setRateCents}
                />
              </Field>
              <Field
                label="Service fee"
                htmlFor="billing-fee"
                hint="Percentage added to each invoice."
              >
                <div className="relative">
                  <Input
                    id="billing-fee"
                    inputMode="decimal"
                    value={feeText}
                    onChange={(e) =>
                      setFeeText(e.target.value.replace(/[^0-9.]/g, ""))
                    }
                    placeholder="0.5"
                    className="pr-7 tnum"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    %
                  </span>
                </div>
              </Field>
            </div>

            <Field
              label="Service fee label"
              htmlFor="billing-fee-label"
              hint="Shown as the fee's line item on invoices."
            >
              <Input
                id="billing-fee-label"
                value={feeLabel}
                onChange={(e) => setFeeLabel(e.target.value)}
                placeholder="Service Fee"
              />
            </Field>
          </CardContent>
          <CardFooter className="justify-end gap-2">
            <Button type="submit" disabled={!dirty || update.isPending}>
              {update.isPending && <Loader2 className="size-4 animate-spin" />}
              Save changes
            </Button>
          </CardFooter>
        </form>
      </Card>

      <Card className="h-fit">
        <CardHeader className="flex-row items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-md bg-primary/10 text-primary">
            <Receipt className="size-4" />
          </span>
          <div>
            <CardTitle>Payouts</CardTitle>
            <CardDescription>Collect payments through Stripe.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground">Status</span>
            {billing.stripeEnabled ? (
              <Badge variant="success">
                <ShieldCheck className="size-3" /> Connected
              </Badge>
            ) : (
              <Badge variant="outline">Not connected</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {billing.stripeEnabled
              ? "Your Stripe account is active. You can review or update payout details anytime."
              : "Connect a Stripe account to accept card payments and receive payouts."}
          </p>
          <Button
            type="button"
            variant={billing.stripeEnabled ? "outline" : "default"}
            className="w-full"
            onClick={handleConnect}
            disabled={connect.isPending}
          >
            {connect.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ExternalLink className="size-4" />
            )}
            {billing.stripeEnabled ? "Manage payouts" : "Connect payouts"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
