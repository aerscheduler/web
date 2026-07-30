import { format, parseISO } from "date-fns";
import { Ban, Bell, Check, FileText, Plane, User } from "lucide-react";
import type { Invoice } from "@/types/api";
import { useInvoice } from "@/features/queries";
import { resourceLabel } from "@/types/api";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { InvoiceStatusBadge } from "@/components/billing/invoice-status";
import { InvoiceQuickBooksSection } from "@/components/billing/invoice-qbo-section";
import { formatMoney } from "@/lib/utils";

function fmt(iso: string | null | undefined) {
  return iso ? format(parseISO(iso), "MMM d, yyyy 'at' h:mm a") : null;
}

type Event = { label: string; at: string };

function participants(inv: Invoice): string[] {
  const p = inv.reservation?.personnel;
  if (!p) return [];
  return [
    ...(p.instructors ?? []).map((x) => x.user?.name),
    ...(p.students ?? []).map((x) => x.user?.name),
    ...(p.renters ?? []).map((x) => x.user?.name),
    ...(p.guests ?? []).map((x) => x.name),
  ].filter((n): n is string => Boolean(n));
}

/** Read-only invoice drawer: line items, totals, and an audit trail. */
export function InvoiceDetailSheet({
  invoice,
  open,
  onOpenChange,
  onMarkPaid,
  onVoid,
  onRemind,
  busy,
}: {
  invoice: Invoice | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMarkPaid: (inv: Invoice) => void;
  onVoid: (inv: Invoice) => void;
  onRemind?: (inv: Invoice) => void;
  busy?: boolean;
}) {
  const inv = invoice;
  const customerName = inv?.customer?.user?.name ?? inv?.customer?.user?.email ?? "No customer";
  //The LIST endpoint doesn't select line items — only GET /invoices/:id does — so the
  //row handed in from the table always has `items` undefined and the drawer rendered
  //"No line items on this invoice." for every invoice. Hydrate from the single-invoice
  //endpoint and fall back to the list row while it loads, so the header, totals and
  //status never flash empty.
  const full = useInvoice(open ? (inv?.id ?? null) : null);
  const display: Invoice | null =
    inv == null
      ? null
      : full.data?.id === inv.id
        ? { ...inv, ...full.data }
        : inv;
  const items = display?.items ?? [];
  const subtotal = display?.subtotal ?? items.reduce((s, it) => s + it.qty * it.unitPrice, 0);

  const events: Event[] = [];
  if (inv) {
    events.push({ label: "Invoice created", at: inv.createdAt });
    if (inv.reservation?.createdAt)
      events.push({ label: "Flight booked", at: inv.reservation.createdAt });
    if (inv.dueAt) events.push({ label: "Payment due", at: inv.dueAt });
    if (inv.paidAt) events.push({ label: "Marked paid", at: inv.paidAt });
    if (inv.voidedAt) events.push({ label: "Voided", at: inv.voidedAt });
  }
  events.sort((a, b) => a.at.localeCompare(b.at));

  const people = inv ? participants(inv) : [];
  const isOpen = inv ? !inv.paidAt && !inv.voidedAt : false;
  const canRemind = Boolean(isOpen && inv?.customer && onRemind);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-md">
        <SheetHeader>
          <div className="flex items-center justify-between gap-3">
            <SheetTitle className="font-mono">Invoice #{inv?.id}</SheetTitle>
            {display && <InvoiceStatusBadge invoice={display} />}
          </div>
          <SheetDescription>{customerName}</SheetDescription>
        </SheetHeader>

        {display && (
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 pb-4">
            {display.memo && <p className="text-sm text-muted-foreground">{display.memo}</p>}

            <InvoiceQuickBooksSection invoice={display} />

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
                        <TD colSpan={4} className="py-6 text-center text-sm text-muted-foreground">
                          {full.isLoading
                            ? "Loading line items…"
                            : "No line items on this invoice."}
                        </TD>
                      </TR>
                    ) : (
                      items.map((it) => (
                        <TR key={it.id}>
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
                {display.tax != null && display.tax > 0 && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Tax</dt>
                    <dd className="tnum">{formatMoney(display.tax)}</dd>
                  </div>
                )}
                <Separator className="my-2" />
                <div className="flex justify-between text-base font-semibold">
                  <dt>Total</dt>
                  <dd className="tnum">{formatMoney(display.total)}</dd>
                </div>
              </dl>
            </section>

            {display.reservation && (
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Linked flight
                </h3>
                <div className="space-y-2 rounded-lg border p-3 text-sm">
                  <div className="flex items-center gap-2 font-medium">
                    <FileText className="size-4 shrink-0 text-muted-foreground" />
                    {display.reservation.title}
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <span className="tnum">
                      {format(parseISO(display.reservation.start), "MMM d, yyyy 'at' h:mm a")}
                    </span>
                  </div>
                  {display.reservation.resource && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Plane className="size-4 shrink-0" />
                      {resourceLabel(display.reservation.resource).name}
                    </div>
                  )}
                  {people.length > 0 && (
                    <div className="flex items-start gap-2 text-muted-foreground">
                      <User className="mt-0.5 size-4 shrink-0" />
                      <span>{people.join(", ")}</span>
                    </div>
                  )}
                </div>
              </section>
            )}

            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Audit trail
              </h3>
              <ol className="space-y-3">
                {events.map((e, i) => (
                  <li key={i} className="flex gap-3 text-sm">
                    <span
                      className="mt-1.5 size-2 shrink-0 rounded-full bg-primary"
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      <div className="font-medium">{e.label}</div>
                      <div className="tnum text-xs text-muted-foreground">{fmt(e.at)}</div>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        )}

        {inv && isOpen && (
          <SheetFooter className="flex-col gap-2 border-t sm:flex-col">
            {canRemind && (
              <Button
                variant="secondary"
                className="w-full"
                disabled={busy}
                onClick={() => onRemind?.(inv)}
              >
                <Bell className="size-4" /> Send payment reminder
              </Button>
            )}
            <div className="flex w-full flex-row gap-2">
              <Button
                variant="outline"
                className="flex-1"
                disabled={busy}
                onClick={() => onVoid(inv)}
              >
                <Ban className="size-4" /> Void
              </Button>
              <Button className="flex-1" disabled={busy} onClick={() => onMarkPaid(inv)}>
                <Check className="size-4" /> Mark paid
              </Button>
            </div>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}
