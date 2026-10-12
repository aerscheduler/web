import { billingCurrencyLabel, parseMoneyInput } from "@/lib/billing-currency";
import * as React from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, CreditCard, Info, Loader2, Lock } from "lucide-react";
import type { LedgerBlock, LedgerTopUpIntent, PaymentMethod } from "@/types/api";
import { ApiError } from "@/lib/api";
import {
  invalidateLedgerMoney,
  useConfirmLedgerTopUp,
  useCreateLedgerTopUp,
  useLedgerBlocks,
  useOrgLedgerSettings,
  usePaymentMethods,
  type LedgerTopUpBody,
} from "@/features/queries";
import { blockBonusCents } from "@/lib/ledger-blocks";
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
/** The "Custom amount" choice beside the prepaid blocks. */
const CUSTOM = "custom" as const;

/** What the member is buying: a typed amount, or a prepaid block the server prices. */
type TopUpTarget = { kind: "amount"; cents: number } | { kind: "block"; block: LedgerBlock };

function targetBody(target: TopUpTarget): LedgerTopUpBody {
  // A block carries the terms on screen, so a block edited meanwhile is refused, not charged.
  return target.kind === "block"
    ? {
        blockId: target.block.id,
        expectedPriceCents: target.block.priceCents,
        expectedCreditCents: target.block.creditCents,
      }
    : { amountCents: target.cents };
}

/** What lands on the balance: the typed amount, or the block's credit (price plus bonus). */
function targetCreditCents(target: TopUpTarget): number {
  return target.kind === "block" ? target.block.creditCents : target.cents;
}

/** What the card is charged before any card fee. */
function targetPriceCents(target: TopUpTarget): number {
  return target.kind === "block" ? target.block.priceCents : target.cents;
}

function errMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return "We couldn't start the top-up. Please try again.";
}

