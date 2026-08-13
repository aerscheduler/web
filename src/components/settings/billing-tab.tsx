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
import { useBilling, useConnectStripe, useUpdateBilling, useOrgLedgerSettings, useUpdateOrgLedgerSettings } from "@/features/queries";
import type { OrganizationBillingSettings } from "@/types/api";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { canManageBillingSettings } from "@/lib/permissions";
import {
  BillingModeCards,
  type BillingMode,
} from "@/components/billing/billing-mode-choice";
import { DocsHint } from "@/components/docs-hint";
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
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  const ledgerQ = useOrgLedgerSettings();

  if (q.isLoading || ledgerQ.isLoading) {
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

  //A 200 carrying `null` is not a failure, it is every organization that has never
  //connected Stripe. The row is created on first write now (stripeAccountId became
  //optional), so rather than a dead end we render the real form seeded with the
  //server's defaults: a school can set its instructor rate and service fee on day one,
  //and the Stripe card inside the form is already the "Connect payouts" prompt.
  const billing = q.data ?? UNCONFIGURED_BILLING;
  const ledgerMode = ledgerQ.data?.enabled === true ? "ledger" : "invoice";
  return (
    <BillingPage
      billing={billing}
      ledgerMode={ledgerMode}
      topUpPercent={ledgerQ.data?.topUpCardFeePercent ?? null}
      topUpFlatCents={ledgerQ.data?.topUpCardFeeFlatCents ?? null}
      loadError={ledgerQ.isError ? ledgerQ.error : null}
      onRetry={() => void ledgerQ.refetch()}
    />
  );
}

/** Holds the live Billing enabled flag so rates/fees unlock as soon as the switch flips. */
function BillingPage({
  billing,
  ledgerMode,
  topUpPercent,
  topUpFlatCents,
  loadError,
  onRetry,
}: {
  billing: OrganizationBillingSettings;
  ledgerMode: BillingMode;
  topUpPercent: number | null;
  topUpFlatCents: number | null;
  loadError: unknown;
  onRetry: () => void;
}) {
  const [billingOn, setBillingOn] = useState(billing.enabled);
  useEffect(() => {
    setBillingOn(billing.enabled);
  }, [billing.enabled]);

  return (
    <div className="space-y-4">
      <BillingConnectCard
        billing={billing}
        billingOn={billingOn}
        onBillingOnChange={setBillingOn}
      />
      <BillingModePicker mode={ledgerMode} loadError={loadError} onRetry={onRetry} />
      {ledgerMode === "ledger" && (
        <TopUpCardFeeCard percent={topUpPercent} flatCents={topUpFlatCents} />
      )}
      <BillingForms billing={billing} />
    </div>
  );
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
  //Null means no grace, the return-at-midnight rule bites exactly as it always has.
  overnightGraceMinutes: null,
  //Off until a school opts in, grounding somebody by surprise is worse than not grounding.
  groundUserUnpaidInvoices: null,
  //Both match the column defaults: a new school bills through admins until it says otherwise.
  dispatchersCanManuallyCreateInvoices: false,
  instructorsCanManuallyCreateInvoices: false,
};

