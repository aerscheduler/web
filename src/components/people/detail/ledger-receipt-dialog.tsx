import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import type { LedgerReceipt } from "@/types/api";
import { formatDate, formatMoney } from "@/lib/utils";
import { DetailPanel } from "@/components/detail-panel";
import { Button } from "@/components/ui/button";
import { DocsHint } from "@/components/docs-hint";

function entryLabel(type: string): string {
  switch (type) {
    case "flight_charge":
      return "Flight";
    case "item_charge":
      return "Charge";
    case "fee":
      return "Fee";
    default:
      return type;
  }
}

/**
 * Printable ledger charge receipt in the same right-hand panel as invoices
 * and ledger entries. Ledger-mode substitute for a Stripe PDF.
 */
export function LedgerReceiptSheet({
  orgUserId,
  entryId,
  open,
  onOpenChange,
}: {
  orgUserId: number;
  entryId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const q = useQuery({
    queryKey: ["orgUsers", orgUserId, "ledger", "receipt", entryId],
    queryFn: () =>
      api<LedgerReceipt>(`/orgUsers/${orgUserId}/ledger/entries/${entryId}/receipt`),
    enabled: open && entryId != null,
  });

  const receipt = q.data;

  return (
    <DetailPanel
      open={open}
      onOpenChange={onOpenChange}
      title={
        <span className="inline-flex items-center gap-1.5">
          Receipt
          <DocsHint topic="ledger-receipt" />
        </span>
      }
      description={
        receipt
          ? `${receipt.organization.name} · ${entryLabel(receipt.entry.type)}`
          : "Charge details"
      }
      footer={
        <Button type="button" disabled={!receipt} className="w-full" onClick={() => window.print()}>
          Print
        </Button>
      }
    >
      {q.isPending && <p className="pt-4 text-sm text-muted-foreground">Loading…</p>}
      {q.isError && (
        <p className="pt-4 text-sm text-destructive">
          {q.error instanceof ApiError && q.error.status === 404
            ? "Receipt not found."
            : "Couldn't load this receipt."}
        </p>
      )}

      {receipt && (
        <div className="space-y-5 pt-4 text-sm" data-print-receipt>
          <div>
            <div className="font-medium">{receipt.organization.name}</div>
            <div className="text-muted-foreground">
              {receipt.member.name ?? `Member #${receipt.member.orgUserId}`}
              {receipt.member.email ? ` · ${receipt.member.email}` : ""}
            </div>
            <div className="mt-1 text-xs tabular-nums text-muted-foreground">
              {formatDate(receipt.entry.createdAt)} · Ref #{receipt.entry.id}
            </div>
          </div>

          {receipt.reservation && (
            <div className="rounded-md border px-3 py-2 text-xs text-muted-foreground">
              Booking #{receipt.reservation.id}
              {receipt.reservation.resourceLabel
                ? ` · ${receipt.reservation.resourceLabel}`
                : ""}
              {receipt.reservation.type ? ` · ${receipt.reservation.type}` : ""}
            </div>
          )}

          {receipt.entry.memo && (
            <p className="text-muted-foreground">{receipt.entry.memo}</p>
          )}

          <ul className="divide-y rounded-md border">
            {receipt.entry.items.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-3 px-3 py-2"
              >
                <span>
                  {item.name}
                  {item.qty !== 1 ? ` × ${item.qty}` : ""}
                </span>
                <span className="tabular-nums">
                  {formatMoney(item.qty * item.unitPrice)}
                </span>
              </li>
            ))}
          </ul>

          <div className="flex items-center justify-between border-t pt-2 font-semibold">
            <span>Total</span>
            <span className="tabular-nums">
              {formatMoney(Math.abs(receipt.entry.amountCents))}
            </span>
          </div>
        </div>
      )}
    </DetailPanel>
  );
}
