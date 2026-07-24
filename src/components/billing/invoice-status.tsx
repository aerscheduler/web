import type { Invoice } from "@/types/api";
import { Badge } from "@/components/ui/badge";
import type { BadgeProps } from "@/components/ui/badge";

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
  return <Badge variant={s.variant}>{s.label}</Badge>;
}