function BillingForms({ billing }: { billing: OrganizationBillingSettings }) {
  const { roles } = useAuth();
  const update = useUpdateBilling();
  const canEdit = canManageBillingSettings(roles);

  const [rateCents, setRateCents] = useState(billing.defaultInstructorRate);
  const [feeText, setFeeText] = useState(feeToText(billing.serviceFeePercent));
  const [feeLabel, setFeeLabel] = useState(billing.serviceFeeLabel ?? "");
  const [overnightText, setOvernightText] = useState(
    billing.overnightMinimumTenths == null ? "" : (billing.overnightMinimumTenths / 10).toFixed(1)
  );
  const [graceText, setGraceText] = useState(
    billing.overnightGraceMinutes == null ? "" : String(billing.overnightGraceMinutes)
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

  // Blank means no grace, exactly like the fields above. A flight back a few minutes after
  // midnight would otherwise count as a whole extra night away.
  const nextGraceMinutes =
    graceText.trim() === "" ? null : Math.max(0, Math.round(parseFloat(graceText)));
  const graceHint =
    nextGraceMinutes == null || Number.isNaN(nextGraceMinutes) || nextGraceMinutes === 0
      ? "Off. Landing even one minute after midnight counts as another night away."
      : `Landing up to ${nextGraceMinutes} minutes after midnight still counts as the same night, not another one.`;

  //Blank means OFF, and so does zero, the server treats null and 0 identically. Normalising
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
    rateCents !== billing.defaultInstructorRate ||
    nextBps !== billing.serviceFeePercent ||
    effectiveLabel !== (billing.serviceFeeLabel ?? "") ||
    nextOvernightTenths !== (billing.overnightMinimumTenths ?? null) ||
    nextGraceMinutes !== (billing.overnightGraceMinutes ?? null) ||
    nextGroundThreshold !== (billing.groundUserUnpaidInvoices ?? null);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!dirty || !canEdit) return;
    update.mutate(
      {
        defaultInstructorRate: rateCents,
        serviceFeePercent: nextBps,
        serviceFeeLabel: effectiveLabel,
        overnightMinimumTenths: Number.isNaN(nextOvernightTenths as number) ? null : nextOvernightTenths,
        overnightGraceMinutes: Number.isNaN(nextGraceMinutes as number) ? null : nextGraceMinutes,
        groundUserUnpaidInvoices: nextGroundThreshold,
      },
      {
        onSuccess: () => toast.success("Billing settings saved"),
        onError: (err) =>
          toast.error(err instanceof ApiError ? err.message : "Couldn't save billing"),
      }
    );
  }

  return (
    <div className="space-y-4">
        <Card data-doc-shot="billing-settings-card">
          <form onSubmit={handleSubmit}>
            <CardHeader className="flex-row items-center gap-2.5">
              <span className="grid size-8 place-items-center rounded-md bg-primary/10 text-primary">
                <CreditCard className="size-4" />
              </span>
              <div>
                <CardTitle>Rates and fees</CardTitle>
                <CardDescription>
                  Instructor rates, service fees, overnight minimums, and unpaid-invoice grounding.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <fieldset disabled={!canEdit} className="space-y-5 disabled:opacity-60">
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
                  docs="service-fee"
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
                docs="overnight-minimum"
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
                label="Return grace after midnight"
                htmlFor="billing-overnight-grace"
                hint={graceHint}
              >
                <div className="relative">
                  <Input
                    id="billing-overnight-grace"
                    inputMode="numeric"
                    value={graceText}
                    onChange={(e) => setGraceText(e.target.value.replace(/[^0-9]/g, ""))}
                    placeholder="Off"
                    className="pr-16 tnum"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    minutes
                  </span>
                </div>
              </Field>

              <Field
                label="Ground members with unpaid invoices"
                htmlFor="billing-ground"
                hint={groundHint}
                docs="unpaid-invoice-grounding"
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
              </fieldset>
            </CardContent>
            <CardFooter className="justify-end gap-2">
              <Button type="submit" disabled={!canEdit || !dirty || update.isPending}>
                {update.isPending && <Loader2 className="size-4 animate-spin" />}
                Save changes
              </Button>
            </CardFooter>
          </form>
        </Card>

        <ManualInvoiceCard billing={billing} />
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

/**
 * Optional school card surcharge on member Add funds. Cash/check desk credit
 * stays 1:1. Separate from AerScheduler's legacy 0.5% Connect application fee.
 */
function TopUpCardFeeCard({
  percent,
  flatCents,
}: {
  percent: number | null;
  flatCents: number | null;
}) {
  const { roles } = useAuth();
  const update = useUpdateOrgLedgerSettings();
  const canEdit = canManageBillingSettings(roles);
  const [feeText, setFeeText] = useState(feeToText(percent));
  const [flatText, setFlatText] = useState(
    flatCents == null || flatCents === 0 ? "" : (flatCents / 100).toFixed(2)
  );

  useEffect(() => {
    setFeeText(feeToText(percent));
    setFlatText(flatCents == null || flatCents === 0 ? "" : (flatCents / 100).toFixed(2));
  }, [percent, flatCents]);

  const parsedPct = parseTopUpFeePercent(feeText);
  const parsedFlat = parseTopUpFeeFlatDollars(flatText);
  const nextPct = parsedPct.ok ? parsedPct.value : null;
  const nextFlat = parsedFlat.ok ? parsedFlat.value : null;
  const savedFlat = flatCents == null || flatCents === 0 ? null : flatCents;
  const dirty =
    parsedPct.ok &&
    parsedFlat.ok &&
    (nextPct !== (percent ?? null) || nextFlat !== savedFlat);

  const previewCredit = 10_000;
  const previewFee =
    parsedPct.ok && parsedFlat.ok
      ? Math.floor((previewCredit * (nextPct ?? 0)) / 10_000) + (nextFlat ?? 0)
      : 0;
  const previewCharge = previewCredit + previewFee;
  const hasFee = (nextPct ?? 0) > 0 || (nextFlat ?? 0) > 0;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canEdit || !dirty) return;
    if (!parsedPct.ok) {
      toast.error(parsedPct.error);
      return;
    }
    if (!parsedFlat.ok) {
      toast.error(parsedFlat.error);
      return;
    }
    update.mutate(
      {
        topUpCardFeePercent: parsedPct.value,
        topUpCardFeeFlatCents: parsedFlat.value,
      },
      {
        onSuccess: () => toast.success("Card top-up fee saved"),
        onError: (err) =>
          toast.error(err instanceof ApiError ? err.message : "Couldn't save card fee"),
      }
    );
  }

  return (
    <Card data-doc-shot="ledger-topup-card-fee">
      <CardHeader className="flex-row items-start gap-2.5">
        <span className="grid size-8 place-items-center rounded-md bg-primary/10 text-primary">
          <CreditCard className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <CardTitle className="inline-flex items-center gap-1.5">
            Card fee on account top-ups
            <DocsHint topic="ledger-topup-card-fee" />
          </CardTitle>
          <CardDescription>
            Recover Stripe processing when members add funds by card. Desk cash and check
            credit stay dollar-for-dollar. Leave blank if the school absorbs card fees.
          </CardDescription>
        </div>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Percent"
              htmlFor="ledger-topup-fee-pct"
              hint="e.g. 2.9 for 2.9%. Blank or 0.0 = no percent fee. Max 100."
            >
              <div className="relative">
                <Input
                  id="ledger-topup-fee-pct"
                  inputMode="decimal"
                  step="0.01"
                  value={feeText}
                  disabled={!canEdit || update.isPending}
                  onChange={(e) => setFeeText(e.target.value)}
                  placeholder="0.0"
                  className="pr-7 tnum"
                  aria-invalid={!parsedPct.ok}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  %
                </span>
              </div>
            </Field>
            <Field
              label="Plus flat"
              htmlFor="ledger-topup-fee-flat"
              hint="e.g. 0.30 per top-up. Blank or 0.00 = none. Max $100.00."
            >
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  $
                </span>
                <Input
                  id="ledger-topup-fee-flat"
                  inputMode="decimal"
                  step="0.01"
                  value={flatText}
                  disabled={!canEdit || update.isPending}
                  onChange={(e) => setFlatText(e.target.value)}
                  placeholder="0.00"
                  className="pl-7 tnum"
                  aria-invalid={!parsedFlat.ok}
                />
              </div>
            </Field>
          </div>
          <p className="text-xs text-muted-foreground">
            {hasFee && parsedPct.ok && parsedFlat.ok
              ? `Example: pay $${(previewCharge / 100).toFixed(2)} → $${(previewCredit / 100).toFixed(2)} credited on a $100 top-up.`
              : "No surcharge. Members are charged exactly what they credit."}
          </p>
          {!canEdit && (
            <p className="text-xs text-muted-foreground">Only the organization owner can change this.</p>
          )}
        </CardContent>
        {canEdit && (
          <CardFooter className="justify-end">
            <Button type="submit" disabled={!dirty || update.isPending}>
              {update.isPending && <Loader2 className="size-4 animate-spin" />}
              Save card fee
            </Button>
          </CardFooter>
        )}
      </form>
    </Card>
  );
}

