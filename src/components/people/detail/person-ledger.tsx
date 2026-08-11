import { useMemberLedger } from "@/features/queries";
import { formatDate, formatMoney } from "@/lib/utils";
import { DetailCard, CardEmpty, CardSkeleton } from "@/components/detail/detail-page";

const SHOWN = 12;

function entryLabel(type: string): string {
  switch (type) {
    case "topup":
      return "Top-up";
    case "cash":
      return "Cash";
    case "check":
      return "Check";
    case "other":
      return "Other credit";
    case "adjustment":
      return "Adjustment";
    case "flight_charge":
      return "Flight";
    case "item_charge":
      return "Charge";
    case "fee":
      return "Fee";
    case "refund":
      return "Refund";
    case "reversal":
      return "Reversal";
    default:
      return type;
  }
}

/**
 * Read-only account ledger for a member (ledger billing mode).
 * Hidden when the org is not in ledger mode.
 */
export function PersonLedger({ orgUserId }: { orgUserId: number }) {
  const q = useMemberLedger(orgUserId);

  if (q.isPending) {
    return (
      <DetailCard title="Account ledger" description="Running balance and recent entries.">
        <CardSkeleton rows={3} />
      </DetailCard>
    );
  }

  if (q.isError) {
    return (
      <DetailCard title="Account ledger" description="Running balance and recent entries.">
        <CardEmpty>Couldn&apos;t load the ledger.</CardEmpty>
      </DetailCard>
    );
  }

  const ledger = q.data;
  if (!ledger?.ledgerEnabled) {
    return null;
  }

  const entries = ledger.entries.slice(0, SHOWN);
  const balance = ledger.balanceCents;

  return (
    <DetailCard
      title="Account ledger"
      description={
        balance >= 0
          ? `Credit on account: ${formatMoney(balance)}`
          : `Amount owed: ${formatMoney(-balance)}`
      }
      bodyClassName="px-0 pb-0"
    >
      {entries.length === 0 ? (
        <div className="px-4 pb-4">
          <CardEmpty>No ledger entries yet.</CardEmpty>
        </div>
      ) : (
        <ul className="divide-y divide-border border-t border-border">
          {entries.map((entry) => (
            <li key={entry.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <div className="min-w-0">
                <div className="text-[13px] font-medium">{entryLabel(entry.type)}</div>
                <div className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                  {formatDate(entry.createdAt)}
                  {entry.memo ? ` · ${entry.memo}` : ""}
                </div>
              </div>
              <span
                className={`shrink-0 text-[13px] font-semibold tabular-nums ${
                  entry.amountCents < 0 ? "text-foreground" : "text-emerald-700 dark:text-emerald-400"
                }`}
              >
                {entry.amountCents > 0 ? "+" : ""}
                {formatMoney(entry.amountCents)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {ledger.entries.length > SHOWN && (
        <p className="border-t border-border px-4 py-2.5 text-[13px] text-muted-foreground">
          Showing {SHOWN} of {ledger.entries.length}.
        </p>
      )}
    </DetailCard>
  );
}
