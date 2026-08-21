import * as React from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, CreditCard, Info, Loader2, Lock } from "lucide-react";
import type { LedgerTopUpIntent, PaymentMethod } from "@/types/api";
import { ApiError } from "@/lib/api";
import {
  invalidateLedgerMoney,
  useConfirmLedgerTopUp,
  useCreateLedgerTopUp,
  useOrgLedgerSettings,
  usePaymentMethods,
} from "@/features/queries";
import { getStripeForAccount } from "@/lib/stripe";
import { stripeAppearance, useIsDark } from "@/components/billing/stripe-appearance";
import { useConfirm } from "@/components/confirm-dialog";
import { ResponsiveModal } from "@/components/responsive-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn, formatMoney } from "@/lib/utils";

const PRESETS = [5_000, 10_000, 25_000, 50_000] as const;
/** Above the largest chip: ask once before charging. ACH can raise this later. */
const CARD_TOP_UP_CONFIRM_ABOVE_CENTS = PRESETS[PRESETS.length - 1];
/** Sentinel for “enter a new card” via Payment Element. */
const NEW_CARD = "__new__";
/** Pre-charge undo window — same idea as reservation toast Undo, but before Stripe fires. */
const TOP_UP_UNDO_MS = 5_000;

function errMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return "We couldn't start the top-up. Please try again.";
}