/** Blank/0 → null. Rejects negatives, >100%, and junk like "2.9abc". */
function parseTopUpFeePercent(
  text: string
): { ok: true; value: number | null } | { ok: false; error: string } {
  const trimmed = text.trim();
  if (trimmed === "") return { ok: true, value: null };
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    return { ok: false, error: "Percent must be a number like 2.9" };
  }
  const pct = Number(trimmed);
  if (!Number.isFinite(pct) || pct < 0) {
    return { ok: false, error: "Percent can't be negative" };
  }
  if (pct > 100) {
    return { ok: false, error: "Percent can't be more than 100" };
  }
  const bps = Math.round(pct * 100);
  if (bps === 0) return { ok: true, value: null };
  return { ok: true, value: bps };
}

/** Blank/0 → null. Dollars → cents. Max $100.00 to match the server. */
function parseTopUpFeeFlatDollars(
  text: string
): { ok: true; value: number | null } | { ok: false; error: string } {
  const trimmed = text.trim();
  if (trimmed === "") return { ok: true, value: null };
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    return { ok: false, error: "Flat fee must be dollars and cents, like 0.30" };
  }
  const dollars = Number(trimmed);
  if (!Number.isFinite(dollars) || dollars < 0) {
    return { ok: false, error: "Flat fee can't be negative" };
  }
  const cents = Math.round(dollars * 100);
  if (cents > 10_000) {
    return { ok: false, error: "Flat fee can't be more than $100.00" };
  }
  if (cents === 0) return { ok: true, value: null };
  return { ok: true, value: cents };
}

