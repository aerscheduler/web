import { useEffect, useState, type FormEvent } from "react";
import {
  CreditCard,
  ExternalLink,
  Loader2,
  Receipt,
  ShieldCheck,
  TriangleAlert,
  UserRoundCog,
} from "lucide-react";
import { toast } from "sonner";
import { useBilling, useConnectStripe, useUpdateBilling } from "@/features/queries";
import type { OrganizationBillingSettings } from "@/types/api";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { canManageBillingSettings } from "@/lib/permissions";
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
import { Field, PreferenceToggle } from "@/components/settings/parts";

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

  //A 200 carrying `null` is not a failure — it is every organization that has never
  //connected Stripe. The row is created on first write now (stripeAccountId became
  //optional), so rather than a dead end we render the real form seeded with the
  //server's defaults: a school can set its instructor rate and service fee on day one,
  //and the Stripe card inside the form is already the "Connect payouts" prompt.
  return <BillingForms billing={q.data ?? UNCONFIGURED_BILLING} />;
}

/** What the server would give a brand-new row. Editing and saving creates it. */
const UNCONFIGURED_BILLING: OrganizationBillingSettings = {
  id: 0,
  enabled: false,
  defaultInstructorRate: 0,
  serviceFeePercent: null,
  serviceFeeLabel: "Service Fee",
  stripeEnabled: false,
  //Null, not 0: a new school charges no overnight minimum until it says otherwise.
  overnightMinimumTenths: null,
  //Off until a school opts in — grounding somebody by surprise is worse than not grounding.
  groundUserUnpaidInvoices: null,
  //Both match the column defaults: a new school bills through admins until it says otherwise.
  dispatchersCanManuallyCreateInvoices: false,
  instructorsCanManuallyCreateInvoices: false,
};