function parseDollarsToCents(raw: string): number | null {
  const cleaned = raw.trim().replace(/[$,]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

/** Mirror server `computeTopUpCardCharge` for the amount step preview. */
function previewTopUpCharge(
  creditCents: number,
  fees: { topUpCardFeePercent: number | null; topUpCardFeeFlatCents: number | null } | undefined
): { creditCents: number; feeCents: number; chargeCents: number } {
  const pct = fees?.topUpCardFeePercent ?? 0;
  const flat = fees?.topUpCardFeeFlatCents ?? 0;
  const feeCents = Math.floor((creditCents * pct) / 10_000) + flat;
  return { creditCents, feeCents, chargeCents: creditCents + feeCents };
}

/** e.g. "50% + $1.00" from org fee settings. */
function formatTopUpFeeRecipe(fees: {
  topUpCardFeePercent: number | null;
  topUpCardFeeFlatCents: number | null;
}): string | null {
  const parts: string[] = [];
  const pct = fees.topUpCardFeePercent ?? 0;
  const flat = fees.topUpCardFeeFlatCents ?? 0;
  if (pct > 0) parts.push(`${pct / 100}%`);
  if (flat > 0) parts.push(formatMoney(flat));
  return parts.length ? parts.join(" + ") : null;
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function cardLabel(m: PaymentMethod): string {
  if (m.card) return `${titleCase(m.card.brand)} •••• ${m.card.last4}`;
  return titleCase(m.type);
}

function defaultMethodId(methods: PaymentMethod[]): string {
  const def = methods.find((m) => m.defaultPaymentMethod);
  return def?.id ?? methods[0]?.id ?? NEW_CARD;
}

/**
 * Member Add funds: amount + saved-card picker (default selected), or Payment Element
 * for a new card. Saved-card path confirms off-session like the mobile app.
 */
export function AddFundsDialog({
  orgUserId,
  open,
  onOpenChange,
}: {
  orgUserId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const dark = useIsDark();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const create = useCreateLedgerTopUp(orgUserId);
  const confirmTopUp = useConfirmLedgerTopUp(orgUserId);
  const methodsQ = usePaymentMethods({ enabled: open });
  const ledgerSettingsQ = useOrgLedgerSettings({ enabled: open });
  const methods = methodsQ.data ?? [];

  const [step, setStep] = React.useState<"amount" | "pay">("amount");
  const [dollars, setDollars] = React.useState("100");
  const [payWith, setPayWith] = React.useState<string>(NEW_CARD);
  const [intent, setIntent] = React.useState<LedgerTopUpIntent | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      setStep("amount");
      setDollars("100");
      setPayWith(NEW_CARD);
      setIntent(null);
      setError(null);
      setBusy(false);
      create.reset();
      return;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only on close/open
  }, [open]);

  // Once methods load, prefer the default (or first) saved card.
  React.useEffect(() => {
    if (!open || methodsQ.isLoading) return;
    if (methods.length > 0) setPayWith(defaultMethodId(methods));
    else setPayWith(NEW_CARD);
  }, [open, methodsQ.isLoading, methods]);

  const stripePromise = React.useMemo(
    () => (intent ? getStripeForAccount(intent.orgStripeAccountId) : null),
    [intent]
  );
  const appearance = React.useMemo(() => stripeAppearance(dark), [dark]);

  function refreshBalances(balanceCents?: number) {
    return invalidateLedgerMoney(qc, balanceCents);
  }

  function successToast(creditCents: number, feeCents: number) {
    if (feeCents > 0) {
      toast.success(`${formatMoney(creditCents)} credited to your account.`);
    } else {
      toast.success("Funds added to your account.");
    }
  }

  /** Charge a saved card after a short Undo window so a mis-tap doesn't hit Stripe. */
  function scheduleSavedCardTopUp(amountCents: number, paymentMethodId: string, chargeCents: number) {
    setError(null);
    onOpenChange(false);

    let cancelled = false;
    let toastId: string | number | undefined;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      if (toastId != null) toast.dismiss(toastId);
      void (async () => {
        const loadingId = toast.loading("Charging your card…");
        try {
          const data = await create.mutateAsync({ amountCents, paymentMethodId });
          toast.dismiss(loadingId);
          if (data.confirmed) {
            successToast(data.creditCents, data.feeCents);
            await refreshBalances(data.balanceCents);
            return;
          }
          // Needs 3DS — reopen the dialog on the Payment Element step.
          setIntent(data);
          setStep("pay");
          onOpenChange(true);
        } catch (e) {
          toast.dismiss(loadingId);
          toast.error(errMessage(e));
        }
      })();
    }, TOP_UP_UNDO_MS);

    toastId = toast.message(`Adding ${formatMoney(chargeCents)}…`, {
      duration: TOP_UP_UNDO_MS,
      action: {
        label: "Undo",
        onClick: () => {
          cancelled = true;
          window.clearTimeout(timer);
          toast.message("Top-up cancelled");
        },
      },
    });
  }

  async function startTopUp(amountCents: number) {
    setError(null);

    if (amountCents > CARD_TOP_UP_CONFIRM_ABOVE_CENTS) {
      const breakdown = previewTopUpCharge(amountCents, ledgerSettingsQ.data);
      const ok = await confirm({
        title: `Add ${formatMoney(breakdown.creditCents)}?`,
        description:
          breakdown.feeCents > 0
            ? `Your card will be charged ${formatMoney(breakdown.chargeCents)} (${formatMoney(breakdown.creditCents)} credited plus ${formatMoney(breakdown.feeCents)} card fee).`
            : `Your card will be charged ${formatMoney(breakdown.chargeCents)}.`,
        confirmLabel: "Continue",
      });
      if (!ok) return;
    }

    // Saved card charges immediately — give a misclick Undo before Stripe.
    if (payWith !== NEW_CARD) {
      const chargeCents = previewTopUpCharge(amountCents, ledgerSettingsQ.data).chargeCents;
      scheduleSavedCardTopUp(amountCents, payWith, chargeCents);
      return;
    }

    // New card: open Payment Element; they still confirm on the next step.
    try {
      const data = await create.mutateAsync({ amountCents });
      setIntent(data);
      setStep("pay");
    } catch (e) {
      setError(errMessage(e));
    }
  }

  const amountCents = parseDollarsToCents(dollars) ?? 0;
  const breakdown =
    amountCents >= 100
      ? previewTopUpCharge(amountCents, ledgerSettingsQ.data)
      : null;
  const feeRecipe =
    breakdown && breakdown.feeCents > 0 && ledgerSettingsQ.data
      ? formatTopUpFeeRecipe(ledgerSettingsQ.data)
      : null;
  const payLabel =
    payWith === NEW_CARD
      ? "Continue to payment"
      : breakdown
        ? breakdown.feeCents > 0
          ? `Pay ${formatMoney(breakdown.chargeCents)}`
          : `Pay ${formatMoney(breakdown.chargeCents)}`
        : "Pay";

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={(o) => {
        if (busy) return;
        onOpenChange(o);
      }}
      title="Add funds"
      description="Put money on your account. It stays as credit until flights or fees draw it down."
      data-doc-shot="add-funds-dialog"
    >

        

        {step === "amount" && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((cents) => (
                <Button
                  key={cents}
                  type="button"
                  variant={dollars === String(cents / 100) ? "default" : "outline"}
                  size="sm"
                  onClick={() => setDollars(String(cents / 100))}
                >
                  {formatMoney(cents)}
                </Button>
              ))}
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-funds-amount">Credit amount (USD)</Label>
              <Input
                id="add-funds-amount"
                inputMode="decimal"
                value={dollars}
                onChange={(e) => setDollars(e.target.value)}
                placeholder="100.00"
              />
              <p className="text-xs text-muted-foreground">Minimum $1.00 credited</p>
            </div>

            {breakdown && breakdown.feeCents > 0 && (
              <div className="rounded-lg border bg-muted/40 px-3 py-2.5 text-sm">
                <p>
                  Pay <span className="font-medium">{formatMoney(breakdown.chargeCents)}</span>
                  {" → "}
                  <span className="font-medium">{formatMoney(breakdown.creditCents)}</span> credited
                </p>
                <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                  <span>Includes {formatMoney(breakdown.feeCents)} card fee</span>
                  {feeRecipe && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="inline-flex size-4 shrink-0 items-center justify-center rounded-full text-muted-foreground/80 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          aria-label={`How the card fee is calculated: ${feeRecipe}`}
                        >
                          <Info className="size-3.5" aria-hidden />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs">
                        Calculated as {feeRecipe} of the credit amount.
                      </TooltipContent>
                    </Tooltip>
                  )}
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label>Pay with</Label>
              {methodsQ.isLoading ? (
                <p className="text-xs text-muted-foreground">Loading saved cards…</p>
              ) : (
                <div role="radiogroup" aria-label="Pay with" className="grid gap-2">
                  {methods.map((m) => {
                    const selected = payWith === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => setPayWith(m.id)}
                        className={cn(
                          "flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
                          selected
                            ? "border-primary bg-primary/5 ring-1 ring-primary"
                            : "border-border hover:bg-muted/40"
                        )}
                      >
                        <span className="grid size-8 place-items-center rounded-md bg-muted text-muted-foreground">
                          <CreditCard className="size-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="font-medium">{cardLabel(m)}</span>
                          {m.defaultPaymentMethod && (
                            <Badge variant="secondary" className="ml-2 font-normal">
                              Default
                            </Badge>
                          )}
                        </span>
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    role="radio"
                    aria-checked={payWith === NEW_CARD}
                    onClick={() => setPayWith(NEW_CARD)}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
                      payWith === NEW_CARD
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "border-border hover:bg-muted/40"
                    )}
                  >
                    <span className="grid size-8 place-items-center rounded-md bg-muted text-muted-foreground">
                      <CreditCard className="size-4" />
                    </span>
                    <span className="font-medium">
                      {methods.length > 0 ? "Use a different card" : "Enter card details"}
                    </span>
                  </button>
                </div>
              )}
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <p>{error}</p>
              </div>
            )}
            <Button
              className="w-full"
              disabled={create.isPending || methodsQ.isLoading}
              onClick={() => {
                const cents = parseDollarsToCents(dollars);
                if (cents == null || cents < 100) {
                  setError("Enter at least $1.00");
                  return;
                }
                void startTopUp(cents);
              }}
            >
              {create.isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Processing…
                </>
              ) : (
                payLabel
              )}
            </Button>
          </div>
        )}

        {step === "pay" && intent && stripePromise && (
          <Elements stripe={stripePromise} options={{ clientSecret: intent.clientSecret, appearance }}>
            <PayTopUpForm
              chargeLabel={formatMoney(intent.chargeCents)}
              creditLabel={formatMoney(intent.creditCents)}
              feeCents={intent.feeCents}
              onBusyChange={setBusy}
              onDone={async () => {
                try {
                  const settled = await confirmTopUp.mutateAsync({
                    paymentIntentId: intent.paymentIntentId,
                  });
                  successToast(intent.creditCents, intent.feeCents);
                  await refreshBalances(settled.balanceCents);
                } catch (e) {
                  toast.error(errMessage(e));
                  await refreshBalances();
                }
                onOpenChange(false);
              }}
              onBack={() => {
                setIntent(null);
                setStep("amount");
              }}
            />
          </Elements>
        )}
    </ResponsiveModal>
  );
}

