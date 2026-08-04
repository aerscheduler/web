import { format, parseISO } from "date-fns";
import { CalendarClock, CreditCard } from "lucide-react";
import type { Invoice } from "@/types/api";
import { DetailPanel } from "@/components/detail-panel";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { InvoiceStatusBadge, invoiceStatus } from "@/components/billing/invoice-status";
import { formatMoney } from "@/lib/utils";

function fmtDate(iso: string | null | undefined) {
  return iso ? format(parseISO(iso), "MMM d, yyyy") : "—";
}

/**
 * Invoice drawer for the member's own invoices. Outstanding invoices get a "Pay now" button
 * that hands off to the page-level pay dialog (via `onPay`) so we never nest Radix overlays.
 */
export function MemberInvoiceSheet({
  invoice,
  open,
  onOpenChange,
  onPay,
  onStep,
}: {
  invoice: Invoice | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called when the member taps "Pay now"; the page closes the panel and opens the pay dialog. */
  onPay?: (invoice: Invoice) => void;
  /** ↑/↓ through the invoices on screen while the panel is docked. */
  onStep?: (delta: -1 | 1) => void;
}) {
  const inv = invoice;
  const items = inv?.items ?? [];
  const subtotal =
    inv?.subtotal ?? items.reduce((s, it) => s + it.qty * it.unitPrice, 0);
  const status = inv ? invoiceStatus(inv) : null;
  const outstanding = status?.key === "outstanding";

  return (
    <DetailPanel
      open={open}
      onOpenChange={onOpenChange}
      onStep={onStep}
      title={<span className="font-mono">Invoice #{inv?.id}</span>}
      description={inv ? `Issued ${fmtDate(inv.createdAt)}` : undefined}
      badge={inv ? <InvoiceStatusBadge invoice={inv} /> : undefined}
    >
      {inv && (
        <div className="space-y-5 pt-4">
          {inv.memo && <p className="text-sm text-muted-foreground">{inv.memo}</p>}

          {inv.dueAt && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CalendarClock className="size-4 shrink-0" />
              <span>
                Due <span className="tnum">{fmtDate(inv.dueAt)}</span>
              </span>
            </div>
          )}

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Line items
            </h3>
            <div className="overflow-hidden rounded-lg border">
              <Table>
                <THead>
                  <TR className="hover:bg-transparent">
                    <TH>Item</TH>
                    <TH className="text-right">Qty</TH>
                    <TH className="text-right">Unit</TH>
                    <TH className="text-right">Amount</TH>
                  </TR>
                </THead>
                <TBody>
                  {items.length === 0 ? (
                    <TR className="hover:bg-transparent">
                      <TD
                        colSpan={4}
                        className="py-6 text-center text-sm text-muted-foreground"
                      >
                        No line items on this invoice.
                      </TD>
                    </TR>
                  ) : (
                    // Generated line items come back without ids — fall back to
                    // the index rather than keying every row `undefined`.
                    items.map((it, i) => (
                      <TR key={it.id ?? i}>
                        <TD className="font-medium">{it.name}</TD>
                        <TD className="text-right tnum">{it.qty}</TD>
                        <TD className="text-right tnum">{formatMoney(it.unitPrice)}</TD>
                        <TD className="text-right tnum font-medium">
                          {formatMoney(it.qty * it.unitPrice)}
                        </TD>
                      </TR>
                    ))
                  )}
                </TBody>
              </Table>
            </div>

            <dl className="mt-3 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Subtotal</dt>
                <dd className="tnum">{formatMoney(subtotal)}</dd>
              </div>
              {inv.tax != null && inv.tax > 0 && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Tax</dt>
                  <dd className="tnum">{formatMoney(inv.tax)}</dd>
                </div>
              )}
              <Separator className="my-2" />
              <div className="flex justify-between text-base font-semibold">
                <dt>Total</dt>
                <dd className="tnum">{formatMoney(inv.total)}</dd>
              </div>
            </dl>
          </section>

          {outstanding && (
            <div className="space-y-2">
              {onPay && (
                <Button className="w-full" onClick={() => onPay(inv)}>
                  <CreditCard className="size-4" /> Pay {formatMoney(inv.total)}
                </Button>
              )}
              <p className="text-center text-xs text-muted-foreground">
                Pay securely by card, or contact your school to settle another way.
              </p>
            </div>
          )}
        </div>
      )}
    </DetailPanel>
  );
}
