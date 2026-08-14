import type { ReactNode } from "react";
import { ledgerEntryLabel, ledgerPostedByLabel } from "@/lib/ledger-labels";
import type { LedgerEntry } from "@/types/api";
import { formatMoney } from "@/lib/utils";
import { useTimeZone } from "@/lib/use-timezone";
import { DetailPanel } from "@/components/detail-panel";
import { Separator } from "@/components/ui/separator";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[7rem_1fr] gap-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

/**
 * Ledger row in the same right-hand panel as reservations and invoices.
 * Posted by is who moved the money (desk, the member on a card top-up, or System).
 */
export function LedgerEntryDetailSheet({
  entry,
  open,
  onOpenChange,
  onStep,
}: {
  entry: LedgerEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStep?: (delta: -1 | 1) => void;
}) {
  const cents = entry?.amountCents ?? 0;
  const tz = useTimeZone();
  const when = entry
    ? `${tz.date(entry.createdAt)} at ${tz.time(entry.createdAt)}${
        tz.differs(entry.createdAt) ? ` ${tz.label(entry.createdAt)}` : ""
      }`
    : undefined;
  return (
    <DetailPanel
      open={open}
      onOpenChange={onOpenChange}
      onStep={onStep}
      title={entry ? ledgerEntryLabel(entry.type) : "Entry"}
      description={when}
    >
      {entry && (
        <div className="space-y-5 pt-4">
          <p
            className={
              cents > 0
                ? "text-2xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-400"
                : "text-2xl font-semibold tabular-nums"
            }
          >
            {cents > 0 ? "+" : ""}
            {formatMoney(cents)}
          </p>

          <Separator />

          <dl className="space-y-2">
            <Row label="Posted by">{ledgerPostedByLabel(entry)}</Row>
            {entry.memo ? <Row label="Memo">{entry.memo}</Row> : null}
            {entry.refundMethod ? (
              <Row label="Method">
                {entry.refundMethod === "stripe" ? "Original card" : "Check / cash"}
              </Row>
            ) : null}
            {entry.reservationId ? (
              <Row label="Reservation">#{entry.reservationId}</Row>
            ) : null}
            {entry.stripePaymentIntentId ? (
              <Row label="Payment">
                <span className="break-all font-mono text-xs">{entry.stripePaymentIntentId}</span>
              </Row>
            ) : null}
            {entry.stripeRefundId ? (
              <Row label="Stripe refund">
                <span className="break-all font-mono text-xs">{entry.stripeRefundId}</span>
              </Row>
            ) : null}
            {entry.reversesId ? <Row label="Reverses">#{entry.reversesId}</Row> : null}
            {entry.reversedBy ? <Row label="Reversed by">#{entry.reversedBy.id}</Row> : null}
          </dl>

          {entry.items.length > 0 || entry.memo ? (
            <>
              <Separator />
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Line items
                </h3>
                <ul className="space-y-1 text-sm">
                  {entry.items.length > 0
                    ? entry.items.map((item) => (
                        <li key={item.id} className="flex justify-between gap-3">
                          <span className="min-w-0 truncate">
                            {item.name}
                            {item.qty !== 1 ? ` × ${item.qty}` : ""}
                          </span>
                          <span className="tnum shrink-0">{formatMoney(item.qty * item.unitPrice)}</span>
                        </li>
                      ))
                    : (
                        <li className="flex justify-between gap-3">
                          <span className="min-w-0 truncate">{entry.memo}</span>
                          <span className="tnum shrink-0">{formatMoney(entry.amountCents)}</span>
                        </li>
                      )}
                </ul>
              </section>
            </>
          ) : null}
        </div>
      )}
    </DetailPanel>
  );
}