function PayTopUpForm({
  chargeLabel,
  creditLabel,
  feeCents,
  onBusyChange,
  onDone,
  onBack,
}: {
  chargeLabel: string;
  creditLabel: string;
  feeCents: number;
  onBusyChange: (busy: boolean) => void;
  onDone: () => void | Promise<void>;
  onBack: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    onBusyChange(submitting);
  }, [submitting, onBusyChange]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;

    setSubmitting(true);
    setMessage(null);

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: `${window.location.origin}/me` },
      redirect: "if_required",
    });

    if (error) {
      setMessage(error.message ?? "That payment didn't go through. Your card was not charged.");
      setSubmitting(false);
      return;
    }

    try {
      await onDone();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {feeCents > 0 ? (
          <>
            Charging <span className="font-medium text-foreground">{chargeLabel}</span>
            {" → "}
            <span className="font-medium text-foreground">{creditLabel}</span> credited
          </>
        ) : (
          <>
            Charging <span className="font-medium text-foreground">{chargeLabel}</span>
          </>
        )}
      </p>
      <PaymentElement options={{ layout: "tabs" }} />
      {message && (
        <p className="text-sm text-destructive" role="alert">
          {message}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="button" variant="outline" className="flex-1" disabled={submitting} onClick={onBack}>
          Back
        </Button>
        <Button type="submit" className="flex-1" disabled={!stripe || submitting}>
          {submitting ? (
            <>
              <Loader2 className="size-4 animate-spin" /> Processing…
            </>
          ) : (
            <>
              <Lock className="size-4" /> Pay {chargeLabel}
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