function parseDollarsToCents(raw: string): number | null {
  // The shared parser: ignores "£" / "$", reads "12,50" as 12.50 (not 1250.00), and refuses
  // "1,2,3" instead of guessing. A top-up is never zero or negative.
  const cents = parseMoneyInput(raw);
  return cents != null && cents > 0 ? cents : null;
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

/** e.g. "50% + $1.00" from org fee settings (in the billing currency). */
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
  // Prepaid blocks the organization offers. Members only ever get active ones back.
  const blocksQ = useLedgerBlocks({}, { enabled: open });
  const methods = methodsQ.data ?? [];
  const blocks = (blocksQ.data ?? []).filter((b) => b.active && !b.archivedAt);

  const [step, setStep] = React.useState<"amount" | "pay">("amount");
  const [dollars, setDollars] = React.useState("100");
  const [payWith, setPayWith] = React.useState<string>(NEW_CARD);
  const [choice, setChoice] = React.useState<number | typeof CUSTOM>(CUSTOM);
  const [intent, setIntent] = React.useState<LedgerTopUpIntent | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      setStep("amount");
      setDollars("100");
      setPayWith(NEW_CARD);
      setChoice(CUSTOM);
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

  function successToast(data: Pick<LedgerTopUpIntent, "creditCents" | "feeCents" | "block">) {
    const { creditCents, feeCents, block } = data;
    if (block) {
      toast.success(`Bought ${block.name}. ${formatMoney(block.creditCents)} added to your account.`);
    } else if (feeCents > 0) {
      toast.success(`${formatMoney(creditCents)} credited to your account.`);
    } else {
      toast.success("Funds added to your account.");
    }
  }

  /** Charge a saved card after a short Undo window so a mis-tap doesn't hit Stripe. */
  function scheduleSavedCardTopUp(target: TopUpTarget, paymentMethodId: string, chargeCents: number) {
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
          const data = await create.mutateAsync({ ...targetBody(target), paymentMethodId });
          toast.dismiss(loadingId);
          if (data.confirmed) {
            successToast(data);
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
          if (e instanceof ApiError && e.status === 409) void blocksQ.refetch();
        }
      })();
    }, TOP_UP_UNDO_MS);

    toastId = toast.message(
      target.kind === "block"
        ? `Buying ${target.block.name} for ${formatMoney(chargeCents)}…`
        : `Adding ${formatMoney(chargeCents)}…`,
      {
      duration: TOP_UP_UNDO_MS,
      action: {
        label: "Undo",
        onClick: () => {
          cancelled = true;
          window.clearTimeout(timer);
          toast.message("Top-up cancelled");
        },
      },
      }
    );
  }

  async function startTopUp(target: TopUpTarget) {
    setError(null);
    const priceCents = targetPriceCents(target);

    if (priceCents > CARD_TOP_UP_CONFIRM_ABOVE_CENTS) {
      const breakdown = previewTopUpCharge(priceCents, ledgerSettingsQ.data);
      const creditCents = targetCreditCents(target);
      const ok = await confirm(
        target.kind === "block"
          ? {
              title: `Buy ${target.block.name}?`,
              description:
                breakdown.feeCents > 0
                  ? `Your card will be charged ${formatMoney(breakdown.chargeCents)} (${formatMoney(priceCents)} plus ${formatMoney(breakdown.feeCents)} card fee) for ${formatMoney(creditCents)} of credit.`
                  : `Your card will be charged ${formatMoney(breakdown.chargeCents)} for ${formatMoney(creditCents)} of credit.`,
              confirmLabel: "Continue",
            }
          : {
              title: `Add ${formatMoney(breakdown.creditCents)}?`,
              description:
                breakdown.feeCents > 0
                  ? `Your card will be charged ${formatMoney(breakdown.chargeCents)} (${formatMoney(breakdown.creditCents)} credited plus ${formatMoney(breakdown.feeCents)} card fee).`
                  : `Your card will be charged ${formatMoney(breakdown.chargeCents)}.`,
              confirmLabel: "Continue",
            }
      );
      if (!ok) return;
    }

    // Saved card charges immediately — give a misclick Undo before Stripe.
    if (payWith !== NEW_CARD) {
      const chargeCents = previewTopUpCharge(priceCents, ledgerSettingsQ.data).chargeCents;
      scheduleSavedCardTopUp(target, payWith, chargeCents);
      return;
    }

    // New card: open Payment Element; they still confirm on the next step.
    try {
      const data = await create.mutateAsync(targetBody(target));
      setIntent(data);
      setStep("pay");
    } catch (e) {
      setError(errMessage(e));
      // The block changed while the dialog was open: show its new terms.
      if (e instanceof ApiError && e.status === 409) void blocksQ.refetch();
    }
  }

  // A block that was archived while the dialog was open drops back to a custom amount.
  const block = choice === CUSTOM ? null : (blocks.find((b) => b.id === choice) ?? null);
  const amountCents = parseDollarsToCents(dollars) ?? 0;
  const breakdown = block
    ? previewTopUpCharge(block.priceCents, ledgerSettingsQ.data)
    : amountCents >= 100
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
      dataDocShot="add-funds-dialog"
    >

        

        {step === "amount" && (
          <div className="space-y-4">
            {blocks.length > 0 && (
              <div className="space-y-2">
                <Label>Prepaid blocks</Label>
                <div role="radiogroup" aria-label="What to buy" className="grid gap-2">
                  {blocks.map((b) => (
                    <BlockOption
                      key={b.id}
                      block={b}
                      selected={block?.id === b.id}
                      onSelect={() => {
                        setChoice(b.id);
                        setError(null);
                      }}
                    />
                  ))}
                  <button
                    type="button"
                    role="radio"
                    aria-checked={block == null}
                    onClick={() => setChoice(CUSTOM)}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
                      block == null
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "border-border hover:bg-muted/40"
                    )}
                  >
                    <span className="font-medium">Custom amount</span>
                  </button>
                </div>
              </div>
            )}

            {block == null && (
            <>
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
              <Label htmlFor="add-funds-amount">Credit amount ({billingCurrencyLabel()})</Label>
              <Input
                id="add-funds-amount"
                inputMode="decimal"
                value={dollars}
                onChange={(e) => setDollars(e.target.value)}
                placeholder="100.00"
              />
              <p className="text-xs text-muted-foreground">Minimum {formatMoney(100)} credited</p>
            </div>
            </>
            )}

            {breakdown && (block != null || breakdown.feeCents > 0) && (
              <div className="rounded-lg border bg-muted/40 px-3 py-2.5 text-sm" data-testid="add-funds-summary">
                {block ? (
                  <p>
                    Pay <span className="font-medium">{formatMoney(breakdown.chargeCents)}</span> for{" "}
                    <span className="font-medium">{formatMoney(block.creditCents)}</span> of credit
                  </p>
                ) : (
                  <p>
                    Pay <span className="font-medium">{formatMoney(breakdown.chargeCents)}</span>
                    {" → "}
                    <span className="font-medium">{formatMoney(breakdown.creditCents)}</span> credited
                  </p>
                )}
                {breakdown.feeCents > 0 && (
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
                        Calculated as {feeRecipe} of {block ? "the block price" : "the credit amount"}.
                      </TooltipContent>
                    </Tooltip>
                  )}
                </p>
                )}
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
            {ledgerSettingsQ.isError && (
              <p className="text-sm text-muted-foreground">
                Couldn&rsquo;t load the card fee, so the total can&rsquo;t be shown yet.{" "}
                <button type="button" className="underline" onClick={() => void ledgerSettingsQ.refetch()}>
                  Try again
                </button>
              </p>
            )}
            <Button
              className="w-full"
              // The card fee decides the charge shown above; never offer Pay before it is known.
              disabled={
                create.isPending || methodsQ.isLoading || ledgerSettingsQ.isPending || ledgerSettingsQ.isError
              }
              onClick={() => {
                if (block) {
                  void startTopUp({ kind: "block", block });
                  return;
                }
                const cents = parseDollarsToCents(dollars);
                if (cents == null || cents < 100) {
                  setError(`Enter at least ${formatMoney(100)}`);
                  return;
                }
                void startTopUp({ kind: "amount", cents });
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
              creditLabel={formatMoney(intent.block?.creditCents ?? intent.creditCents)}
              showCredit={intent.feeCents > 0 || intent.block != null}
              onBusyChange={setBusy}
              onDone={async () => {
                try {
                  const settled = await confirmTopUp.mutateAsync({
                    paymentIntentId: intent.paymentIntentId,
                  });
                  successToast(intent);
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
  showCredit,
  onBusyChange,
  onDone,
  onBack,
}: {
  chargeLabel: string;
  creditLabel: string;
  /** A card fee or a block bonus: the credit differs from the charge, so say both. */
  showCredit: boolean;
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
        {showCredit ? (
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

/** One prepaid block as a choice, styled like the saved-card options below it. */
function BlockOption({
  block,
  selected,
  onSelect,
}: {
  block: LedgerBlock;
  selected: boolean;
  onSelect: () => void;
}) {
  const bonus = blockBonusCents(block.priceCents, block.creditCents);
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      data-testid={`add-funds-block-${block.id}`}
      className={cn(
        "flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
        selected ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:bg-muted/40"
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{block.name}</span>
        <span className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground tnum">
          <span>Pay {formatMoney(block.priceCents)}</span>
          <span>Get {formatMoney(block.creditCents)}</span>
          {bonus > 0 && (
            <span className="text-emerald-700 dark:text-emerald-400">
              +{formatMoney(bonus)} bonus
            </span>
          )}
        </span>
        {block.description ? (
          <span className="mt-1 block text-xs text-muted-foreground">{block.description}</span>
        ) : null}
      </span>
    </button>
  );
}
