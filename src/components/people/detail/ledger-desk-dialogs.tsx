import { moneySymbol, billingCurrencyLabel, parseMoneyInput } from "@/lib/billing-currency";
import * as React from "react";
import { toast } from "sonner";
import { ErrorState } from "@/components/states";
import { Banknote, Loader2 } from "lucide-react";
import { ApiError } from "@/lib/api";
import {
  useLedgerBlocks,
  useLedgerRefundable,
  usePostLedgerEntry,
  usePostLedgerRefund,
  useSellBlock,
} from "@/features/queries";
import type { LedgerBlock } from "@/types/api";
import { blockBonusCents } from "@/lib/ledger-blocks";
import { cn, formatMoney, formatDate } from "@/lib/utils";
import { ChipMenu } from "@/components/property-chips";
import { ResponsiveModal } from "@/components/responsive-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DocsHint } from "@/components/docs-hint";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function errMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return "Something went wrong.";
}

function parseDollarsToCents(raw: string): number | null {
  // The shared parser: ignores "£" / "$", reads "12,50" as 12.50 (not 1250.00), and refuses
  // "1,2,3" instead of guessing.
  return parseMoneyInput(raw);
}

export function LedgerAddCreditDialog({
  orgUserId,
  open,
  onOpenChange,
}: {
  orgUserId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const post = usePostLedgerEntry(orgUserId);
  const [dollars, setDollars] = React.useState("");
  const [type, setType] = React.useState<"cash" | "check" | "other">("cash");
  const [memo, setMemo] = React.useState("");

  React.useEffect(() => {
    if (!open) {
      setDollars("");
      setType("cash");
      setMemo("");
      post.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <ResponsiveModal
      open={open} onOpenChange={onOpenChange}
      title="Add credit"
      description={<>Record cash, check, or other money received at the desk. This credits the account ledger
            only. It does not move money through Stripe.</>}
      footer={<><Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={post.isPending}
            onClick={async () => {
              const cents = parseDollarsToCents(dollars);
              if (cents == null || cents <= 0) {
                toast.error("Enter a positive amount.");
                return;
              }
              if (!memo.trim()) {
                toast.error("A memo is required.");
                return;
              }
              try {
                await post.mutateAsync({ amountCents: cents, type, memo: memo.trim() });
                toast.success(`Credited ${formatMoney(cents)}.`);
                onOpenChange(false);
              } catch (e) {
                toast.error(errMessage(e));
              }
            }}
          >
            {post.isPending ? <Loader2 className="size-4 animate-spin" /> : "Post credit"}
          </Button></>}
      data-doc-shot="ledger-add-credit-dialog"
    >

        
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Method</Label>
            <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
              <SelectTrigger className="w-full min-w-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="check">Check</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="credit-amount">Amount ({billingCurrencyLabel()})</Label>
            <Input
              id="credit-amount"
              inputMode="decimal"
              value={dollars}
              onChange={(e) => setDollars(e.target.value)}
              placeholder="50.00"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="credit-memo">Memo</Label>
            <Textarea
              id="credit-memo"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="Check #1042, cash drawer, …"
              rows={2}
            />
          </div>
        </div>
    </ResponsiveModal>
  );
}

export function LedgerAdjustmentDialog({
  orgUserId,
  open,
  onOpenChange,
}: {
  orgUserId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const post = usePostLedgerEntry(orgUserId);
  const [dollars, setDollars] = React.useState("");
  const [memo, setMemo] = React.useState("");

  React.useEffect(() => {
    if (!open) {
      setDollars("");
      setMemo("");
      post.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <ResponsiveModal
      open={open} onOpenChange={onOpenChange}
      title="Adjustment"
      description={<>Correct the balance with a signed amount. Use Refund when money is leaving the organization.
            Adjustments are for true corrections, not payouts.</>}
      footer={<><Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={post.isPending}
            onClick={async () => {
              const cents = parseDollarsToCents(dollars);
              if (cents == null || cents === 0) {
                toast.error("Enter a non-zero amount.");
                return;
              }
              if (!memo.trim()) {
                toast.error("A memo is required.");
                return;
              }
              try {
                await post.mutateAsync({
                  amountCents: cents,
                  type: "adjustment",
                  memo: memo.trim(),
                });
                toast.success("Adjustment posted.");
                onOpenChange(false);
              } catch (e) {
                toast.error(errMessage(e));
              }
            }}
          >
            {post.isPending ? <Loader2 className="size-4 animate-spin" /> : "Post adjustment"}
          </Button></>}
      data-doc-shot="ledger-adjustment-dialog"
    >

        
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="adj-amount">Amount ({billingCurrencyLabel()}, signed)</Label>
            <Input
              id="adj-amount"
              inputMode="decimal"
              value={dollars}
              onChange={(e) => setDollars(e.target.value)}
              placeholder="10.00 or -10.00"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="adj-memo">Memo</Label>
            <Textarea
              id="adj-memo"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="Why this correction…"
              rows={2}
            />
          </div>
        </div>
    </ResponsiveModal>
  );
}

export function LedgerRefundDialog({
  orgUserId,
  open,
  onOpenChange,
}: {
  orgUserId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const refundableQ = useLedgerRefundable(orgUserId, { enabled: open });
  const refund = usePostLedgerRefund(orgUserId);
  const [method, setMethod] = React.useState<"stripe" | "check_cash">("check_cash");
  const [topupId, setTopupId] = React.useState<string>("");
  const [dollars, setDollars] = React.useState("");
  const [memo, setMemo] = React.useState("");
  const [submitted, setSubmitted] = React.useState(false);
  /** One id per time the dialog is opened; feeds the Stripe idempotency key. */
  const [attemptId, setAttemptId] = React.useState(() => Math.random().toString(36).slice(2));

  const balance = refundableQ.data?.balanceCents ?? 0;
  // Block bonus is never refundable: what may leave is the balance minus the unspent bonus.
  // An older server that does not send these yet means no bonus, so the balance stands.
  const unspentBonus = Math.max(0, refundableQ.data?.unspentBonusCents ?? 0);
  const refundable = Math.max(
    0,
    Math.min(balance, refundableQ.data?.refundableCents ?? balance - unspentBonus)
  );
  const stripeTopups = (refundableQ.data?.topups ?? []).filter(
    (t) => t.stripePaymentIntentId && t.refundableCents > 0
  );

  React.useEffect(() => {
    if (!open) {
      setMethod("check_cash");
      setTopupId("");
      setDollars("");
      setMemo("");
      setSubmitted(false);
      setAttemptId(Math.random().toString(36).slice(2));
      refund.reset();
      return;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  React.useEffect(() => {
    if (!open || !refundableQ.data) return;
    if (stripeTopups.length > 0 && !topupId) {
      setTopupId(String(stripeTopups[0].id));
      return;
    }
    const selected = stripeTopups.find((t) => String(t.id) === topupId) ?? stripeTopups[0];
    const defaultCents =
      method === "stripe" && selected
        ? Math.min(refundable, selected.refundableCents)
        : refundable;
    if (defaultCents > 0) {
      setDollars((defaultCents / 100).toFixed(2));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, refundableQ.data, method, topupId]);

  const selectedTopup = stripeTopups.find((t) => String(t.id) === topupId);
  const chargeLeft = selectedTopup?.refundableCents ?? 0;
  const maxCents =
    method === "stripe" && selectedTopup ? Math.min(refundable, chargeLeft) : refundable;
  const limitedByCharge =
    method === "stripe" && selectedTopup != null && chargeLeft < refundable;
  const hasCardFee = Boolean(selectedTopup?.memo?.toLowerCase().includes("card fee"));
  const cents = parseDollarsToCents(dollars);
  const amountOver = cents != null && cents > 0 && cents > maxCents;
  const amountError = amountOver
    ? limitedByCharge
      ? `This charge only has ${formatMoney(chargeLeft)} left. Pick another charge to return more.`
      : unspentBonus > 0
        ? `Only ${formatMoney(refundable)} is refundable. Block bonus is not.`
        : `Balance is only ${formatMoney(balance)}.`
    : submitted && (cents == null || cents <= 0)
      ? "Enter a positive amount."
      : null;
  const memoError = submitted && !memo.trim() ? "A memo is required." : null;
  const chargeError =
    submitted && method === "stripe" && !topupId ? "Choose a card charge." : null;

  return (
    <ResponsiveModal
      open={open} onOpenChange={onOpenChange}
      title={
        <span className="inline-flex items-center gap-1.5">
          Refund
          <DocsHint topic="ledger-refund" />
        </span>
      }
      description={
        unspentBonus > 0
          ? "Pay them back what they paid in. Block bonus stays on the account until it is used, or comes off with the last refund."
          : `Pay them back from this balance, down to ${formatMoney(0)}.`
      }
      size="sm"
      footer={<><Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={refund.isPending || refundableQ.isPending || refundable <= 0}
            onClick={async () => {
              setSubmitted(true);
              const nextCents = parseDollarsToCents(dollars);
              if (nextCents == null || nextCents <= 0) return;
              if (nextCents > maxCents) return;
              if (!memo.trim()) return;
              if (method === "stripe" && !topupId) return;
              try {
                await refund.mutateAsync({
                  amountCents: nextCents,
                  method,
                  memo: memo.trim(),
                  topupEntryId: method === "stripe" ? Number(topupId) : undefined,
                  // Keyed to this dialog session AND the exact amount/charge, so a retry
                  // after a lost response reuses Stripe's first refund instead of issuing
                  // a second one, while an edited amount correctly gets a fresh key.
                  idempotencyKey: `ledger_refund_${orgUserId}_${attemptId}_${nextCents}_${topupId || "none"}`,
                });
                toast.success(
                  method === "stripe"
                    ? `Refunded ${formatMoney(nextCents)} to card.`
                    : `Recorded ${formatMoney(nextCents)} check/cash refund.`
                );
                onOpenChange(false);
              } catch (e) {
                toast.error(errMessage(e));
              }
            }}
          >
            {refund.isPending ? <Loader2 className="size-4 animate-spin" /> : "Confirm refund"}
          </Button></>}
      data-doc-shot="ledger-refund-dialog"
    >

        

        {refundableQ.isPending ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading refundable balance…
          </div>
        ) : (
          <div className="min-w-0 space-y-3">
            <p className="text-sm">
              Balance{" "}
              <span className="font-semibold tabular-nums">{formatMoney(balance)}</span>
            </p>
            {unspentBonus > 0 && (
              <p
                className="rounded-lg border bg-muted/40 px-3 py-2.5 text-sm"
                data-testid="refund-bonus-note"
              >
                Refundable: <span className="font-medium tabular-nums">{formatMoney(refundable)}</span>.{" "}
                {formatMoney(Math.min(unspentBonus, balance))} of block bonus is not refundable.
              </p>
            )}

            <div className="space-y-2">
              <Label>Method</Label>
              <Select
                value={method}
                onValueChange={(v) => {
                  setMethod(v as typeof method);
                  setSubmitted(false);
                }}
              >
                <SelectTrigger className="w-full min-w-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="check_cash">Check / cash</SelectItem>
                  <SelectItem value="stripe" disabled={stripeTopups.length === 0}>
                    Original card
                  </SelectItem>
                </SelectContent>
              </Select>
              {stripeTopups.length === 0 ? (
                <p className="text-xs text-muted-foreground">No card charges left to return to.</p>
              ) : null}
            </div>

            {method === "stripe" && (
              <div className="min-w-0 space-y-2">
                <Label>Card charge</Label>
                <Select
                  value={topupId}
                  onValueChange={(id) => {
                    setTopupId(id);
                    setSubmitted(false);
                  }}
                >
                  <SelectTrigger className="w-full min-w-0" aria-invalid={!!chargeError}>
                    <SelectValue placeholder="Choose a charge" />
                  </SelectTrigger>
                  <SelectContent position="popper" className="w-[var(--radix-select-trigger-width)]">
                    {stripeTopups.map((t) => (
                      <SelectItem key={t.id} value={String(t.id)}>
                        {formatDate(t.createdAt)} · {formatMoney(t.refundableCents)} on this charge
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {chargeError ? (
                  <p className="text-xs text-destructive">{chargeError}</p>
                ) : selectedTopup ? (
                  <p className="text-xs text-muted-foreground">
                    Only this charge is returned, not the whole balance.
                    {selectedTopup.refundedCents > 0
                      ? ` ${formatMoney(selectedTopup.refundedCents)} already returned.`
                      : ""}
                    {hasCardFee ? " Card fee stays charged." : ""}
                  </p>
                ) : null}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="refund-amount">Amount</Label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  {moneySymbol()}
                </span>
                <Input placeholder="25.00"
                  id="refund-amount"
                  inputMode="decimal"
                  value={dollars}
                  aria-invalid={!!amountError}
                  onChange={(e) => setDollars(e.target.value)}
                  className="pl-7 tnum"
                />
              </div>
              {amountError ? (
                <p className="text-xs text-destructive">{amountError}</p>
              ) : method === "stripe" && selectedTopup && maxCents > 0 ? (
                <p className="text-xs text-muted-foreground">
                  {limitedByCharge
                    ? `Max ${formatMoney(chargeLeft)} on this charge · refundable ${formatMoney(refundable)}`
                    : chargeLeft > refundable
                      ? `Max ${formatMoney(refundable)} · ${formatMoney(chargeLeft)} left on this charge`
                      : `Max ${formatMoney(maxCents)}`}
                </p>
              ) : maxCents > 0 ? (
                <p className="text-xs text-muted-foreground">Max {formatMoney(maxCents)}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="refund-memo">Memo</Label>
              <Textarea
                id="refund-memo"
                value={memo}
                aria-invalid={!!memoError}
                onChange={(e) => setMemo(e.target.value)}
                placeholder={method === "check_cash" ? "Check # / reason" : "Reason for refund"}
                rows={2}
              />
              {memoError ? <p className="text-xs text-destructive">{memoError}</p> : null}
            </div>
          </div>
        )}
    </ResponsiveModal>
  );
}

const SELL_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "check", label: "Check" },
  { value: "other", label: "Other" },
] as const;
type SellMethod = (typeof SELL_METHODS)[number]["value"];

/**
 * Desk: sell a prepaid block (owners and admins). Built from Add credit beside it: the money
 * came in at the desk, nothing moves through Stripe. The block is the thing itself, so it is
 * the field; how they paid is a chip under it. Posts the payment and the bonus as two rows.
 */
export function LedgerSellBlockDialog({
  orgUserId,
  open,
  onOpenChange,
}: {
  orgUserId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const blocksQ = useLedgerBlocks({}, { enabled: open });
  const sell = useSellBlock(orgUserId);
  const blocks = (blocksQ.data ?? []).filter((b) => b.active && !b.archivedAt);
  const [blockId, setBlockId] = React.useState<number | null>(null);
  const [method, setMethod] = React.useState<SellMethod>("cash");
  const [memo, setMemo] = React.useState("");

  React.useEffect(() => {
    if (!open) {
      setBlockId(null);
      setMethod("cash");
      setMemo("");
      sell.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // The first block is picked for you when the list arrives. One that disappears (archived
  // meanwhile) is unpicked, never swapped for another: a refetch must not turn "Sell 20-hour"
  // into "Sell 10-hour" under the cursor.
  const firstId = blocks[0]?.id ?? null;
  React.useEffect(() => {
    if (open && blockId == null && firstId != null) setBlockId(firstId);
  }, [open, blockId, firstId]);
  const block = blocks.find((b) => b.id === blockId) ?? null;

  async function submit() {
    if (!block) return;
    try {
      const data = await sell.mutateAsync({
        blockId: block.id,
        expectedPriceCents: block.priceCents,
        expectedCreditCents: block.creditCents,
        method,
        ...(memo.trim() ? { memo: memo.trim() } : {}),
      });
      toast.success(`Sold ${block.name}. Balance ${formatMoney(data.balanceCents)}.`);
      onOpenChange(false);
    } catch (e) {
      toast.error(errMessage(e));
      // The block changed while the dialog was open: show its new terms before a retry.
      if (e instanceof ApiError && e.status === 409) void blocksQ.refetch();
    }
  }

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={(o) => {
        if (sell.isPending) return;
        onOpenChange(o);
      }}
      title={
        <span className="inline-flex items-center gap-1.5">
          Sell a block
          <DocsHint topic="prepaid-blocks" />
        </span>
      }
      description="Record a block paid for at the desk. The payment and the bonus both land on the account. Nothing moves through Stripe."
      dataDocShot="ledger-sell-block-dialog"
      footer={
        <>
          <Button variant="outline" disabled={sell.isPending} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!block || sell.isPending} onClick={() => void submit()}>
            {sell.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : block ? (
              `Sell ${block.name}`
            ) : (
              "Sell"
            )}
          </Button>
        </>
      }
    >
      {blocksQ.isPending ? (
        <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading blocks…
        </div>
      ) : blocksQ.isError ? (
        <ErrorState error={blocksQ.error} onRetry={() => void blocksQ.refetch()} />
      ) : blocks.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No blocks are on sale. Add one in Settings, Billing, Prepaid blocks.
        </p>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Block</Label>
            <div role="radiogroup" aria-label="Block" className="grid gap-2">
              {blocks.map((b) => (
                <SellBlockOption
                  key={b.id}
                  block={b}
                  selected={block?.id === b.id}
                  onSelect={() => setBlockId(b.id)}
                />
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <ChipMenu
              id="sell-block-method"
              name="How they paid"
              leading={<Banknote className="size-3.5" />}
              label={`Paid by ${SELL_METHODS.find((m) => m.value === method)?.label.toLowerCase()}`}
              set
              value={method}
              onChange={(v) => setMethod(v as SellMethod)}
              options={SELL_METHODS.map((m) => ({ value: m.value, label: m.label }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sell-block-memo">Memo</Label>
            <Textarea
              id="sell-block-memo"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="Optional. Check #1042"
              rows={2}
            />
          </div>
        </div>
      )}
    </ResponsiveModal>
  );
}

function SellBlockOption({
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
      data-testid={`sell-block-${block.id}`}
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
      </span>
    </button>
  );
}
