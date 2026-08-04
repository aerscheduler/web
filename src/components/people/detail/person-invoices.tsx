import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import type { Invoice } from "@/types/api";
import { useMemberInvoices, type ReportRange } from "@/features/queries";
import { formatDate, formatMoney } from "@/lib/utils";
import { DetailCard, CardEmpty, CardSkeleton } from "@/components/detail/detail-page";
import { InvoiceStatusBadge, invoiceStatus } from "@/components/billing/invoice-status";
import { MemberInvoiceSheet } from "@/components/me-money/member-invoice-sheet";
import { PayInvoiceDialog } from "@/components/me-money/pay-invoice-dialog";
import { Button } from "@/components/ui/button";

const SHOWN = 8;

/**
 * This person's invoices.
 *
 * Outstanding ones float to the top regardless of date — the reason anyone opens
 * this card is to find out what's owed, and burying a 60-day-old unpaid invoice
 * under last week's paid ones is how it stays unpaid.
 *
 * `onPay` is only wired when the viewer IS this person: paying runs against the
 * org's connected Stripe account with the member's own card, and an admin
 * clicking "Pay now" on someone else's invoice would be charging a card that
 * isn't theirs.
 */
export function PersonInvoices({
  orgUserId,
  range,
  isSelf,
}: {
  orgUserId: number;
  range: ReportRange | undefined;
  isSelf: boolean;
}) {
  const q = useMemberInvoices(orgUserId, range);
  const [viewing, setViewing] = useState<Invoice | null>(null);
  const [paying, setPaying] = useState<Invoice | null>(null);

  const invoices = useMemo(() => {
    const rows = [...(q.data ?? [])];
    rows.sort((a, b) => {
      const aOut = invoiceStatus(a).key === "outstanding";
      const bOut = invoiceStatus(b).key === "outstanding";
      if (aOut !== bOut) return aOut ? -1 : 1;
      return (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
    });
    return rows;
  }, [q.data]);

  const shown = invoices.slice(0, SHOWN);

  return (
    <>
      <DetailCard
        title="Invoices"
        description="Outstanding first, then most recent."
        action={
          isSelf ? (
            <Button variant="outline" size="sm" asChild>
              <Link to="/me/invoices">View all</Link>
            </Button>
          ) : (
            <Button variant="outline" size="sm" asChild>
              <Link to="/billing">Billing</Link>
            </Button>
          )
        }
        bodyClassName="px-0 pb-0"
      >
        {q.isPending ? (
          <div className="px-4 pb-4">
            <CardSkeleton rows={3} />
          </div>
        ) : q.isError ? (
          <div className="px-4 pb-4">
            <CardEmpty>Couldn&apos;t load invoices.</CardEmpty>
          </div>
        ) : shown.length === 0 ? (
          <div className="px-4 pb-4">
            <CardEmpty>No invoices in this window.</CardEmpty>
          </div>
        ) : (
          <ul className="divide-y divide-border border-t border-border">
            {shown.map((inv) => (
              <li key={inv.id}>
                <button
                  type="button"
                  onClick={() => setViewing(inv)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors hover:bg-accent/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  <div className="min-w-0">
                    <div className="font-mono text-[13px] font-medium">#{inv.id}</div>
                    <div className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                      {formatDate(inv.createdAt)}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <InvoiceStatusBadge invoice={inv} />
                    <span className="text-[13px] font-semibold tabular-nums">
                      {formatMoney(inv.total)}
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
        {invoices.length > SHOWN && (
          <p className="border-t border-border px-4 py-2.5 text-[13px] text-muted-foreground">
            Showing {SHOWN} of {invoices.length} in this window.
          </p>
        )}
      </DetailCard>

      <MemberInvoiceSheet
        invoice={viewing}
        open={viewing != null}
        onOpenChange={(o) => !o && setViewing(null)}
        onPay={
          isSelf
            ? (inv) => {
                setViewing(null);
                setPaying(inv);
              }
            : undefined
        }
      />
      <PayInvoiceDialog
        invoice={paying}
        open={paying != null}
        onOpenChange={(o) => !o && setPaying(null)}
      />
    </>
  );
}
