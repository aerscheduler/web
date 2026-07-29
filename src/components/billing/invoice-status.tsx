import { CheckCircle2, AlertCircle } from "lucide-react";
import type { Invoice } from "@/types/api";
import { Badge } from "@/components/ui/badge";
import type { BadgeProps } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type InvoiceStatus = {
  key: "paid" | "void" | "outstanding";
  label: string;
  variant: NonNullable<BadgeProps["variant"]>;
};

/** Derive the display status of an invoice. Paid wins, then void, else outstanding. */
export function invoiceStatus(inv: Invoice): InvoiceStatus {
  if (inv.paidAt) return { key: "paid", label: "Paid", variant: "success" };
  if (inv.voidedAt) return { key: "void", label: "Void", variant: "outline" };
  return { key: "outstanding", label: "Outstanding", variant: "warning" };
}

export function InvoiceStatusBadge({ invoice }: { invoice: Invoice }) {
  const s = invoiceStatus(invoice);
  return (
    <span className="inline-flex items-center gap-1.5">
      <Badge variant={s.variant}>{s.label}</Badge>
      <QuickBooksSyncChip invoice={invoice} />
    </span>
  );
}

/** Tiny QBO status next to Paid — desk trust without opening the sheet. */
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
