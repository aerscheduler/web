import { CheckCircle2, AlertCircle, Clock } from "lucide-react";
import type { Invoice } from "@/types/api";
import { Badge } from "@/components/ui/badge";
import type { BadgeProps } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { isPastDue } from "@/lib/payment-methods";

export type InvoiceStatus = {
  key: "paid" | "void" | "past_due" | "outstanding";
  label: string;
  variant: NonNullable<BadgeProps["variant"]>;
};

/**
 * Derive the display status of an invoice. Paid wins, then void, then past due (unpaid and past
 * a due date it has, the server's own `overdue` rule), else outstanding.
 */
export function invoiceStatus(inv: Invoice, now = new Date()): InvoiceStatus {
  if (inv.paidAt) return { key: "paid", label: "Paid", variant: "success" };
  if (inv.voidedAt) return { key: "void", label: "Void", variant: "outline" };
  if (isPastDue(inv, now)) return { key: "past_due", label: "Past due", variant: "warning" };
  return { key: "outstanding", label: "Outstanding", variant: "warning" };
}

/** Still owed: outstanding or past due. What may be paid, marked paid, reminded or voided. */
export function isOwed(status: InvoiceStatus): boolean {
  return status.key === "outstanding" || status.key === "past_due";
}

export function InvoiceStatusBadge({ invoice }: { invoice: Invoice }) {
  const s = invoiceStatus(invoice);
  return (
    <span className="inline-flex items-center gap-1.5">
      <Badge variant={s.variant} data-status={s.key}>
        {/* Amber like Outstanding (no red for a status), told apart by the clock and the word. */}
        {s.key === "past_due" && <Clock className="size-3" aria-hidden="true" />}
        {s.label}
      </Badge>
      <QuickBooksSyncChip invoice={invoice} />
    </span>
  );
}

/** Tiny QBO status next to Paid, desk trust without opening the sheet. */
function QuickBooksSyncChip({ invoice }: { invoice: Invoice }) {
  if (!invoice.paidAt || invoice.voidedAt) return null;

  if (invoice.qboSalesReceiptId) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className="inline-flex text-emerald-600 dark:text-emerald-400"
            aria-label="Synced to QuickBooks"
          >
            <CheckCircle2 className="size-3.5" />
          </span>
        </TooltipTrigger>
        <TooltipContent>QuickBooks Sales Receipt {invoice.qboSalesReceiptId}</TooltipContent>
      </Tooltip>
    );
  }

  if (invoice.qboSyncError) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex text-destructive" aria-label="QuickBooks sync failed">
            <AlertCircle className="size-3.5" />
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">{invoice.qboSyncError}</TooltipContent>
      </Tooltip>
    );
  }

  return null;
}