function BillingConnectCard({
  billing,
  billingOn,
  onBillingOnChange,
}: {
  billing: OrganizationBillingSettings;
  billingOn: boolean;
  onBillingOnChange: (next: boolean) => void;
}) {
  const { roles } = useAuth();
  const update = useUpdateBilling();
  const connect = useConnectStripe();
  const canEdit = canManageBillingSettings(roles);
  const payoutsReady = billing.stripeEnabled;
  const [confirmOff, setConfirmOff] = useState(false);

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

  function requestEnable(next: boolean) {
    if (!canEdit || update.isPending || next === billingOn) return;
    if (next && !payoutsReady) return;
    if (!next) {
      setConfirmOff(true);
      return;
    }
    apply(true);
  }

  function apply(next: boolean) {
    const previous = billingOn;
    onBillingOnChange(next);
    setConfirmOff(false);
    update.mutate(
      { enabled: next },
      {
        onSuccess: () => toast.success(next ? "Billing is on" : "Billing is off"),
        onError: (err) => {
          onBillingOnChange(previous);
          toast.error(err instanceof ApiError ? err.message : "Couldn't update billing");
        },
      }
    );
  }

  return (
    <>
      <Card
        data-doc-shot={
          payoutsReady ? "billing-payouts-connected" : "billing-payouts-not-connected"
        }
      >
        <CardHeader className="flex-row items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-md bg-primary/10 text-primary">
            <Receipt className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <CardTitle>Payouts</CardTitle>
            <CardDescription>Collect card and ACH through Stripe. Billing stays off until this is connected.</CardDescription>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {payoutsReady && (
              <Badge variant="success">
                <ShieldCheck className="size-3" /> Connected
              </Badge>
            )}
            <Button
              type="button"
              variant={payoutsReady ? "outline" : "default"}
              size="sm"
              onClick={handleConnect}
              disabled={!canEdit || connect.isPending}
            >
              {connect.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ExternalLink className="size-4" />
              )}
              {payoutsReady ? "Manage payouts" : "Connect payouts"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
            <PreferenceToggle
              label="Billing enabled"
              description={
                !payoutsReady
                  ? billingOn
                    ? "Payouts are not connected. Nothing will be charged until you reconnect."
                    : "Connect payouts first. Nothing is charged until Stripe is connected."
                  : "Charge for reservations, fees, and flight time."
              }
              checked={billingOn}
              disabled={!canEdit || update.isPending || (!payoutsReady && !billingOn)}
              saving={update.isPending}
              onCheckedChange={requestEnable}
            />
        </CardContent>
      </Card>

      <AlertDialog open={confirmOff} onOpenChange={setConfirmOff}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Turn billing off?</AlertDialogTitle>
            <AlertDialogDescription>
              Close-outs will still complete, but members will not be charged. Rates and How
              members pay stay saved for when you turn it back on.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={update.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={update.isPending}
              onClick={(e) => {
                e.preventDefault();
                apply(false);
              }}
            >
              {update.isPending && <Loader2 className="size-4 animate-spin" />}
              Turn off
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/**
 * Invoice each booking or account ledger. Owner-only write; confirm when switching.
 */
function BillingModePicker({
  mode,
  loadError,
  onRetry,
}: {
  mode: BillingMode;
  loadError: unknown;
  onRetry: () => void;
}) {
  const { roles } = useAuth();
  const update = useUpdateOrgLedgerSettings();
  const canEdit = canManageBillingSettings(roles);
  const [selected, setSelected] = useState<BillingMode>(mode);
  const [pending, setPending] = useState(false);
  const [confirmTo, setConfirmTo] = useState<BillingMode | null>(null);

  useEffect(() => {
    setSelected(mode);
  }, [mode]);

  if (loadError) {
    return (
      <Card data-doc-shot="ledger-mode-card">
        <ErrorState error={loadError} onRetry={onRetry} />
      </Card>
    );
  }

  function requestChange(next: BillingMode) {
    if (!canEdit || pending || next === selected) return;
    if (next === mode) {
      setSelected(next);
      return;
    }
    setConfirmTo(next);
  }

  function apply(next: BillingMode) {
    const previous = selected;
    setSelected(next);
    setPending(true);
    setConfirmTo(null);
    update.mutate(
      { enabled: next === "ledger" },
      {
        onSuccess: () =>
          toast.success(
            next === "ledger"
              ? "Members will use account ledgers"
              : "Members will be billed with invoices"
          ),
        onError: (err) => {
          setSelected(previous);
          toast.error(err instanceof ApiError ? err.message : "Couldn't update billing mode");
        },
        onSettled: () => setPending(false),
      }
    );
  }

  return (
    <>
      <Card data-doc-shot="ledger-mode-card">
        <CardHeader className="flex-row items-start gap-2.5">
          <span className="grid size-8 place-items-center rounded-md bg-primary/10 text-primary">
            <Receipt className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <CardTitle className="inline-flex items-center gap-1.5">
              How members pay
              <DocsHint topic="how-members-pay" />
            </CardTitle>
            <CardDescription>
              {canEdit
                ? "Most schools keep invoices for each booking; ledger is for prepaid / house-account billing. Guests always get a pay-this-visit invoice."
                : "Only the organization owner can change this."}
            </CardDescription>
          </div>
          {pending && <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />}
        </CardHeader>
        <CardContent>
          <BillingModeCards
            value={selected}
            disabled={!canEdit || pending}
            onChange={requestChange}
          />
        </CardContent>
      </Card>

      <AlertDialog open={confirmTo != null} onOpenChange={(open) => !open && setConfirmTo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmTo === "ledger" ? "Switch to account ledger?" : "Switch to invoices?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmTo === "ledger"
                ? "Members will use an account balance instead of a new invoice for every booking. Existing unpaid invoices are unchanged. Guests still get pay-this-visit invoices."
                : "Members go back to a new invoice per booking. Existing ledger balances stay on the account until you refund or adjust them. They are not deleted."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending || confirmTo == null}
              onClick={(e) => {
                e.preventDefault();
                if (confirmTo) apply(confirmTo);
              }}
            >
              {pending && <Loader2 className="size-4 animate-spin" />}
              Switch
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