function BillingForms({ billing }: { billing: OrganizationBillingSettings }) {
  const update = useUpdateBilling();
  const connect = useConnectStripe();

  const [enabled, setEnabled] = useState(billing.enabled);
  const [rateCents, setRateCents] = useState(billing.defaultInstructorRate);
  const [feeText, setFeeText] = useState(feeToText(billing.serviceFeePercent));
  const [feeLabel, setFeeLabel] = useState(billing.serviceFeeLabel ?? "");
  const [overnightText, setOvernightText] = useState(
    billing.overnightMinimumTenths == null ? "" : (billing.overnightMinimumTenths / 10).toFixed(1)
  );
  //Auto-grounding for money. It has worked on the server for a long time but was only
  //settable from the phone app, so a school that lives in the console could not turn it on.
  const [groundText, setGroundText] = useState(
    billing.groundUserUnpaidInvoices == null ? "" : String(billing.groundUserUnpaidInvoices)
  );

  // Hours in the UI, TENTHS on the wire. Nobody thinks in tenths, and doing the conversion
  // here keeps the one place that has to be right in one place. Blank means null, which is
  // "no minimum" rather than zero hours; the server distinguishes them.
  const nextOvernightTenths =
    overnightText.trim() === "" ? null : Math.max(0, Math.round(parseFloat(overnightText) * 10));
  // One hint, and it changes to answer the question the operator has at that moment: what
  // this setting is when it's blank, and what it will actually DO once there's a number in
  // it. A worked figure lands better than a definition, and it is the same arithmetic the
  // server does, so it cannot mislead.
  const overnightHint =
    nextOvernightTenths == null || Number.isNaN(nextOvernightTenths) || nextOvernightTenths === 0
      ? "Least billable time per night an aircraft is kept away. Blank charges nothing extra, and a booking back the same day is never affected."
      : `Out Friday and back Sunday is 2 nights, so that trip would bill at least ` +
        `${((nextOvernightTenths * 2) / 10).toFixed(1)} hours however little it flew. A booking back the same day is never affected.`;

  //Blank means OFF, and so does zero — the server treats null and 0 identically. Normalising
  //here means the field can be cleared to turn the feature off, which is what an operator
  //expects from an empty box.
  const nextGroundThreshold =
    groundText.trim() === "" || Number(groundText) === 0 ? null : Math.max(1, Math.round(Number(groundText)));

  const groundHint =
    nextGroundThreshold == null
      ? "Off. Members can book with any number of unpaid invoices."
      : `A member with ${nextGroundThreshold} or more unpaid invoice${nextGroundThreshold === 1 ? "" : "s"} is grounded ` +
        `and cannot book an aircraft until they pay. Paying releases them automatically. Ground school, simulators and rooms are never blocked.`;

  const nextBps = textToBps(feeText);
  const effectiveLabel = feeLabel.trim() || "Service Fee";
  const dirty =
    enabled !== billing.enabled ||
    rateCents !== billing.defaultInstructorRate ||
    nextBps !== billing.serviceFeePercent ||
    effectiveLabel !== (billing.serviceFeeLabel ?? "") ||
    nextOvernightTenths !== (billing.overnightMinimumTenths ?? null) ||
    nextGroundThreshold !== (billing.groundUserUnpaidInvoices ?? null);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!dirty) return;
    update.mutate(
      {
        enabled,
        defaultInstructorRate: rateCents,
        serviceFeePercent: nextBps,
        serviceFeeLabel: effectiveLabel,
        overnightMinimumTenths: Number.isNaN(nextOvernightTenths as number) ? null : nextOvernightTenths,
        groundUserUnpaidInvoices: nextGroundThreshold,
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
      <div className="flex flex-col gap-4">
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
                label="Overnight minimum"
                htmlFor="billing-overnight"
                hint={overnightHint}
              >
                <div className="relative">
                  <Input
                    id="billing-overnight"
                    inputMode="decimal"
                    value={overnightText}
                    onChange={(e) => setOvernightText(e.target.value.replace(/[^0-9.]/g, ""))}
                    placeholder="2.0"
                    className="pr-14 tnum"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    hrs/night
                  </span>
                </div>
              </Field>

              <Field
                label="Ground members with unpaid invoices"
                htmlFor="billing-ground"
                hint={groundHint}
              >
                <div className="relative">
                  <Input
                    id="billing-ground"
                    inputMode="numeric"
                    value={groundText}
                    onChange={(e) => setGroundText(e.target.value.replace(/[^0-9]/g, ""))}
                    placeholder="Off"
                    className="pr-20 tnum"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    invoices
                  </span>
                </div>
              </Field>

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

        <ManualInvoiceCard billing={billing} />
      </div>

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

/** The two grants below, which are the only fields this card writes. */
type ManualInvoiceField =
  | "dispatchersCanManuallyCreateInvoices"
  | "instructorsCanManuallyCreateInvoices";

/**
 * Who besides owners and admins may raise an invoice by hand.
 *
 * Live toggles rather than fields on the billing form above, and that is deliberate: these
 * are permission grants, so the school wants the answer to "is it on?" to be what the screen
 * shows, not what an unsaved form is holding. Same PreferenceToggle contract as booking
 * preferences, per-toggle spinner and all.
 *
 * Both are real server permissions, not UI hints. `validateCustomInvoiceValues` reads them on
 * every `POST /invoices`, so a dispatcher whose grant is off is refused by the API even if
 * some client offered them the button. Writing them is owner-only (`PATCH
 * /organizations/billing` is `isOrgOwner`), which is why a non-owner admin gets a read-only
 * view here instead of a switch that could only 403.
 */
function ManualInvoiceCard({ billing }: { billing: OrganizationBillingSettings }) {
  const { roles } = useAuth();
  const update = useUpdateBilling();
  const canEdit = canManageBillingSettings(roles);

  // Local mirror so each switch flips instantly, reconciled from the refetched settings.
  const [dispatchers, setDispatchers] = useState(billing.dispatchersCanManuallyCreateInvoices);
  const [instructors, setInstructors] = useState(billing.instructorsCanManuallyCreateInvoices);
  const [pending, setPending] = useState<ManualInvoiceField | null>(null);

  useEffect(() => {
    setDispatchers(billing.dispatchersCanManuallyCreateInvoices);
    setInstructors(billing.instructorsCanManuallyCreateInvoices);
  }, [
    billing.dispatchersCanManuallyCreateInvoices,
    billing.instructorsCanManuallyCreateInvoices,
  ]);

  function saveGrant(field: ManualInvoiceField, value: boolean, apply: (v: boolean) => void) {
    const previous = field === "dispatchersCanManuallyCreateInvoices" ? dispatchers : instructors;
    apply(value);
    setPending(field);
    // A PATCH carrying only this key. The server leaves every other billing field alone when
    // its key is absent, so one toggle cannot quietly rewrite the rate or the service fee.
    const patch =
      field === "dispatchersCanManuallyCreateInvoices"
        ? { dispatchersCanManuallyCreateInvoices: value }
        : { instructorsCanManuallyCreateInvoices: value };
    update.mutate(patch, {
      onSuccess: () => toast.success(value ? "Permission granted" : "Permission removed"),
      onError: (err) => {
        apply(previous);
        toast.error(err instanceof ApiError ? err.message : "Couldn't save that permission");
      },
      onSettled: () => setPending(null),
    });
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2.5">
        <span className="grid size-8 place-items-center rounded-md bg-primary/10 text-primary">
          <UserRoundCog className="size-4" />
        </span>
        <div>
          <CardTitle>Manual invoices</CardTitle>
          <CardDescription>
            {canEdit
              ? "Who can bill outside a reservation. Owners and admins always can."
              : "Only the organization owner can change these. Owners and admins always can bill outside a reservation."}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="divide-y divide-border">
        <PreferenceToggle
          label="Dispatchers can manually generate invoices"
          description={
            <>
              <p>
                Let a dispatcher raise a one-off invoice that no reservation created, for fuel,
                a hangar night, or supplies. Turning it off leaves invoices they already sent
                exactly as they are.
              </p>
              {!billing.stripeEnabled && <StripeNeeded />}
            </>
          }
          checked={dispatchers}
          disabled={!canEdit || pending !== null}
          saving={pending === "dispatchersCanManuallyCreateInvoices"}
          onCheckedChange={(v) =>
            saveGrant("dispatchersCanManuallyCreateInvoices", v, setDispatchers)
          }
        />
        <PreferenceToggle
          label="Instructors can manually generate invoices"
          description="The same for instructors, so a CFI can bill for ground instruction or a checkride fee without waiting on an admin. Independent of the dispatcher grant, not a step above it."
          checked={instructors}
          disabled={!canEdit || pending !== null}
          saving={pending === "instructorsCanManuallyCreateInvoices"}
          onCheckedChange={(v) =>
            saveGrant("instructorsCanManuallyCreateInvoices", v, setInstructors)
          }
        />
      </CardContent>
    </Card>
  );
}

/**
 * Said once, under the first toggle. The grant saves and holds either way, but no invoice of
 * any kind can be raised until Stripe is connected, so a school that turns this on with no
 * payouts account would otherwise be waiting on a button that keeps failing.
 */
function StripeNeeded() {
  return (
    <p className="mt-1.5 flex gap-1.5 text-amber-700 dark:text-amber-500">
      <TriangleAlert className="mt-px size-3.5 shrink-0" />
      <span>Connect Stripe before anyone can send an invoice.</span>
    </p>
  );
}
