import * as React from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { ApiError } from "@/lib/api";
import {
  useLedgerRefundable,
  usePostLedgerEntry,
  usePostLedgerRefund,
} from "@/features/queries";
import { formatMoney, formatDate } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  const cleaned = raw.trim().replace(/[$,]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-doc-shot="ledger-add-credit-dialog">
        <DialogHeader>
          <DialogTitle>Add credit</DialogTitle>
          <DialogDescription>
            Record cash, check, or other money received at the desk. This credits the account ledger
            only — it does not move money through Stripe.
          </DialogDescription>
        </DialogHeader>
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
            <Label htmlFor="credit-amount">Amount (USD)</Label>
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
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
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
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-doc-shot="ledger-adjustment-dialog">
        <DialogHeader>
          <DialogTitle>Adjustment</DialogTitle>
          <DialogDescription>
            Correct the balance with a signed amount. Use Refund when money is leaving the school —
            adjustments are for true corrections, not payouts.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="adj-amount">Amount (USD, signed)</Label>
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
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
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
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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

  const balance = refundableQ.data?.balanceCents ?? 0;
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
        ? Math.min(balance, selected.refundableCents)
        : balance;
    if (defaultCents > 0) {
      setDollars((defaultCents / 100).toFixed(2));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, refundableQ.data, method, topupId]);

  const selectedTopup = stripeTopups.find((t) => String(t.id) === topupId);
  const chargeLeft = selectedTopup?.refundableCents ?? 0;
  const maxCents =
    method === "stripe" && selectedTopup ? Math.min(balance, chargeLeft) : balance;
  const limitedByCharge =
    method === "stripe" && selectedTopup != null && chargeLeft < balance;
  const hasCardFee = Boolean(selectedTopup?.memo?.toLowerCase().includes("card fee"));
  const cents = parseDollarsToCents(dollars);
  const amountOver = cents != null && cents > 0 && cents > maxCents;
  const amountError = amountOver
    ? limitedByCharge
      ? `This charge only has ${formatMoney(chargeLeft)} left. Pick another charge to return more.`
      : `Balance is only ${formatMoney(balance)}.`
    : submitted && (cents == null || cents <= 0)
      ? "Enter a positive amount."
      : null;
  const memoError = submitted && !memo.trim() ? "A memo is required." : null;
  const chargeError =
    submitted && method === "stripe" && !topupId ? "Choose a card charge." : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden sm:max-w-md" data-doc-shot="ledger-refund-dialog">
        <DialogHeader>
          <DialogTitle className="inline-flex items-center gap-1.5">
            Refund
            <DocsHint topic="ledger-refund" />
          </DialogTitle>
          <DialogDescription>Pay them back from this balance, down to $0.00.</DialogDescription>
        </DialogHeader>

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
                  $
                </span>
                <Input
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
                    ? `Max ${formatMoney(chargeLeft)} on this charge · account ${formatMoney(balance)}`
                    : chargeLeft > balance
                      ? `Max ${formatMoney(balance)} · ${formatMoney(chargeLeft)} left on this charge`
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

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={refund.isPending || refundableQ.isPending || balance <= 0}
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
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
